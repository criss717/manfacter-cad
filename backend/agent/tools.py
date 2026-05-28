"""
ManfacterCAD Agent Tools — custom tools for the ADK agent.
"""

import sys
import uuid
import io
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

OUTPUT_DIR = Path(__file__).parent.parent / "output"
REFERENCES_DIR = Path(__file__).parent.parent / "references"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def classify_cad_error(error: str) -> str:
    """Classify a build123d error and return a Spanish hint for self-repair."""
    e = error.lower()
    if "attributeerror" in e:
        if "plane" in e:
            return "ERROR: Plane.XN/XP/YN/YP/ZN/ZP no existen. Usa Plane.XY, Plane.YZ, o Plane.XZ."
        if "edges" in e or "faces" in e:
            return "ERROR: edges() y faces() son METODOS (con parentesis), no atributos. Usa shape.edges() no shape.edges."
        return f"ERROR: {error}. Revisa la referencia build123d-modeling.md para la API correcta."
    if "typeerror" in e:
        if "cylinder" in e or "cylind" in e:
            return "ERROR: Cylinder acepta: Cylinder(radio, altura) posicional o Cylinder(radius=radio, height=altura). NO existen 'r=' ni 'h='."
        if "context manager" in e or "__enter__" in e:
            return "ERROR: Ese objeto no es context manager. No uses 'with' con el. Consulta build123d-modeling.md."
        if "not callable" in e:
            return "ERROR: Llamaste algo como funcion que no lo es. Revisa parentesis vs atributos."
        return f"ERROR: {error}. Revisa los tipos de los argumentos."
    if "syntaxerror" in e:
        return "ERROR de sintaxis Python. Revisa imports, indentacion, parentesis."
    if "importerror" in e or "modulenotfound" in e:
        return "ERROR: Falta 'from build123d import *' al inicio del script."
    if "fillet" in e or "chamfer" in e:
        if "multiple values for" in e or "argument" in e:
            return "ERROR: La firma de fillet en solido es shape.fillet(radius, [edges]). Pasa los edges como LISTA: [edge]. La funcion global fillet toma (objects, radius=value)."
        return "ERROR: Reduce el radio/longitud o usa max_fillet(). Aplica filetes ANTES de restar agujeros. Selecciona aristas con edges().filter_by(Axis.X).sort_by(Axis.X)[indice]."
    if "boolean" in e or "fuse" in e or "cut" in e:
        return "ERROR: Operacion booleana fallida. Verifica que las shapes tengan volumen solapado. La herramienta debe atravesar el objetivo completamente para cortes."
    if "polyline" in e or "buildline" in e or "buildsketch" in e:
        return "ERROR: Polyline solo funciona dentro de BuildLine, no BuildSketch. Patron: with BuildLine(): Polyline(...)."
    if "sweep" in e or "loft" in e or "revolve" in e:
        return "ERROR en sweep/loft/revolve. Verifica que el perfil y path/trayectoria sean validos. El perfil debe ser una Face para sweep."
    if "indexerror" in e:
        return "ERROR: IndexError: list index out of range. El filtro de aristas/caras devolvio lista vacia. Revisa coordenadas y eje de filtrado, usa tolerancias amplias con filter_by_position."
    return f"ERROR: {error}. Consulta las referencias para la API correcta y corrige."


def run_cad_code(code: str) -> str:
    """Execute build123d Python code and generate STEP/STL/GLB files.
    Returns a JSON string with ok, glb_url, step_url, stl_url, facts, error, hint."""
    import io
    import sys
    import json as _json
    from cad_engine.generator import generate_cad

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        mid = uuid.uuid4().hex[:12]
        result = generate_cad(code, mid)
    finally:
        captured = sys.stdout.getvalue()
        sys.stdout = old_stdout

    output = {
        "ok": result["success"],
        "glb_url": result.get("glb_url"),
        "step_url": result.get("step_url"),
        "stl_url": result.get("stl_url"),
        "facts": result.get("facts"),
        "error": result.get("error"),
        "code": code,
        "model_id": mid,
    }

    if not result["success"] and result.get("error"):
        output["hint"] = classify_cad_error(result["error"])

    return _json.dumps(output)


def inspect_geometry(step_path: str) -> dict:
    """Inspect a generated STEP file for geometry facts.

    Args:
        step_path: Path to .step file (relative to output dir)

    Returns:
        dict with bbox, faces, edges, solids, size
    """
    from cad_engine.inspect import inspect_step

    full_path = OUTPUT_DIR / step_path
    if not full_path.exists():
        return {"ok": False, "error": f"File not found: {step_path}"}

    try:
        facts = inspect_step(full_path)
        return {"ok": True, "facts": facts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def read_reference(name: str) -> str:
    """Read a build123d reference document or a previously generated script.

    Args:
        name: Reference filename or generated script path (e.g. '0047da1954ed/_script.py')

    Returns:
        File contents as string, or error message
    """
    clean_name = name.replace("\\", "/")
    
    if "_script.py" in clean_name:
        path = OUTPUT_DIR / clean_name
    else:
        path = REFERENCES_DIR / clean_name

    if not path.exists():
        available = [f.name for f in REFERENCES_DIR.glob("*.md")] if REFERENCES_DIR.exists() else []
        return f"Reference '{name}' not found. Available: {', '.join(available)}"

    content = path.read_text(encoding="utf-8")
    if len(content) > 15000:
        return content[:15000] + "\n\n... (truncated, use smaller section)"
    return content


def list_outputs() -> dict:
    """List all generated output files."""
    files = []
    for f in sorted(OUTPUT_DIR.rglob("*")):
        if f.is_file():
            files.append({
                "name": str(f.relative_to(OUTPUT_DIR)),
                "size": f.stat().st_size,
                "suffix": f.suffix,
            })
    return {"ok": True, "files": files[:50]}


def make_snapshot(step_path: str) -> dict:
    """Render a PNG screenshot of a generated GLB model for visual inspection.

    Args:
        step_path: Path to the .step file (relative to output dir, e.g. 'abc123/abc123.step')

    Returns:
        dict with ok, png_url, and any error message
    """
    import json as _json
    from cad_engine.screenshot import render_screenshot

    full_step = OUTPUT_DIR / step_path
    if not full_step.exists():
        return {"ok": False, "error": f"STEP file not found: {step_path}"}

    model_dir = full_step.parent
    glb_files = sorted(model_dir.glob("*.glb"))
    if not glb_files:
        return {"ok": False, "error": "No GLB file found next to STEP. Generate the model first."}

    glb_path = glb_files[0]
    png_path = model_dir / "snapshot.png"

    try:
        result = render_screenshot(glb_path, png_path)
        if result is None:
            return {"ok": False, "error": "Screenshot rendering failed"}
        rel_png = str(png_path.relative_to(OUTPUT_DIR)).replace("\\", "/")
        return {"ok": True, "png_url": f"/output/{rel_png}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# Tool definitions for the agent
TOOLS = [run_cad_code, inspect_geometry, read_reference, list_outputs, make_snapshot]
