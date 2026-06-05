"""Feature flags for optimize-cad-perf epics.

Each flag is read from an environment variable at call time so that
toggling can happen without redeploying the agent process. Defaults to
``True`` for every epic so the optimizations are active out of the box.

Usage::

    from agent.feature_flags import is_epic_a_enabled

    if is_epic_a_enabled():
        ...

Disabling a flag reverts that epic to legacy behaviour at request time:

- ``EPIC_A_ENABLED=false`` -> classifier returns ``MODERATE`` and the
  ``GOTCHAS`` block / tier directive are suppressed from the prompt.
- ``EPIC_B_ENABLED=false`` -> generator falls back to the dual-mesh
  path; export cache + parallel phase are skipped.
- ``EPIC_C_ENABLED=false`` -> ``run_cad_code`` keeps the ``code`` field,
  ``inspect_geometry`` returns full output, dimensional validation is
  skipped.
"""

from __future__ import annotations

import os

_TRUE_VALUES: frozenset[str] = frozenset({"1", "true", "yes", "on", "y", "t"})
_FALSE_VALUES: frozenset[str] = frozenset({"0", "false", "no", "off", "n", "f"})


def _read_bool_env(name: str, default: bool = True) -> bool:
    """Read a boolean environment variable with sane defaults.

    Unknown values fall back to ``default`` to avoid silent regressions
    when an operator typos the flag.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    return default


def is_epic_a_enabled() -> bool:
    """Epic A — prompt improvements + tier classifier + GOTCHAS block."""
    return _read_bool_env("EPIC_A_ENABLED", default=True)


def is_epic_b_enabled() -> bool:
    """Epic B — unified meshing, parallel STL/GLB export, GLB cache."""
    return _read_bool_env("EPIC_B_ENABLED", default=True)


def is_epic_c_enabled() -> bool:
    """Epic C — guardrails, model_id session map, dimensional validation."""
    return _read_bool_env("EPIC_C_ENABLED", default=True)


__all__ = [
    "is_epic_a_enabled",
    "is_epic_b_enabled",
    "is_epic_c_enabled",
]
