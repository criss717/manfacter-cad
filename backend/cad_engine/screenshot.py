"""
Screenshot renderer — captures PNG from GLB/STL using trimesh.
"""

from pathlib import Path


def render_screenshot(model_path: Path, output_path: Path, resolution: tuple[int, int] = (800, 600)) -> Path | None:
    import trimesh
    import numpy as np
    from PIL import Image

    try:
        mesh = trimesh.load(str(model_path))
        if isinstance(mesh, trimesh.Scene):
            scene = mesh
        else:
            scene = trimesh.Scene(mesh)

        data = scene.save_image(resolution=resolution, visible=True)
        if isinstance(data, bytes):
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)
        else:
            img = Image.fromarray(data)
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(str(output_path), "PNG")
        return output_path
    except Exception as e:
        print(f"[WARN] Screenshot render failed: {e}")
        return None
