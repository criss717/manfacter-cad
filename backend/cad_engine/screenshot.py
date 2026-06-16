"""
Screenshot renderer — captures PNG from GLB/STL using trimesh.

Supports single-view (render_screenshot) and multi-view (render_multiview_snapshots)
for visual inspection of generated CAD models.
"""

import math
from pathlib import Path


def render_screenshot(model_path: Path, output_path: Path, resolution: tuple[int, int] = (800, 600)) -> Path | None:
    import trimesh
    from PIL import Image

    try:
        mesh = trimesh.load(str(model_path))
        if isinstance(mesh, trimesh.Scene):
            scene = mesh
        else:
            scene = trimesh.Scene(mesh)

        data = scene.save_image(resolution=resolution, visible=False)
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


# ── Multi-view snapshot views ─────────────────────────────────────────────────
# Camera angles (radians) for 5 canonical inspection views.
# Trimesh default camera looks from +Z toward origin with Y up.
_VIEW_ANGLES: dict[str, tuple[float, float, float]] = {
    "front":  (0.0,           0.0,           0.0),
    "back":   (0.0,           math.pi,       0.0),
    "left":   (0.0,           -math.pi / 2,  0.0),
    "right":  (0.0,           math.pi / 2,   0.0),
    "bottom": (-math.pi / 2,  0.0,           0.0),
}

# How many times the model's bounding sphere radius to set as camera distance.
_VIEW_DISTANCE_FACTOR = 2.5


def render_multiview_snapshots(
    model_path: Path,
    output_dir: Path,
    resolution: tuple[int, int] = (1024, 768),
    views: tuple[str, ...] = ("front", "back", "left", "right", "bottom"),
) -> dict[str, Path]:
    """Render multiple canonical views of a 3D model for visual inspection.

    Generates one PNG per view by repositioning the trimesh camera before
    each render.  Returns a dict mapping view name to the saved file path.
    Views that fail to render are omitted from the result.
    """
    import trimesh
    from PIL import Image

    mesh = trimesh.load(str(model_path))
    if isinstance(mesh, trimesh.Scene):
        scene = mesh
    else:
        scene = trimesh.Scene(mesh)

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Use a single bounding-sphere distance for all views so the scale is
    # consistent across the set.
    scale = getattr(scene, "scale", 1.0)
    distance = scale * _VIEW_DISTANCE_FACTOR
    if distance <= 0:
        distance = 5.0

    results: dict[str, Path] = {}
    for name in views:
        angles = _VIEW_ANGLES.get(name)
        if angles is None:
            continue
        try:
            scene.set_camera(angles=angles, distance=distance, resolution=resolution)
            data = scene.save_image(resolution=resolution, visible=False)

            out_path = output_dir / f"view_{name}.png"
            if isinstance(data, bytes):
                out_path.write_bytes(data)
            else:
                Image.fromarray(data).save(str(out_path), "PNG")
            results[name] = out_path
        except Exception as exc:
            print(f"[SCREENSHOT] View '{name}' failed: {exc}")

    return results
