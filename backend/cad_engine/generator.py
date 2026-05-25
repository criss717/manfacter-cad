"""
CAD Generator - ejecuta build123d Python code y exporta STEP/STL/GLB.

Usa el exportador STEP XCAF de text-to-cad para preservar colores, labels
y estructura de assembly. GLB via trimesh con normales calculadas.
"""

import sys
import uuid
from pathlib import Path

import numpy as np

_TEXT_TO_CAD_SCRIPTS = (
    Path(__file__).resolve().parents[3] / "text-to-cad" / "skills" / "cad" / "scripts"
)
if str(_TEXT_TO_CAD_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_TEXT_TO_CAD_SCRIPTS))

OUTPUT_DIR = Path(__file__).parent.parent / "output"

_LINEAR_DEFLECTION = 0.05
_ANGULAR_DEFLECTION = 0.5


def _to_ocp_shape(shape):
    if hasattr(shape, "wrapped"):
        return shape.wrapped
    return shape


def _extract_trimesh(shape) -> "trimesh.Trimesh | None":
    """Extrae una malla de alta calidad desde un shape OCP usando BRepMesh."""
    import trimesh
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRep import BRep_Tool
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopoDS import TopoDS

    ocp_shape = _to_ocp_shape(shape)

    mesh_algo = BRepMesh_IncrementalMesh(ocp_shape, _LINEAR_DEFLECTION, False, _ANGULAR_DEFLECTION, True)
    mesh_algo.Perform()

    all_vertices = []
    all_faces = []
    vertex_offset = 0

    explorer = TopExp_Explorer(ocp_shape, TopAbs_FACE)
    while explorer.More():
      face = TopoDS.Face_s(explorer.Current())
      is_reversed = face.Orientation() == TopAbs_REVERSED
      loc = face.Location()

      try:
        triangulation = BRep_Tool.Triangulation_s(face, loc)
        if triangulation is None or triangulation.NbNodes() == 0:
          explorer.Next()
          continue
      except Exception:
        explorer.Next()
        continue

      trsf = loc.Transformation()
      nb_nodes = triangulation.NbNodes()
      face_vertices = []
      for i in range(1, nb_nodes + 1):
        node = triangulation.Node(i)
        p = node.Transformed(trsf)
        face_vertices.append([p.X(), p.Y(), p.Z()])
      all_vertices.extend(face_vertices)

      nb_triangles = triangulation.NbTriangles()
      for i in range(1, nb_triangles + 1):
        a, b, c = triangulation.Triangle(i).Get()
        if is_reversed:
          all_faces.append([
            a - 1 + vertex_offset,
            c - 1 + vertex_offset,
            b - 1 + vertex_offset,
          ])
        else:
          all_faces.append([
            a - 1 + vertex_offset,
            b - 1 + vertex_offset,
            c - 1 + vertex_offset,
          ])

      vertex_offset += nb_nodes
      explorer.Next()

    if not all_vertices:
        return None

    return trimesh.Trimesh(vertices=np.array(all_vertices, dtype=np.float64), faces=np.array(all_faces, dtype=np.int32))


def _export_step(shape, output_path: Path) -> Path:
    """STEP via XCAF (text-to-cad pipeline). Preserva colores, labels y estructura."""
    from common.step_export import export_build123d_step_scene

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_build123d_step_scene(shape, output_path)
    return output_path


def _export_glb(shape, output_path: Path) -> Path:
    tri_mesh = _extract_trimesh(shape)
    if tri_mesh is None:
        raise RuntimeError("No se pudo extraer malla de la geometria")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tri_mesh.export(str(output_path), file_type="glb")
    return output_path


def _export_stl(shape, output_path: Path) -> Path:
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.StlAPI import StlAPI_Writer

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ocp_shape = _to_ocp_shape(shape)

    mesh = BRepMesh_IncrementalMesh(ocp_shape, _LINEAR_DEFLECTION, False, _ANGULAR_DEFLECTION, True)
    mesh.Perform()

    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(ocp_shape, str(output_path)):
        raise RuntimeError("STL write failed")
    return output_path


def generate_cad(code: str, model_id: str | None = None) -> dict:
    mid = model_id or uuid.uuid4().hex[:12]
    output_dir = OUTPUT_DIR / mid
    output_dir.mkdir(parents=True, exist_ok=True)

    script_path = output_dir / "_script.py"
    script_path.write_text(code, encoding="utf-8")

    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(f"cad_model_{mid}", script_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"cad_model_{mid}"] = module
        spec.loader.exec_module(module)

        if not hasattr(module, "gen_step"):
            return {
                "success": False,
                "error": "El codigo debe definir una funcion gen_step() que devuelva una shape de build123d.",
                "model_id": mid,
            }

        shape = module.gen_step()

        if shape is None:
            return {
                "success": False,
                "error": "gen_step() devolvio None.",
                "model_id": mid,
            }

        step_path = output_dir / f"{mid}.step"
        _export_step(shape, step_path)

        stl_path = output_dir / f"{mid}.stl"
        try:
            _export_stl(shape, stl_path)
        except Exception as stl_e:
            stl_path = None
            print(f"[WARN] STL export failed: {stl_e}")

        glb_path = output_dir / f"{mid}.glb"
        try:
            _export_glb(shape, glb_path)
        except Exception as glb_e:
            print(f"[WARN] GLB export failed: {glb_e}")
            glb_path = None

        png_url = None
        # Screenshot requires offscreen rendering (pyrender/pyglet<2). 
        # Skip for now; facts provide enough validation data.
        # if glb_path:
        #     try:
        #         from cad_engine.screenshot import render_screenshot
        #         png_path = output_dir / f"{mid}.png"
        #         if render_screenshot(glb_path, png_path):
        #             png_url = f"/output/{mid}/{mid}.png"
        #     except Exception as scr_e:
        #         print(f"[WARN] Screenshot failed: {scr_e}")

        facts = None
        try:
            from cad_engine.inspect import inspect_step
            facts = inspect_step(step_path)
        except Exception as insp_e:
            print(f"[WARN] Inspection failed: {insp_e}")

        return {
            "success": True,
            "model_id": mid,
            "step_url": f"/output/{mid}/{mid}.step",
            "stl_url": f"/output/{mid}/{mid}.stl" if stl_path else None,
            "glb_url": f"/output/{mid}/{mid}.glb" if glb_path else None,
            "png_url": png_url,
            "facts": facts,
        }

    except Exception as e:
        import traceback

        return {
            "success": False,
            "error": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc(),
            "generated_code": code,
            "model_id": mid,
        }
