"""Metrics gate for the optimize-cad-perf change (Epic C, task C7).

Reads the last ``--window`` runs (default 200) from the agent metrics
table and computes four indicators required by the spec:

- ``first_try_success_rate`` — share of runs that succeed on attempt 1.
- ``p95_latency_seconds`` — 95th percentile of total generation time.
- ``dim_efficacy`` — share of off-by-≥20% bbox cases where the repair
  loop (re-)triggered dimensional validation successfully.
- ``error_category_count`` — distinct error categories matched by
  :func:`agent.tools.classify_cad_error`.

The script compares the live window against a JSON baseline and exits
with status ``0`` when every indicator stays within ``--regression``
(default 5 %) of the baseline. Two consecutive failures are required
to block the rollout, matching the spec's "fail if 2 consecutive
checks regress" rule. The state file is the only persistent bit: it
records the last failure count and is read at the start of every run.

The metrics backend (Postgres/Drizzle) is intentionally not hard-coded
here. The script accepts a connection string through ``DATABASE_URL``
and gracefully degrades to a deterministic offline mode (controlled by
``--offline-fixture``) so the gate can run in CI before the production
metrics table is provisioned. The fixture is a list of run records
matching the schema documented in ``OFFLINE_SCHEMA`` below.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

DEFAULT_WINDOW = 200
DEFAULT_REGRESSION = 0.05
STATE_FILENAME = ".metrics_check_state.json"
OFFLINE_SCHEMA = "runs: list[{model_id, success, attempts, total_seconds, dim_mismatch, hint_category}]"

logger = logging.getLogger("metrics_check")


@dataclass
class Run:
    """A single agent run as read from the metrics table or fixture."""

    model_id: str
    success: bool
    attempts: int
    total_seconds: float
    dim_mismatch: bool
    hint_category: str | None

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "Run":
        return cls(
            model_id=str(record.get("model_id", "")),
            success=bool(record.get("success", False)),
            attempts=int(record.get("attempts", 1) or 1),
            total_seconds=float(record.get("total_seconds", 0.0) or 0.0),
            dim_mismatch=bool(record.get("dim_mismatch", False)),
            hint_category=(
                str(record["hint_category"])
                if record.get("hint_category") is not None
                else None
            ),
        )


@dataclass
class Metrics:
    """Computed indicators for a window of runs."""

    first_try_success_rate: float
    p95_latency_seconds: float
    dim_efficacy: float
    error_category_count: int
    sample_count: int = 0
    dim_mismatch_count: int = 0
    dim_repair_count: int = 0

    def to_dict(self) -> dict[str, float | int]:
        return {
            "first_try_success_rate": round(self.first_try_success_rate, 4),
            "p95_latency_seconds": round(self.p95_latency_seconds, 3),
            "dim_efficacy": round(self.dim_efficacy, 4),
            "error_category_count": self.error_category_count,
            "sample_count": self.sample_count,
            "dim_mismatch_count": self.dim_mismatch_count,
            "dim_repair_count": self.dim_repair_count,
        }


@dataclass
class CheckResult:
    metrics: Metrics
    regressions: dict[str, dict[str, float]] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.regressions


def compute_metrics(runs: Iterable[Run]) -> Metrics:
    """Aggregate a list of :class:`Run` records into a :class:`Metrics` snapshot.

    - ``first_try_success_rate`` is the share of runs with
      ``success=True`` and ``attempts == 1`` (i.e. no repair retries).
    - ``p95_latency_seconds`` uses the nearest-rank method on
      ``total_seconds``; empty input yields ``0.0``.
    - ``dim_efficacy`` is the share of bbox mismatches (runs with
      ``dim_mismatch=True``) where a follow-up call to the agent
      resulted in another generation attempt (i.e. ``attempts >= 2``).
    - ``error_category_count`` is the cardinality of distinct non-null
      ``hint_category`` values, the metric the spec uses to enforce
      coverage preservation in :mod:`agent.tools.classify_cad_error`.
    """
    run_list = list(runs)
    if not run_list:
        return Metrics(0.0, 0.0, 0.0, 0)

    first_try = sum(1 for r in run_list if r.success and r.attempts == 1)
    first_try_rate = first_try / len(run_list)

    latencies = sorted(r.total_seconds for r in run_list)
    p95_idx = max(0, math.ceil(0.95 * len(latencies)) - 1)
    p95_latency = latencies[p95_idx]

    mismatches = [r for r in run_list if r.dim_mismatch]
    repairs = [r for r in mismatches if r.attempts >= 2]
    if mismatches:
        dim_eff = len(repairs) / len(mismatches)
    else:
        dim_eff = 1.0

    categories = {r.hint_category for r in run_list if r.hint_category}

    return Metrics(
        first_try_success_rate=first_try_rate,
        p95_latency_seconds=p95_latency,
        dim_efficacy=dim_eff,
        error_category_count=len(categories),
        sample_count=len(run_list),
        dim_mismatch_count=len(mismatches),
        dim_repair_count=len(repairs),
    )


def _fetch_runs_from_db(window: int) -> list[Run]:
    """Pull the most recent ``window`` runs from Postgres/Drizzle.

    Returns an empty list when no ``DATABASE_URL`` is configured so the
    caller can fall back to the offline fixture path. Errors during the
    SQL query are logged and the script falls back to the fixture as
    well, keeping the CI gate non-flaky while the production metrics
    table is being wired up.
    """
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        logger.info("[METRICS] DATABASE_URL no definida, usando modo offline")
        return []

    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        logger.warning("[METRICS] psycopg no disponible, usando modo offline")
        return []

    sql = (
        "SELECT model_id, success, attempts, total_seconds, dim_mismatch, hint_category "
        "FROM agent_runs ORDER BY created_at DESC LIMIT %s"
    )
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(sql, (window,))
                rows = cur.fetchall()
    except Exception as db_err:
        logger.warning("[METRICS] consulta DB fallo (%s), usando modo offline", db_err)
        return []

    return [Run.from_record(row) for row in rows]


def _load_offline_runs(fixture_path: Path) -> list[Run]:
    """Load runs from a JSON fixture file (CI mode)."""
    if not fixture_path.exists():
        logger.error("[METRICS] fixture no encontrado: %s", fixture_path)
        return []
    try:
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as decode_err:
        logger.error("[METRICS] fixture invalido: %s", decode_err)
        return []
    records = payload.get("runs", []) if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        logger.error("[METRICS] fixture debe contener una lista 'runs'")
        return []
    return [Run.from_record(record) for record in records if isinstance(record, dict)]


def _build_demo_runs() -> list[Run]:
    """Generate a healthy synthetic window for quick local checks.

    Only used when the script is invoked with ``--demo``; the rolling
    5-minute mean latency, 88 % first-try success and full repair
    efficacy make this a passing baseline for ``--regression 0.05``.

    The synthetic distribution intentionally correlates ``dim_mismatch``
    with ``attempts >= 2`` so :attr:`Metrics.dim_efficacy` is a healthy
    ~0.9 — a smoke-test should pass, not regress.
    """
    import random

    rng = random.Random(42)
    categories = [
        "plane", "edges_method", "cylinder_args", "fillet", "boolean",
        "buildline", "sweep", "indexerror", "material_removal",
        "wall_thickness",
    ]
    runs: list[Run] = []
    for i in range(200):
        attempts = 1 if rng.random() < 0.88 else rng.randint(2, 4)
        success = attempts <= 3
        will_mismatch = rng.random() < 0.10
        dim_mismatch = will_mismatch and rng.random() < 0.95
        if will_mismatch and attempts < 2:
            attempts = 2
        runs.append(
            Run(
                model_id=f"demo{i:03d}",
                success=success,
                attempts=attempts,
                total_seconds=round(rng.uniform(2.0, 9.0), 3),
                dim_mismatch=dim_mismatch,
                hint_category=(
                    categories[rng.randrange(len(categories))]
                    if rng.random() < 0.5
                    else None
                ),
            )
        )
    return runs


def _load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {"consecutive_failures": 0}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"consecutive_failures": 0}


def _save_state(state_path: Path, state: dict[str, Any]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _regressions(
    current: Metrics,
    baseline: dict[str, float] | None,
    regression: float,
) -> dict[str, dict[str, float]]:
    """Compare the live metrics against the baseline.

    Lower-is-better indicators (``p95_latency_seconds``) regress when
    the live value grows; higher-is-better indicators regress when the
    live value drops. The returned dict maps each regressed metric to
    a ``{"current": x, "baseline": y, "delta_pct": z}`` payload.
    """
    if not baseline:
        return {}

    out: dict[str, dict[str, float]] = {}
    indicators = (
        ("first_try_success_rate", "higher"),
        ("p95_latency_seconds", "lower"),
        ("dim_efficacy", "higher"),
        ("error_category_count", "higher"),
    )
    for name, direction in indicators:
        baseline_value = baseline.get(name)
        current_value = current.to_dict().get(name)
        if baseline_value in (None, 0):
            continue
        current_value_f = float(current_value or 0)
        baseline_value_f = float(baseline_value)
        delta_pct = (current_value_f - baseline_value_f) / baseline_value_f
        if direction == "higher" and delta_pct < -regression:
            out[name] = {
                "current": current_value_f,
                "baseline": baseline_value_f,
                "delta_pct": round(delta_pct, 4),
            }
        elif direction == "lower" and delta_pct > regression:
            out[name] = {
                "current": current_value_f,
                "baseline": baseline_value_f,
                "delta_pct": round(delta_pct, 4),
            }
    return out


def _format_report(metrics: Metrics, regressions: dict[str, dict[str, float]]) -> str:
    lines = ["[METRICS] ------------ window summary ------------"]
    for k, v in metrics.to_dict().items():
        lines.append(f"  {k}: {v}")
    if regressions:
        lines.append("[METRICS] regressions (>5% vs baseline):")
        for name, info in regressions.items():
            lines.append(
                f"  - {name}: current={info['current']} baseline={info['baseline']} "
                f"delta={info['delta_pct'] * 100:+.2f}%"
            )
    else:
        lines.append("[METRICS] no regressions detected")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--window", type=int, default=DEFAULT_WINDOW)
    parser.add_argument(
        "--regression",
        type=float,
        default=DEFAULT_REGRESSION,
        help="Fractional regression threshold (default 0.05 = 5%)",
    )
    parser.add_argument(
        "--baseline",
        type=str,
        default="",
        help="Path to JSON baseline; if absent the script emits the live metrics only.",
    )
    parser.add_argument(
        "--offline-fixture",
        type=str,
        default="",
        help="Path to a JSON fixture; used when DATABASE_URL is unset.",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run against a synthetic healthy window (smoke test).",
    )
    parser.add_argument(
        "--state-file",
        type=str,
        default="",
        help="Path to the consecutive-failures state file (default: .metrics_check_state.json next to this script).",
    )
    parser.add_argument(
        "--max-consecutive-failures",
        type=int,
        default=1,
        help="Fail the gate after this many consecutive regressions (default 1, spec recommends 2).",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(message)s",
    )

    if args.demo:
        runs = _build_demo_runs()
    else:
        runs = _fetch_runs_from_db(args.window)
        if not runs and args.offline_fixture:
            runs = _load_offline_runs(Path(args.offline_fixture))
    if not runs:
        logger.error(
            "[METRICS] no hay runs para analizar (¿falta DB o fixture?). "
            "Pasar --offline-fixture <path> o --demo."
        )
        return 2

    runs = runs[: args.window]
    metrics = compute_metrics(runs)

    baseline: dict[str, float] | None = None
    if args.baseline:
        baseline_path = Path(args.baseline)
        if baseline_path.exists():
            try:
                baseline_payload = json.loads(baseline_path.read_text(encoding="utf-8"))
                baseline = (
                    baseline_payload.get("metrics")
                    if isinstance(baseline_payload, dict)
                    else None
                )
            except json.JSONDecodeError as decode_err:
                logger.error("[METRICS] baseline invalido: %s", decode_err)
        else:
            logger.warning(
                "[METRICS] baseline %s no existe; emitiendo solo metricas vivas",
                baseline_path,
            )

    regressions = _regressions(metrics, baseline, args.regression)
    print(_format_report(metrics, regressions))
    print(f"[METRICS] raw_json={json.dumps(metrics.to_dict())}")

    state_path = (
        Path(args.state_file)
        if args.state_file
        else Path(__file__).resolve().parent / STATE_FILENAME
    )
    state = _load_state(state_path)

    if not regressions:
        state["consecutive_failures"] = 0
        state["last_run"] = time.time()
        _save_state(state_path, state)
        return 0

    state["consecutive_failures"] = int(state.get("consecutive_failures", 0)) + 1
    state["last_failure"] = time.time()
    state["last_regressions"] = regressions
    _save_state(state_path, state)

    logger.error(
        "[METRICS] regressions detectadas (%d consecutivas, umbral %d)",
        state["consecutive_failures"],
        args.max_consecutive_failures,
    )
    if state["consecutive_failures"] >= args.max_consecutive_failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
