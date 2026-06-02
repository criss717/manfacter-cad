"""Geometry inspection — extracts facts from STEP files or in-memory shapes.

Two entry points:

- ``inspect_shape(shape)`` reads bbox, faces, edges, solids directly from
  an OCP ``TopoDS_Shape``. This is the Epic B path: ``generate_cad``
  retains the in-memory shape and reuses it for repeated inspections so
  we skip the ``STEPControl_Reader`` round-trip.
- ``inspect_step(path)`` is the legacy fallback used when a STEP file is
  inspected outside of the originating session (handle released, manual
  upload, etc.).

Epic C additions:

- :func:`compute_dimensional_check` compares the inspection ``size`` dict
  against user-supplied expected dimensions and returns a
  ``dimensional_check`` payload with per-axis deviations. Used by
  ``backend/agent/tools.py`` to attach a repair hint when the deviation
  exceeds the configured threshold.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def _to_ocp_shape(shape: Any) -> Any:
    """Unwrap a build123d shape to its underlying OCP ``TopoDS_Shape``."""
    if hasattr(shape, "wrapped"):
        return shape.wrapped
    return shape


def inspect_shape(shape: Any) -> dict[str, Any]:
    """Inspect an in-memory OCP ``TopoDS_Shape`` (no disk I/O)."""
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_SOLID
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box

    ocp_shape = _to_ocp_shape(shape)

    bbox = Bnd_Box()
    BRepBndLib.Add_s(ocp_shape, bbox)
    xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()

    faces = 0
    exp = TopExp_Explorer(ocp_shape, TopAbs_FACE)
    while exp.More():
        faces += 1
        exp.Next()

    edges = 0
    exp = TopExp_Explorer(ocp_shape, TopAbs_EDGE)
    while exp.More():
        edges += 1
        exp.Next()

    solids = 0
    exp = TopExp_Explorer(ocp_shape, TopAbs_SOLID)
    while exp.More():
        solids += 1
        exp.Next()

    return {
        "bbox": {
            "x": [round(xmin, 2), round(xmax, 2)],
            "y": [round(ymin, 2), round(ymax, 2)],
            "z": [round(zmin, 2), round(zmax, 2)],
        },
        "faces": faces,
        "edges": edges,
        "solids": solids,
        "size": {
            "dx": round(xmax - xmin, 2),
            "dy": round(ymax - ymin, 2),
            "dz": round(zmax - zmin, 2),
        },
    }


def inspect_step(step_path: Path) -> dict[str, Any]:
    """Read a STEP file from disk and inspect the resulting shape."""
    from OCP.STEPControl import STEPControl_Reader

    reader = STEPControl_Reader()
    status = reader.ReadFile(str(step_path))
    if status != 1:
        raise RuntimeError(f"Failed to read STEP file: {step_path}")

    reader.TransferRoots()
    return inspect_shape(reader.OneShape())


_AXIS_KEYS: tuple[str, ...] = ("x", "y", "z")


def compute_dimensional_check(
    facts: dict[str, Any],
    expected_dims: dict[str, float] | None,
    threshold: float = 0.20,
) -> dict[str, Any] | None:
    """Compare inspection ``size`` against user-supplied expected dims.

    Args:
        facts: Output of :func:`inspect_shape` (or compatible). The
            ``size`` sub-dict with ``dx`` / ``dy`` / ``dz`` keys is the
            authoritative source for actual bbox extents.
        expected_dims: Dict produced by :func:`agent.prompt.extract_expected_dims`.
            Only the ``x`` / ``y`` / ``z`` triple is compared; bolt
            diameters and named features are intentionally ignored here
            because the bbox orientation is not stable enough to map
            them deterministically.
        threshold: Maximum allowed fractional deviation per axis. The
            default ``0.20`` matches the spec (``DIMENSIONAL_THRESHOLD``).

    Returns:
        A ``dimensional_check`` payload::

            {
                "expected":  {"x": 100.0, "y": 60.0, "z": 20.0},
                "actual":    {"x": 80.0,  "y": 60.0, "z": 20.0},
                "deviations":{"x": 0.20,  "y": 0.0,  "z": 0.0},
                "pass":      False,
            }

        or ``None`` when no axis-mapped expectations are available
        (no triple ``x``/``y``/``z`` was extracted from the request).
    """
    if not expected_dims or not facts:
        return None

    size = facts.get("size") or {}
    actual = {axis: float(size.get(f"d{axis}", 0.0)) for axis in _AXIS_KEYS}

    expected: dict[str, float] = {}
    for axis in _AXIS_KEYS:
        value = expected_dims.get(axis)
        if value is None:
            continue
        try:
            expected[axis] = float(value)
        except (TypeError, ValueError):
            continue

    if not expected:
        return None

    deviations: dict[str, float] = {}
    for axis, exp in expected.items():
        if exp <= 0:
            deviations[axis] = 0.0
            continue
        deviations[axis] = round(abs(actual.get(axis, 0.0) - exp) / exp, 4)

    return {
        "expected": {k: round(v, 3) for k, v in expected.items()},
        "actual": {k: round(v, 3) for k, v in actual.items()},
        "deviations": deviations,
        "pass": all(dev < float(threshold) for dev in deviations.values()),
    }


__all__ = ["compute_dimensional_check", "inspect_shape", "inspect_step"]
