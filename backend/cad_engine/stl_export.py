"""
STL export using OpenCASCADE StlAPI_Writer.
"""

from pathlib import Path


def export_stl(shape, output_path: Path) -> Path:
    from OCP.StlAPI import StlAPI_Writer

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if hasattr(shape, "wrapped"):
        topods = shape.wrapped
    else:
        topods = shape

    writer = StlAPI_Writer()
    writer.Write(topods, str(output_path))

    return output_path
