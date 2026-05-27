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


def run_cad_code(code: str) -> str:
    """Execute build123d Python code and generate STEP/STL/GLB files.
    Returns a JSON string with ok, glb_url, step_url, stl_url, facts, error."""
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

    return _json.dumps({
        "ok": result["success"],
        "glb_url": result.get("glb_url"),
        "step_url": result.get("step_url"),
        "stl_url": result.get("stl_url"),
        "facts": result.get("facts"),
        "error": result.get("error"),
        "code": code,
        "model_id": mid,
    })


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
    """Read a build123d reference document.

    Args:
        name: Reference filename (e.g. 'build123d-modeling.md', 'repair-loop.md', 'SKILL.md')

    Returns:
        File contents as string, or error message
    """
    path = REFERENCES_DIR / name
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


# Tool definitions for the agent
TOOLS = [run_cad_code, inspect_geometry, read_reference, list_outputs]
