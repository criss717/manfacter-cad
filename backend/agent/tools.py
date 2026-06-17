"""
ManfacterCAD Agent Tools — custom tools for the ADK agent.

Epic B additions (gated by ``EPIC_B_ENABLED``):

- ``_current_tier`` contextvar receives the prompt-assembly tier; the
  ``run_cad_code`` tool passes it to :func:`generate_cad` so the mesh
  deflection matches the request difficulty.
- ``_glb_caches`` lazily instantiates one ``GLBSessionCache`` per
  WebSocket session and is threaded through ``generate_cad``.
- ``_code_by_mid`` stores generated code keyed by ``(session, model_id)``
  so Epic C can drop ``code`` from the tool response and re-hydrate on
  retry via ``read_reference("{mid}/_script.py")``.
- ``inspect_geometry`` prefers the in-memory ``shape_handle`` registry
  populated by ``generate_cad`` and only falls back to disk when no
  handle is available.

Epic C additions (gated by ``EPIC_C_ENABLED``):

- ``inspect_geometry`` truncates its output to ``bbox`` + ``solids`` on
  retry attempts (task C1) and appends a ``dimensional_check`` payload
  when expected dimensions were extracted from the request (task C5).
- ``run_cad_code`` omits the ``code`` field from its JSON result so the
  WebSocket event no longer carries the full source (task C3); the code
  stays accessible via ``read_reference("{mid}/_script.py")`` thanks
  to the session map.
- ``read_reference`` resolves ``{mid}/_script.py`` requests against the
  in-memory ``_code_by_mid`` map so a retry can re-hydrate the original
  source without round-tripping through disk (task C2).
- ``classify_cad_error`` adds three new patterns targeting material
  removal, fillet-on-cut-edges and shell/wall-thickness issues, all
  linked to the GOTCHAS block (task C6).
- ``_last_expected_dims`` stores the dimensional expectations extracted
  by :func:`agent.prompt.extract_expected_dims` so the inspection tool
  can validate the generated bbox against the request (tasks C4 + C5).
"""

import sys
import uuid
import io
import contextvars
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

OUTPUT_DIR = Path(__file__).parent.parent / "output"
REFERENCES_DIR = Path(__file__).parent.parent / "references"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

_current_session_id = contextvars.ContextVar("current_session_id", default="")
_current_tier = contextvars.ContextVar("current_tier", default="MODERATE")

_attempt_counts: dict[str, int] = {}
_last_model: dict[str, str] = {}
_code_by_mid: dict[str, dict[str, str]] = {}
_glb_caches: dict[str, Any] = {}
_last_expected_dims: dict[str, dict[str, float]] = {}

MAX_CAD_ATTEMPTS = 13


def set_expected_dims(session_id: str, text: str) -> dict | None:
    """Parse the user request and cache the expected dimensions for ``session_id``.

    Returns the extracted dims (or ``None``) and stores the result in
    ``_last_expected_dims[session_id]`` so the next
    :func:`inspect_geometry` call can validate the generated bbox
    against the request. The function is a no-op when ``EPIC_C_ENABLED``
    is off or ``session_id`` is empty.
    """
    if not session_id:
        return None
    if not _is_epic_c_enabled():
        return None
    try:
        from agent.prompt import extract_expected_dims
    except Exception:
        return None
    dims = extract_expected_dims(text)
    if dims:
        _last_expected_dims[session_id] = dims
    else:
        _last_expected_dims.pop(session_id, None)
    return dims


def _get_or_create_glb_cache(session_id: str) -> Any:
    """Return the per-session ``GLBSessionCache``, creating it on first use.

    Returns ``None`` when Epic B is disabled or the caller is outside an
    agent session (e.g. invoked from a direct REST call).
    """
    try:
        from agent.feature_flags import is_epic_b_enabled
    except Exception:
        return None
    if not is_epic_b_enabled() or not session_id:
        return None
    cache = _glb_caches.get(session_id)
    if cache is None:
        try:
            from cad_engine.glb_session_cache import GLBSessionCache

            cache = GLBSessionCache()
            _glb_caches[session_id] = cache
        except Exception as cache_err:
            print(f"[TOOLS] GLB cache init fallida ({session_id[:12]}): {cache_err}")
            return None
    return cache


def _is_epic_c_enabled() -> bool:
    """Read the ``EPIC_C_ENABLED`` flag, defaulting to ``True`` on import errors."""
    try:
        from agent.feature_flags import is_epic_c_enabled
    except Exception:
        return True
    return is_epic_c_enabled()


def release_session_resources(session_id: str) -> None:
    """Free per-session caches, code copies, and shape handles.

    Used by ``server.py`` on WebSocket close. Safe to call repeatedly;
    missing keys are ignored. The shape registry is purged for every
    model_id recorded in the session. Also clears the
    ``_last_expected_dims`` entry for the session so dimensional state
    does not leak between users sharing the same process.
    """
    if not session_id:
        return

    cache = _glb_caches.pop(session_id, None)
    if cache is not None:
        try:
            cache.clear()
        except Exception:
            pass

    code_bucket = _code_by_mid.pop(session_id, None)
    if code_bucket:
        try:
            from cad_engine.generator import release_shape_handle

            for mid in list(code_bucket.keys()):
                release_shape_handle(mid)
        except Exception:
            pass

    _attempt_counts.pop(session_id, None)
    _last_model.pop(session_id, None)
    _last_expected_dims.pop(session_id, None)


def classify_cad_error(error: str) -> str:
    """Classify a build123d error and return a Spanish hint for self-repair.

    Epic C (task C6) extends the 9-category taxonomy with three new
    patterns linked to the GOTCHAS block in :mod:`agent.prompt`:

    - ``material-removal`` — boolean subtraction / fuse / cut that fails
      because the cutting tool does not fully intersect the target.
    - ``fillet-on-cut`` — fillet / chamfer applied to edges created by a
      boolean cut. Resolved by applying fillets BEFORE the cut and
      using ``max_fillet()`` to discover the safe radius.
    - ``wall-thickness`` — shell / hollow / subtraction results in zero
      or sub-millimetre thickness; the hint references the
      manufacturing constraint from the GOTCHAS block (≥ 1.0 mm wall).

    The 9 pre-existing categories are preserved verbatim; the new
    patterns are matched BEFORE the generic boolean / fillet branches so
    they win when both signals are present.
    """
    e = error.lower()

    if _is_epic_c_enabled():
        if (
            "shapelist" in e
            and "wrapped" in e
            and ("fillet" in e or "chamfer" in e)
        ):
            return (
                "ERROR (ShapeList / GOTCHAS): estas pasando un ShapeList a "
                ".fillet() en vez de una lista Python. USA list() para convertir: "
                "`edges = list(part.edges().filter_by(Axis.X)); "
                "part.fillet(r, edges)`. "
                "Consulta la seccion ShapeList del bloque GOTCHAS."
            )

        if "show_object" in e or ("name 'show" in e and "is not defined" in e):
            return (
                "ERROR (show_object / GOTCHAS): show_object() no existe en "
                "build123d estandar. Elimina esa linea. Para inspeccion visual "
                "usa make_snapshot(step_path). "
                "Consulta la seccion NUNCA uses show_object del bloque GOTCHAS."
            )

        if "centerarc" in e and "end_angle" in e:
            return (
                "ERROR (CenterArc / GOTCHAS): CenterArc no acepta 'end_angle'. "
                "Firma correcta: CenterArc(center, radius, start_angle, arc_size). "
                "Ej: CenterArc((0,0), 10, 0, 180) = semicirculo. "
                "Angulos en GRADOS. "
                "Consulta la seccion CenterArc del bloque GOTCHAS."
            )

        if "revolve" in e and ("angle" in e or "unexpected keyword" in e):
            return (
                "ERROR (revolve / GOTCHAS): revolve() NO acepta 'angle'. "
                "La revolucion siempre es 360 grados. "
                "Firma correcta: revolve(axis=Axis.X) — 'axis=' es KEYWORD. "
                "SOLO funciona con Face (perfil 2D): "
                "BuildSketch → make_face() → revolve(axis=Axis.X). "
                "Consulta la seccion revolve del bloque GOTCHAS."
            )

        if "revolve" in e and "doesn't accept axis" in e:
            return (
                "ERROR (revolve / GOTCHAS): pasaste Axis.X como posicional. "
                "Usa KEYWORD: revolve(axis=Axis.X). "
                "SOLO con Face (BuildSketch + make_face), NO con solidos. "
                "Consulta la seccion revolve del bloque GOTCHAS."
            )

        if "no objects to create a hull" in e:
            return (
                "ERROR (make_face / GOTCHAS): el sketch esta VACIO. "
                "make_face() necesita geometria 2D previa. "
                "Dentro de BuildSketch DEBES dibujar al menos una figura: "
                "Rectangle, Circle, Polygon, etc. "
                "Consulta la seccion make_face del bloque GOTCHAS."
            )

        if "width and height must be > 2*radius" in e:
            return (
                "ERROR (RectangleRounded / GOTCHAS): el radio del filete "
                "es demasiado grande para el rectangulo. "
                "RectangleRounded requiere: width > 2*radius Y height > 2*radius. "
                "Reduce el radio o aumenta width/height. "
                "Ej: RectangleRounded(40, 20, 5) = OK, "
                "RectangleRounded(10, 8, 6) = ERROR. "
                "Consulta la seccion RectangleRounded del bloque GOTCHAS."
            )

        if "close" in e and "is not defined" in e:
            return (
                "ERROR (close / GOTCHAS): close() NO existe en build123d. "
                "Los bloques 'with BuildPart():' y 'with BuildSketch():' "
                "se cierran automaticamente. Elimina la linea 'close()'. "
                "Consulta la seccion NUNCA uses close del bloque GOTCHAS."
            )

        if "line.__init__" in e and "start_point" in e:
            return (
                "ERROR (Line / GOTCHAS): Line usa argumentos POSICIONALES, "
                "no keywords. Firma: Line((x1,y1), (x2,y2)). "
                "Ej: Line((0,0), (50,10)). "
                "NUNCA uses start_point= ni end_point=. "
                "Consulta la seccion Line/RadiusArc del bloque GOTCHAS."
            )

        if "radiusarc" in e and ("missing" in e or "positional" in e):
            return (
                "ERROR (RadiusArc / GOTCHAS): RadiusArc usa argumentos "
                "POSICIONALES. Firma: RadiusArc(start, end, radius). "
                "Ej: RadiusArc((0,0), (10,10), 5). "
                "NUNCA uses keywords. "
                "Consulta la seccion Line/RadiusArc del bloque GOTCHAS."
            )

        if "method' object is not subscriptable" in e:
            return (
                "ERROR (vertices/edges / GOTCHAS): vertices() y edges() "
                "son METODOS, requieren parentesis. "
                "Usa: polyline.vertices()[-1], NO polyline.vertices[-1]. "
                "Usa: shape.edges(), NO shape.edges. "
                "Consulta la seccion vertices del bloque GOTCHAS."
            )

        if "edge' object is not callable" in e or ".first()" in e.lower():
            return (
                "ERROR (first/last / GOTCHAS): .first() NO existe en "
                "build123d. Usa sort_by() con indices: "
                "edges().sort_by(Axis.Z)[-1] para la mas alta, [0] para la mas baja. "
                "NO uses .first() ni .last(). "
                "Consulta la seccion NO uses .first del bloque GOTCHAS."
            )

        if "vertex" in e and "pos" in e and "has no attribute" in e:
            return (
                "ERROR (Vertex / GOTCHAS): Vertex NO tiene .pos(). "
                "Usa v.to_tuple() -> (x,y,z) o v.X, v.Y, v.Z. "
                "Ej: path.vertices()[-1].to_tuple() "
                "Consulta la seccion Vertex del bloque GOTCHAS."
            )

        if "arc radius is not large enough" in e:
            return (
                "ERROR (RadiusArc / GOTCHAS): el radio del arco es "
                "demasiado pequeno para conectar los dos puntos. "
                "Aumenta el radio o acerca los puntos. "
                "El radio debe ser >= mitad de la distancia entre puntos. "
                "Consulta la seccion RadiusArc del bloque GOTCHAS."
            )

        if (
            "does not intersect" in e
            or "does not overlap" in e
            or "no intersection" in e
        ) and ("boolean" in e or "fuse" in e or "cut" in e or "subtract" in e or "common" in e):
            return (
                "ERROR (material-removal / GOTCHAS): la herramienta de corte no "
                "atraviesa el objetivo por completo. Asegurate de que `b` "
                "sobresalga claramente de `a` en `a - b` (p.ej. "
                "`Cylinder(r, depth + 1.0)` con una profundidad extra). "
                "Consulta la seccion MATERIAL REMOVAL del bloque GOTCHAS."
            )

        if (
            ("fillet" in e or "chamfer" in e)
            and ("boolean" in e or "cut" in e or "fuse" in e or "after" in e)
            and ("fail" in e or "invalid" in e or "edge" in e or "radius" in e)
        ):
            return (
                "ERROR (fillet-on-cut / GOTCHAS): el filete/chaflan falla sobre "
                "aristas creadas por un corte. Aplica los filetes ANTES de las "
                "operaciones booleanas y, despues de un corte, usa `max_fillet()` "
                "para descubrir el radio maximo seguro. "
                "Consulta la seccion MATERIAL REMOVAL del bloque GOTCHAS."
            )

        if "thickness" in e or "wall" in e or "shell" in e or "hollow" in e:
            if "zero" in e or "negative" in e or "thin" in e or "thickness" in e or "fail" in e or "invalid" in e:
                return (
                    "ERROR (manufacturing / GOTCHAS): espesor de pared invalido o "
                    "demasiado fino. Recuerda que para FDM/3D-printing la pared "
                    "minima es 1.0 mm; cualquier `shell`/`hollow` o resta debe "
                    "dejar al menos 1.0 mm de material. "
                    "Consulta la seccion MANUFACTURING del bloque GOTCHAS."
                )

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
    Returns a JSON string with ok, glb_url, step_url, stl_url, facts, error, hint, model_id, tier."""
    import sys
    import json as _json
    from cad_engine.generator import generate_cad

    session_id = _current_session_id.get()
    tier = _current_tier.get() or "MODERATE"

    if session_id:
        count = _attempt_counts.get(session_id, 0) + 1
        _attempt_counts[session_id] = count
        if count > MAX_CAD_ATTEMPTS:
            return _json.dumps({
                "ok": False,
                "error": "MAX_ATTEMPTS_EXCEEDED",
                "hint": "Has excedido los 5 intentos máximos permitidos. Informa al usuario que no fue posible generar la pieza y sugiere intentar con una descripción más simple o más tarde.",
                "model_id": "limit_exceeded",
                "tier": tier,
            })

    glb_cache = _get_or_create_glb_cache(session_id)

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        mid = uuid.uuid4().hex[:12]
        result = generate_cad(code, mid, tier=tier, glb_cache=glb_cache)
        resolved_mid = result.get("model_id", mid)
        if session_id:
            _last_model[session_id] = resolved_mid
            bucket = _code_by_mid.setdefault(session_id, {})
            bucket[resolved_mid] = code
    finally:
        captured = sys.stdout.getvalue()
        sys.stdout = old_stdout
        if captured:
            sys.stdout.write(captured)

    output = {
        "ok": result["success"],
        "glb_url": result.get("glb_url"),
        "step_url": result.get("step_url"),
        "stl_url": result.get("stl_url"),
        "facts": result.get("facts"),
        "error": result.get("error"),
        "code": code,
        "model_id": result.get("model_id", mid),
        "tier": result.get("tier", tier),
    }

    if not result["success"] and result.get("error"):
        output["hint"] = classify_cad_error(result["error"])

    if _is_epic_c_enabled():
        output.pop("code", None)

    return _json.dumps(output)


def inspect_geometry(step_path: str) -> dict:
    """Inspect a generated STEP file for geometry facts.

    Epic B prefers the in-memory ``shape_handle`` registered by
    ``generate_cad`` to avoid the ``STEPControl_Reader`` round-trip and
    falls back to disk only when the handle has been released.

    Epic C applies two guardrails to the response:

    - On retry attempts (when ``_attempt_counts[sid] > 1``) the output
      is truncated to ``bbox`` + ``solids`` only; face/edge counts are
      dropped so the LLM does not burn tokens on facts it already saw
      in the previous turn (task C1).
    - When expected dimensions are stored for the current session
      (via :func:`agent.prompt.extract_expected_dims`), a
      ``dimensional_check`` payload is appended with per-axis
      deviations and a pass/fail boolean (task C5).
    """
    from cad_engine.inspect import inspect_shape, inspect_step

    session_id = _current_session_id.get()
    attempt = _attempt_counts.get(session_id, 0) if session_id else 0
    truncate = _is_epic_c_enabled() and attempt > 1

    if step_path:
        try:
            from agent.feature_flags import is_epic_b_enabled
        except Exception:
            epic_b = True
        else:
            epic_b = is_epic_b_enabled()

        if epic_b:
            try:
                from cad_engine.generator import get_shape_handle
            except Exception:
                get_shape_handle = None  # type: ignore[assignment]
            if get_shape_handle is not None:
                normalized = step_path.replace("\\", "/").lstrip("/")
                first_segment = normalized.split("/", 1)[0]
                if first_segment:
                    shape = get_shape_handle(first_segment)
                    if shape is not None:
                        try:
                            facts = inspect_shape(shape)
                            return _finalize_inspection(facts, session_id, truncate)
                        except Exception as handle_err:
                            print(
                                f"[TOOLS] inspect_shape fallback a disco "
                                f"({first_segment}): {handle_err}"
                            )

    full_path = OUTPUT_DIR / step_path
    if not full_path.exists():
        return {"ok": False, "error": f"File not found: {step_path}"}

    try:
        facts = inspect_step(full_path)
        return _finalize_inspection(facts, session_id, truncate)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _finalize_inspection(
    facts: dict | None,
    session_id: str,
    truncate: bool,
) -> dict:
    """Apply Epic C truncation + dimensional check to a fresh ``facts`` dict.

    Helper split out from :func:`inspect_geometry` so both the in-memory
    handle path and the disk-fallback path share the same guardrail
    logic. ``truncate`` is computed by the caller from
    ``_attempt_counts[sid]``; this helper only enforces the response
    shape.
    """
    if not facts:
        return {"ok": True, "facts": {}}

    if truncate:
        bbox = facts.get("bbox")
        solids = facts.get("solids")
        truncated: dict = {}
        if bbox is not None:
            truncated["bbox"] = bbox
        if solids is not None:
            truncated["solids"] = solids
        size = facts.get("size")
        if size is not None:
            truncated["size"] = size
        facts = truncated

    if _is_epic_c_enabled() and session_id:
        expected_dims = _last_expected_dims.get(session_id)
        if expected_dims:
            try:
                from agent.prompt import DIMENSIONAL_THRESHOLD
            except Exception:
                DIMENSIONAL_THRESHOLD = 0.20  # type: ignore[assignment]
            try:
                from cad_engine.inspect import compute_dimensional_check
            except Exception:
                compute_dimensional_check = None  # type: ignore[assignment]
            if compute_dimensional_check is not None:
                try:
                    dim_check = compute_dimensional_check(
                        facts,
                        expected_dims,
                        threshold=DIMENSIONAL_THRESHOLD,
                    )
                except Exception as dim_err:
                    print(f"[TOOLS] dimensional_check fallo: {dim_err}")
                    dim_check = None
                if dim_check is not None:
                    facts = dict(facts)
                    facts["dimensional_check"] = dim_check
                    if not dim_check.get("pass", True):
                        expected = dim_check.get("expected", {})
                        actual = dim_check.get("actual", {})
                        deviations = dim_check.get("deviations", {})
                        off = [
                            axis
                            for axis, dev in deviations.items()
                            if dev >= DIMENSIONAL_THRESHOLD
                        ]
                        if off:
                            hint_lines = [
                                "REPARAR DIMENSIONES: la geometria generada no "
                                "coincide con las medidas solicitadas."
                            ]
                            for axis in off:
                                hint_lines.append(
                                    f"  - eje {axis}: esperado="
                                    f"{expected.get(axis)} mm, actual="
                                    f"{actual.get(axis)} mm "
                                    f"(desviacion {deviations[axis] * 100:.1f}%)"
                                )
                            hint_lines.append(
                                "  Reescala la pieza para que el bbox se acerque a "
                                "los valores esperados. Esto cuenta como 1 intento "
                                "del presupuesto de 13."
                            )
                            return {
                                "ok": True,
                                "facts": facts,
                                "dimensional_mismatch": True,
                                "hint": "\n".join(hint_lines),
                            }

    return {"ok": True, "facts": facts}


def read_reference(name: str) -> str:
    """Read a build123d reference document or a previously generated script.

    Args:
        name: Reference filename or generated script path (e.g. '0047da1954ed/_script.py')

    Returns:
        File contents as string, or error message

    Epic C (task C2): when ``EPIC_C_ENABLED`` is on and the request is
    a ``{model_id}/_script.py`` re-hydration, the code is read from the
    in-memory ``_code_by_mid`` session map before falling back to disk.
    This lets the LLM re-hydrate the previous attempt's source without
    the full code being shipped in every event payload.
    """
    clean_name = name.replace("\\", "/")

    if "_script.py" in clean_name:
        session_id = _current_session_id.get()
        current_model = _last_model.get(session_id, "")
        if current_model:
            parts = clean_name.strip("/").split("/")
            model_dir = parts[0] if len(parts) > 0 else ""
            if model_dir != current_model:
                return f"No puedes leer scripts de otras sesiones. Solo puedes leer el script actual: {current_model}/_script.py"

        if _is_epic_c_enabled() and session_id:
            bucket = _code_by_mid.get(session_id, {})
            parts = clean_name.strip("/").split("/")
            model_dir = parts[0] if len(parts) > 0 else ""
            cached = bucket.get(model_dir)
            if cached is not None:
                if len(cached) > 15000:
                    return cached[:15000] + "\n\n... (truncated, use smaller section)"
                return cached

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
    """List generated output files from the current session only."""
    session_id = _current_session_id.get()
    current_model = _last_model.get(session_id, "")
    if not current_model:
        return {"ok": True, "files": [], "session": "none"}
    model_dir = OUTPUT_DIR / current_model
    files = []
    if model_dir.exists():
        for f in sorted(model_dir.rglob("*")):
            if f.is_file():
                files.append({
                    "name": str(f.relative_to(OUTPUT_DIR)),
                    "size": f.stat().st_size,
                    "suffix": f.suffix,
                })
    return {"ok": True, "files": files[:50], "session": current_model}


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


def make_snapshots(step_path: str) -> dict:
    """Render 5 canonical-view PNG screenshots of a generated model.

    Views: front, back, left, right, bottom.

    Args:
        step_path: Path to the .step file (relative to output dir, e.g. 'abc123/abc123.step')

    Returns:
        dict with ok, views (dict of view_name → relative_url), and any error
    """
    from cad_engine.screenshot import render_multiview_snapshots

    full_step = OUTPUT_DIR / step_path
    if not full_step.exists():
        return {"ok": False, "error": f"STEP file not found: {step_path}"}

    model_dir = full_step.parent
    glb_files = sorted(model_dir.glob("*.glb"))
    if not glb_files:
        return {"ok": False, "error": "No GLB file found next to STEP. Generate the model first."}

    try:
        views = render_multiview_snapshots(glb_files[0], model_dir)
        if not views:
            return {"ok": False, "error": "All views failed to render"}

        result: dict = {"ok": True, "views": {}}
        for name, path in views.items():
            rel = str(path.relative_to(OUTPUT_DIR)).replace("\\", "/")
            result["views"][name] = f"/output/{rel}"
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


# Tool definitions for the agent
TOOLS = [run_cad_code, inspect_geometry, read_reference, list_outputs, make_snapshot, make_snapshots]
