"""
CAD Generator — executes build123d Python code and exports STEP/STL/GLB.

Epic B (gated by ``EPIC_B_ENABLED``) unifies mesh generation: a single
``BRepMesh_IncrementalMesh`` call populates a frozen :class:`MeshCache`
that feeds both STL and GLB writers running in a 2-worker
``ThreadPoolExecutor``. The cache, the in-memory shape handle, and the
GLB byte cache are released by the caller (``backend/agent/tools.py``)
when the WebSocket session ends.

When the flag is off we fall back to the legacy dual-mesh path
(``_export_stl`` / ``_export_glb`` re-meshing independently) so the
engine remains usable while the optimisation is being staged.
"""

from __future__ import annotations

import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np

OUTPUT_DIR = Path(__file__).parent.parent / "output"

_LINEAR_DEFLECTION = 0.05
_ANGULAR_DEFLECTION = 0.5

Tier = Literal["SIMPLE", "MODERATE", "COMPLEX"]

_TIER_DEFLECTION: dict[str, tuple[float, float]] = {
    "SIMPLE": (0.1, 0.8),
    "MODERATE": (0.05, 0.5),
    "COMPLEX": (0.02, 0.3),
}


@dataclass(frozen=True)
class MeshCache:
    """Cached triangulation shared by STL, GLB and inspection consumers.

    Vertices and normals are stored as ``float64`` arrays of shape
    ``(N, 3)``; face indices are ``int32`` of shape ``(M, 3)``. The cache
    is immutable so it can be read concurrently from the parallel
    export workers without locking.
    """

    vertices: np.ndarray
    faces: np.ndarray
    normals: np.ndarray
    step_hash: str
    deflection: tuple[float, float]


_SHAPE_REGISTRY: dict[str, Any] = {}


def get_shape_handle(handle: str) -> Any | None:
    """Return the in-memory OCP shape previously registered for ``handle``."""
    return _SHAPE_REGISTRY.get(handle)


def release_shape_handle(handle: str) -> None:
    """Drop a registered shape handle, freeing its OCP references."""
    _SHAPE_REGISTRY.pop(handle, None)


def deflection_for_tier(tier: str | None) -> tuple[float, float]:
    """Return ``(linear, angular)`` deflection for a tier, falling back to MODERATE."""
    if not tier:
        return _TIER_DEFLECTION["MODERATE"]
    return _TIER_DEFLECTION.get(str(tier).upper(), _TIER_DEFLECTION["MODERATE"])


def _to_ocp_shape(shape: Any) -> Any:
    if hasattr(shape, "wrapped"):
        return shape.wrapped
    return shape


def _mesh_once(
    shape: Any,
    lin_deflection: float,
    ang_deflection: float,
    *,
    step_hash: str = "",
) -> MeshCache:
    """Triangulate ``shape`` once and return a populated :class:`MeshCache`.

    Iterates ``TopExp_Explorer`` over faces exactly once after a single
    ``BRepMesh_IncrementalMesh`` call. Reversed faces have their winding
    flipped and their normals negated so downstream writers do not need
    to know about orientation.
    """
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRep import BRep_Tool
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopoDS import TopoDS

    ocp_shape = _to_ocp_shape(shape)

    mesh = BRepMesh_IncrementalMesh(
        ocp_shape,
        float(lin_deflection),
        False,
        float(ang_deflection),
        True,
    )
    mesh.Perform()

    verts_buf: list[list[float]] = []
    faces_buf: list[list[int]] = []
    normals_buf: list[list[float]] = []
    vertex_offset = 0

    explorer = TopExp_Explorer(ocp_shape, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        is_reversed = face.Orientation() == TopAbs_REVERSED
        loc = face.Location()

        try:
            triangulation = BRep_Tool.Triangulation_s(face, loc)
        except Exception:
            triangulation = None
        if triangulation is None or triangulation.NbNodes() == 0:
            explorer.Next()
            continue

        if not triangulation.HasNormals():
            try:
                triangulation.ComputeNormals()
            except Exception:
                pass

        trsf = loc.Transformation()
        nb_nodes = triangulation.NbNodes()
        for i in range(1, nb_nodes + 1):
            point = triangulation.Node(i).Transformed(trsf)
            verts_buf.append([float(point.X()), float(point.Y()), float(point.Z())])
            try:
                normal = triangulation.Normal(i).Transformed(trsf)
                nx, ny, nz = float(normal.X()), float(normal.Y()), float(normal.Z())
                if is_reversed:
                    nx, ny, nz = -nx, -ny, -nz
                length = (nx * nx + ny * ny + nz * nz) ** 0.5
                if length > 1e-15:
                    nx, ny, nz = nx / length, ny / length, nz / length
                else:
                    nx, ny, nz = 0.0, 0.0, 1.0
            except Exception:
                nx, ny, nz = 0.0, 0.0, 1.0
            normals_buf.append([nx, ny, nz])

        nb_triangles = triangulation.NbTriangles()
        for i in range(1, nb_triangles + 1):
            a, b, c = triangulation.Triangle(i).Get()
            if is_reversed:
                faces_buf.append([
                    a - 1 + vertex_offset,
                    c - 1 + vertex_offset,
                    b - 1 + vertex_offset,
                ])
            else:
                faces_buf.append([
                    a - 1 + vertex_offset,
                    b - 1 + vertex_offset,
                    c - 1 + vertex_offset,
                ])

        vertex_offset += nb_nodes
        explorer.Next()

    if not verts_buf:
        return MeshCache(
            vertices=np.zeros((0, 3), dtype=np.float64),
            faces=np.zeros((0, 3), dtype=np.int32),
            normals=np.zeros((0, 3), dtype=np.float64),
            step_hash=step_hash,
            deflection=(float(lin_deflection), float(ang_deflection)),
        )

    return MeshCache(
        vertices=np.ascontiguousarray(verts_buf, dtype=np.float64),
        faces=np.ascontiguousarray(faces_buf, dtype=np.int32),
        normals=np.ascontiguousarray(normals_buf, dtype=np.float64),
        step_hash=step_hash,
        deflection=(float(lin_deflection), float(ang_deflection)),
    )


def _export_step(shape: Any, output_path: Path) -> Path:
    """STEP via XCAF (text-to-cad pipeline). Preserves colours, labels, assembly."""
    from .text_to_cad.step_export import export_build123d_step_scene

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_build123d_step_scene(shape, output_path)
    return output_path


def _step_hash_of(path: Path) -> str:
    """Hash a STEP file by content for GLB cache keying."""
    try:
        from .text_to_cad.step_scene import step_file_hash

        return step_file_hash(path)
    except Exception:
        import hashlib

        try:
            return hashlib.sha256(path.read_bytes()).hexdigest()
        except Exception:
            return ""


def _export_stl_from_cache(mesh_cache: MeshCache, output_path: Path) -> Path:
    """Write a binary STL straight from a cached triangulation (Epic B)."""
    from cad_engine._stl_writer import write_stl_binary

    output_path = Path(output_path)
    write_stl_binary(
        mesh_cache.vertices,
        mesh_cache.faces,
        mesh_cache.normals,
        output_path,
    )
    return output_path


def _export_glb_from_cache(
    mesh_cache: MeshCache,
    output_path: Path,
    *,
    glb_cache: Any = None,
    model_id: str = "",
) -> Path:
    """Write a GLB file from a cached triangulation; honour GLB session cache."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cache_eligible = bool(glb_cache and mesh_cache.step_hash and model_id)
    if cache_eligible:
        cached = glb_cache.get(mesh_cache.step_hash, mesh_cache.deflection, model_id)
        if cached is not None:
            output_path.write_bytes(cached)
            return output_path

    if mesh_cache.faces.shape[0] == 0:
        raise RuntimeError("MeshCache vacío: no hay triángulos para exportar GLB")

    import trimesh

    tri_mesh = trimesh.Trimesh(
        vertices=mesh_cache.vertices,
        faces=mesh_cache.faces,
        vertex_normals=mesh_cache.normals if mesh_cache.normals.size else None,
        process=False,
    )
    payload = tri_mesh.export(file_type="glb")
    output_path.write_bytes(payload)

    if cache_eligible:
        try:
            glb_cache.put(
                mesh_cache.step_hash,
                mesh_cache.deflection,
                model_id,
                payload,
            )
        except Exception as cache_err:
            print(f"[CAD] GLB cache put fallida: {cache_err}")

    return output_path


def _extract_trimesh(shape: Any) -> "trimesh.Trimesh | None":  # noqa: F821
    """Legacy GLB mesh extractor used when Epic B is disabled."""
    import trimesh
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRep import BRep_Tool
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopoDS import TopoDS

    ocp_shape = _to_ocp_shape(shape)

    mesh_algo = BRepMesh_IncrementalMesh(
        ocp_shape, _LINEAR_DEFLECTION, False, _ANGULAR_DEFLECTION, True
    )
    mesh_algo.Perform()

    all_vertices: list[list[float]] = []
    all_faces: list[list[int]] = []
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

    return trimesh.Trimesh(
        vertices=np.array(all_vertices, dtype=np.float64),
        faces=np.array(all_faces, dtype=np.int32),
    )


def _export_glb(shape: Any, output_path: Path) -> Path:
    """Legacy GLB exporter (Epic B disabled)."""
    tri_mesh = _extract_trimesh(shape)
    if tri_mesh is None:
        raise RuntimeError("No se pudo extraer malla de la geometria")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tri_mesh.export(str(output_path), file_type="glb")
    return output_path


def _export_stl(shape: Any, output_path: Path) -> Path:
    """Legacy STL exporter (Epic B disabled). Performs its own meshing."""
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.StlAPI import StlAPI_Writer

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ocp_shape = _to_ocp_shape(shape)

    mesh = BRepMesh_IncrementalMesh(
        ocp_shape, _LINEAR_DEFLECTION, False, _ANGULAR_DEFLECTION, True
    )
    mesh.Perform()

    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(ocp_shape, str(output_path)):
        raise RuntimeError("STL write failed")
    return output_path


def generate_cad(
    code: str,
    model_id: str | None = None,
    *,
    tier: str = "MODERATE",
    glb_cache: Any = None,
) -> dict:
    """Generate CAD outputs from build123d source code.

    Positional ``(code, model_id)`` is preserved so existing callers in
    ``backend/main.py`` and ``backend/agent/tools.py`` keep working
    unchanged. Epic B adds keyword-only ``tier`` (drives the mesh
    deflection) and ``glb_cache`` (per-session :class:`GLBSessionCache`).
    """
    try:
        from agent.feature_flags import is_epic_b_enabled

        epic_b = is_epic_b_enabled()
    except Exception:
        epic_b = True

    mid = model_id or uuid.uuid4().hex[:12]
    output_dir = OUTPUT_DIR / mid
    output_dir.mkdir(parents=True, exist_ok=True)

    lin, ang = deflection_for_tier(tier if epic_b else "MODERATE")

    print("\n[CAD] ──────────────────────────────────────")
    print(f"[CAD] ID: {mid}")
    print(
        f"[CAD] Tier: {tier} | epic_b={epic_b} | "
        f"deflection=(lin={lin}, ang={ang})"
    )
    print(f"[CAD] Guardando script ({len(code)} chars)...")

    script_path = output_dir / "_script.py"
    script_path.write_text(code, encoding="utf-8")
    print(f"[CAD] Script guardado en {script_path}")

    t0 = time.time()

    try:
        import importlib.util

        print("[CAD] Compilando modulo Python...")
        spec = importlib.util.spec_from_file_location(f"cad_model_{mid}", script_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"cad_model_{mid}"] = module
        spec.loader.exec_module(module)
        print("[CAD] Modulo compilado OK")

        if not hasattr(module, "gen_step"):
            print("[CAD] ERROR: gen_step() no encontrada en el script")
            return {
                "success": False,
                "error": "El codigo debe definir una funcion gen_step() que devuelva una shape de build123d.",
                "model_id": mid,
                "tier": tier,
            }

        print("[CAD] Ejecutando gen_step()...")
        shape = module.gen_step()
        t_gen = time.time() - t0
        print(f"[CAD] gen_step() completado en {t_gen:.2f}s")

        if shape is None:
            print("[CAD] ERROR: gen_step() devolvio None")
            return {
                "success": False,
                "error": "gen_step() devolvio None.",
                "model_id": mid,
                "tier": tier,
            }

        t1 = time.time()
        print("[CAD] Exportando STEP XCAF...")
        step_path = output_dir / f"{mid}.step"
        _export_step(shape, step_path)
        step_size_kb = step_path.stat().st_size / 1024 if step_path.exists() else 0
        t_step = time.time() - t1
        print(f"[CAD] STEP exportado ({step_size_kb:.0f} KB) en {t_step:.2f}s")

        stl_path: Path | None = output_dir / f"{mid}.stl"
        glb_path: Path | None = output_dir / f"{mid}.glb"
        facts: dict | None = None
        shape_handle: str | None = None

        if epic_b:
            t2 = time.time()
            print(f"[CAD] Mallando una sola vez (lin={lin}, ang={ang})...")
            step_hash = _step_hash_of(step_path)
            mesh_cache = _mesh_once(shape, lin, ang, step_hash=step_hash)
            t_mesh = time.time() - t2
            print(
                f"[CAD] MeshCache lista: "
                f"{mesh_cache.vertices.shape[0]} verts / "
                f"{mesh_cache.faces.shape[0]} tris en {t_mesh:.2f}s"
            )

            t3 = time.time()
            print("[CAD] Exportando STL+GLB en paralelo...")
            with ThreadPoolExecutor(max_workers=2) as pool:
                fut_stl = pool.submit(_export_stl_from_cache, mesh_cache, stl_path)
                fut_glb = pool.submit(
                    _export_glb_from_cache,
                    mesh_cache,
                    glb_path,
                    glb_cache=glb_cache,
                    model_id=mid,
                )

                try:
                    fut_stl.result()
                    stl_size_kb = stl_path.stat().st_size / 1024 if stl_path.exists() else 0
                    print(f"[CAD] STL OK ({stl_size_kb:.0f} KB)")
                except Exception as stl_err:
                    print(f"[CAD] STL FAIL: {stl_err}")
                    stl_path = None

                try:
                    fut_glb.result()
                    glb_size_kb = glb_path.stat().st_size / 1024 if glb_path.exists() else 0
                    print(f"[CAD] GLB OK ({glb_size_kb:.0f} KB)")
                except Exception as glb_err:
                    print(f"[CAD] GLB FAIL: {glb_err}")
                    glb_path = None
            t_par = time.time() - t3
            print(f"[CAD] STL+GLB paralelo en {t_par:.2f}s")

            shape_handle = mid
            _SHAPE_REGISTRY[shape_handle] = shape

            t4 = time.time()
            print("[CAD] Inspeccionando geometria (in-memory)...")
            try:
                from cad_engine.inspect import inspect_shape

                facts = inspect_shape(shape)
                if facts:
                    print(
                        f"[CAD] Inspeccion OK: bbox={facts.get('bbox')}, "
                        f"faces={facts.get('faces')}, edges={facts.get('edges')}, "
                        f"solids={facts.get('solids')}"
                    )
            except Exception as insp_err:
                print(f"[CAD] Inspeccion FAIL: {insp_err}")
            t_insp = time.time() - t4
            print(f"[CAD] Inspeccion completada en {t_insp:.2f}s")
        else:
            t2 = time.time()
            print("[CAD] Exportando STL (legacy)...")
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
            print("[CAD] Exportando GLB (legacy, mallando geometria)...")
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
            print("[CAD] Inspeccionando geometria (STEP disk)...")
            try:
                from cad_engine.inspect import inspect_step

                facts = inspect_step(step_path)
                if facts:
                    print(
                        f"[CAD] Inspeccion OK: bbox={facts.get('bbox')}, "
                        f"faces={facts.get('faces')}, edges={facts.get('edges')}, "
                        f"solids={facts.get('solids')}"
                    )
            except Exception as insp_e:
                print(f"[CAD] Inspeccion FAIL: {insp_e}")
            t_insp = time.time() - t4
            print(f"[CAD] Inspeccion completada en {t_insp:.2f}s")

        total = time.time() - t0
        print(f"[CAD] COMPLETADO en {total:.2f}s total")
        print("[CAD] ──────────────────────────────────────")

        return {
            "success": True,
            "model_id": mid,
            "tier": tier,
            "step_url": f"/output/{mid}/{mid}.step",
            "stl_url": f"/output/{mid}/{mid}.stl" if stl_path else None,
            "glb_url": f"/output/{mid}/{mid}.glb" if glb_path else None,
            "facts": facts,
            "shape_handle": shape_handle,
        }

    except Exception as e:
        import traceback

        elapsed = time.time() - t0
        tb = traceback.format_exc()
        print(f"[CAD] ERROR tras {elapsed:.2f}s: {type(e).__name__}: {e}")
        print(f"[CAD] Traceback:\n{tb}")
        print("[CAD] ──────────────────────────────────────")

        return {
            "success": False,
            "error": f"{type(e).__name__}: {e}",
            "traceback": tb,
            "generated_code": code,
            "model_id": mid,
            "tier": tier,
        }


__all__ = [
    "MeshCache",
    "OUTPUT_DIR",
    "Tier",
    "deflection_for_tier",
    "generate_cad",
    "get_shape_handle",
    "release_shape_handle",
]
