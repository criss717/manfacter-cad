"""
Geometry inspection — extracts facts from generated STEP files.
"""

from pathlib import Path
from typing import Any


def inspect_step(step_path: Path) -> dict[str, Any]:
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_SOLID
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box

    reader = STEPControl_Reader()
    status = reader.ReadFile(str(step_path))
    if status != 1:
        raise RuntimeError(f"Failed to read STEP file: {step_path}")

    reader.TransferRoots()
    shape = reader.OneShape()

    bbox = Bnd_Box()
    BRepBndLib.Add_s(shape, bbox)
    xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()

    faces = 0
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        faces += 1
        exp.Next()

    edges = 0
    exp = TopExp_Explorer(shape, TopAbs_EDGE)
    while exp.More():
        edges += 1
        exp.Next()

    solids = 0
    exp = TopExp_Explorer(shape, TopAbs_SOLID)
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
