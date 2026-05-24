"""
STEP export using build123d + OpenCASCADE.
"""

from pathlib import Path
from typing import Any

from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.IFSelect import IFSelect_RetDone


def export_step(shape, output_path: Path) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if hasattr(shape, "wrapped"):
        topods = shape.wrapped
    else:
        topods = shape

    writer = STEPControl_Writer()
    Interface_Static.SetIVal_s("write.step.schema", 4)

    status = writer.Transfer(topods, STEPControl_AsIs)
    if status != IFSelect_RetDone:
        raise RuntimeError("STEP transfer failed")

    status = writer.Write(str(output_path))
    if status != IFSelect_RetDone:
        raise RuntimeError("STEP write failed")

    return output_path
