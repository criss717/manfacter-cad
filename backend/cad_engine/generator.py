"""
CAD Generator — executes build123d Python code and produces STEP/STL/GLB files.
"""

import sys
import uuid
from pathlib import Path

from cad_engine.step_export import export_step
from cad_engine.stl_export import export_stl
from cad_engine.glb_export import export_glb

OUTPUT_DIR = Path(__file__).parent.parent / "output"


def _fuse_shape(shape):
    from build123d import Compound, Solid
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse
    from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopoDS import TopoDS

    if isinstance(shape, Solid):
        solid_shapes = list(shape.solids())
        if len(solid_shapes) <= 1:
            return shape
        ocp_solids = []
        for s in solid_shapes:
            exp = TopExp_Explorer(s.wrapped, TopAbs_SOLID)
            if exp.More():
                ocp_solids.append(TopoDS.Solid_s(exp.Current()))
        if len(ocp_solids) < 2:
            return shape
    elif isinstance(shape, Compound):
        solids = list(shape.solids())
        if len(solids) <= 1:
            return solids[0] if len(solids) == 1 else shape
        ocp_solids = []
        for s in solids:
            exp = TopExp_Explorer(s.wrapped, TopAbs_SOLID)
            if exp.More():
                ocp_solids.append(TopoDS.Solid_s(exp.Current()))
        if len(ocp_solids) < 2:
            return shape
    else:
        return shape

    fused = ocp_solids[0]
    for s in ocp_solids[1:]:
        algo = BRepAlgoAPI_Fuse(fused, s)
        algo.Build()
        if algo.IsDone():
            fused = algo.Shape()

    try:
        unify = ShapeUpgrade_UnifySameDomain(fused, True, True, True)
        unify.Build()
        unified = unify.Shape()
        if not unified.IsNull():
            fused = unified
    except Exception:
        pass

    result = Solid(fused)
    if hasattr(shape, "label"):
        try:
            result.label = shape.label
        except Exception:
            pass
    return result


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
                "error": "El código debe definir una función gen_step() que devuelva una shape de build123d.",
                "model_id": mid,
            }

        shape = module.gen_step()

        if shape is None:
            return {
                "success": False,
                "error": "gen_step() devolvió None.",
                "model_id": mid,
            }

        fused = _fuse_shape(shape)

        step_path = output_dir / f"{mid}.step"
        export_step(fused, step_path)

        stl_path = output_dir / f"{mid}.stl"
        try:
            export_stl(fused, stl_path)
        except Exception as stl_e:
            stl_path = None
            print(f"[WARN] STL export failed: {stl_e}")

        glb_path = output_dir / f"{mid}.glb"
        try:
            export_glb(fused, glb_path)
        except Exception as glb_e:
            print(f"[WARN] GLB export failed: {glb_e}")
            glb_path = None

        return {
            "success": True,
            "model_id": mid,
            "step_url": f"/output/{mid}/{mid}.step",
            "stl_url": f"/output/{mid}/{mid}.stl" if stl_path else None,
            "glb_url": f"/output/{mid}/{mid}.glb" if glb_path else None,
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
