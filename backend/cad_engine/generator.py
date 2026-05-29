"""
CAD Generator - ejecuta build123d Python code y exporta STEP/STL/GLB.

Usa el exportador STEP XCAF local para preservar colores, labels
y estructura de assembly. GLB via trimesh con normales calculadas.
"""

import sys
import uuid
from pathlib import Path

import numpy as np

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
    from .text_to_cad.step_export import export_build123d_step_scene

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
    import time

    mid = model_id or uuid.uuid4().hex[:12]
    output_dir = OUTPUT_DIR / mid
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n[CAD] ──────────────────────────────────────")
    print(f"[CAD] ID: {mid}")
    print(f"[CAD] Guardando script ({len(code)} chars)...")

    script_path = output_dir / "_script.py"
    script_path.write_text(code, encoding="utf-8")
    print(f"[CAD] Script guardado en {script_path}")

    t0 = time.time()

    try:
        import importlib.util

        print(f"[CAD] Compilando modulo Python...")
        spec = importlib.util.spec_from_file_location(f"cad_model_{mid}", script_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"cad_model_{mid}"] = module
        spec.loader.exec_module(module)
        print(f"[CAD] Modulo compilado OK")

        if not hasattr(module, "gen_step"):
            print(f"[CAD] ERROR: gen_step() no encontrada en el script")
            return {
                "success": False,
                "error": "El codigo debe definir una funcion gen_step() que devuelva una shape de build123d.",
                "model_id": mid,
            }

        print(f"[CAD] Ejecutando gen_step()...")
        shape = module.gen_step()
        t_gen = time.time() - t0
        print(f"[CAD] gen_step() completado en {t_gen:.2f}s")

        if shape is None:
            print(f"[CAD] ERROR: gen_step() devolvio None")
            return {
                "success": False,
                "error": "gen_step() devolvio None.",
                "model_id": mid,
            }

        t1 = time.time()
        print(f"[CAD] Exportando STEP XCAF...")
        step_path = output_dir / f"{mid}.step"
        _export_step(shape, step_path)
        step_size_kb = step_path.stat().st_size / 1024 if step_path.exists() else 0
        t_step = time.time() - t1
        print(f"[CAD] STEP exportado ({step_size_kb:.0f} KB) en {t_step:.2f}s")

        t2 = time.time()
        stl_path = output_dir / f"{mid}.stl"
        print(f"[CAD] Exportando STL...")
        try:
            _export_stl(shape, stl_path)
            stl_size_kb = stl_path.stat().st_size / 1024 if stl_path.exists() else 0
            t_stl = time.time() - t2
            print(f"[CAD] STL exportado ({stl_size_kb:.0f} KB) en {t_stl:.2f}s")
        except Exception as stl_e:
            stl_path = None
            t_stl = time.time() - t2
            print(f"[CAD] STL FAIL (tras {t_stl:.2f}s): {stl_e}")

        t3 = time.time()
        glb_path = output_dir / f"{mid}.glb"
        print(f"[CAD] Exportando GLB (mallando geometria)...")
        try:
            _export_glb(shape, glb_path)
            glb_size_kb = glb_path.stat().st_size / 1024 if glb_path.exists() else 0
            t_glb = time.time() - t3
            print(f"[CAD] GLB exportado ({glb_size_kb:.0f} KB) en {t_glb:.2f}s")
        except Exception as glb_e:
            glb_path = None
            t_glb = time.time() - t3
            print(f"[CAD] GLB FAIL (tras {t_glb:.2f}s): {glb_e}")

        t4 = time.time()
        print(f"[CAD] Inspeccionando geometria...")
        facts = None
        try:
            from cad_engine.inspect import inspect_step
            facts = inspect_step(step_path)
            if facts:
                bb = facts.get("bbox", {})
                faces = facts.get("faces", "?")
                edges = facts.get("edges", "?")
                solids = facts.get("solids", "?")
                print(f"[CAD] Inspeccion OK: bbox={bb}, faces={faces}, edges={edges}, solids={solids}")
        except Exception as insp_e:
            print(f"[CAD] Inspeccion FAIL: {insp_e}")
        t_insp = time.time() - t4
        print(f"[CAD] Inspeccion completada en {t_insp:.2f}s")

        total = time.time() - t0
        print(f"[CAD] COMPLETADO en {total:.2f}s total")
        print(f"[CAD] ──────────────────────────────────────")

        return {
            "success": True,
            "model_id": mid,
            "step_url": f"/output/{mid}/{mid}.step",
            "stl_url": f"/output/{mid}/{mid}.stl" if stl_path else None,
            "glb_url": f"/output/{mid}/{mid}.glb" if glb_path else None,
            "facts": facts,
        }

    except Exception as e:
        import traceback

        elapsed = time.time() - t0
        tb = traceback.format_exc()
        print(f"[CAD] ERROR tras {elapsed:.2f}s: {type(e).__name__}: {e}")
        print(f"[CAD] Traceback:\n{tb}")
        print(f"[CAD] ──────────────────────────────────────")

        return {
            "success": False,
            "error": f"{type(e).__name__}: {e}",
            "traceback": tb,
            "generated_code": code,
            "model_id": mid,
        }
