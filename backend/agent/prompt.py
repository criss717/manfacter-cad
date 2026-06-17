"""Agent instruction prompt for ManfacterCAD — API pre-loaded, references on-demand.

Epic A additions (gated by ``EPIC_A_ENABLED``):

- :data:`GOTCHAS` versioned block injected before ``## RESPONSE RULES``.
- :func:`classify_tier` keyword heuristic returning ``SIMPLE``/``MODERATE``/``COMPLEX``.
- :func:`build_tier_directive` produces a per-request directive (reference policy,
  mandatory snapshot) the server prepends to the user message.
- :func:`assemble_prompt` is the public entry point used by the WebSocket server.

Epic C additions (gated by ``EPIC_C_ENABLED``):

- :func:`extract_expected_dims` parses the user request for triple L×W×H,
  M-bolt diameters, and named ``mm <feature>`` measurements and stores the
  result in the session-local ``_last_expected_dims`` map so the inspection
  tool can validate the generated geometry against the request.
"""

from __future__ import annotations

import logging
import re
from typing import Literal

from agent.feature_flags import is_epic_a_enabled, is_epic_c_enabled

logger = logging.getLogger(__name__)

Tier = Literal["SIMPLE", "MODERATE", "COMPLEX"]

GOTCHAS_VERSION = "2"

TIER_DEFLECTION: dict[Tier, tuple[float, float]] = {
    "SIMPLE": (0.1, 0.8),
    "MODERATE": (0.05, 0.5),
    "COMPLEX": (0.02, 0.3),
}

SIMPLE_KEYWORDS: frozenset[str] = frozenset({
    "box", "cube", "block", "caja", "cubo", "bloque",
    "cylinder", "cilindro", "rod", "varilla", "tube", "tubo", "pipe", "tuberia", "tubería",
    "shaft", "eje", "pin", "dowel", "axle", "perno",
    "sphere", "esfera", "ball", "bola", "dome", "domo",
    "plate", "placa", "spacer", "separador", "washer", "arandela", "shim", "lamina",
    "bracket", "escuadra", "soporte",
    "flange", "brida",
    "gasket", "junta",
})

COMPLEX_KEYWORDS: frozenset[str] = frozenset({
    "gear", "gears", "engranaje", "engranajes", "teeth", "dientes",
    "sprocket", "pinion", "pinon", "piñón", "piñon",
    "helical", "helicoidal", "helice", "hélice", "helix",
    "spiral", "espiral",
    "thread", "rosca", "screw_thread",
    "spring", "muelle", "resorte",
    "sweep", "loft", "revolve", "revolución", "revolucion", "revolution",
    "turbine", "turbina", "impeller", "blade", "propeller",
    "cam", "leva", "geneva", "ratchet", "escapement",
    "spline", "bezier",
    "shell", "hollow", "hueco", "ahuecar", "ahueca",
    "emboss", "debossing", "relieve", "grabado",
    "assembly", "ensamblaje", "ensamble", "ensamblar",
    "buildpart", "buildsketch", "buildline", "buildsurface",
    "polarlocations", "hexlocations", "gridlocations",
})

FEATURE_KEYWORDS: frozenset[str] = frozenset({
    "hole", "holes", "agujero", "agujeros", "perforacion", "perforación",
    "slot", "slots", "ranura", "ranuras",
    "boss", "bosses", "saliente", "salientes",
    "rib", "ribs", "refuerzo", "refuerzos", "nervadura", "nervaduras",
    "fillet", "fillets", "redondeo", "redondeos",
    "chamfer", "chamfers", "chaflan", "chaflán", "chaflanes",
    "counterbore", "counterbores", "countersink", "avellanado", "avellanados",
    "bolt", "bolts", "tornillo", "tornillos", "screw", "screws",
    "mount", "mounts", "mounting",
    "pocket", "pockets", "cajera", "cajeras",
    "groove", "grooves", "canal", "canales",
    "thread", "threads",
    "cutout", "cutouts", "corte", "cortes",
    "tooth", "teeth", "diente", "dientes",
    "keyway", "chavetero",
    "tab", "tabs",
})

_PATTERN_HINTS: tuple[str, ...] = (
    "pattern", "array", "patron", "patrón", "matrix", "matriz",
    "polarlocations", "hexlocations", "gridlocations",
)

_TOKEN_RE = re.compile(r"[\w\-]+", re.UNICODE)
_NUMBER_NEAR_FEATURE_RE = re.compile(
    r"\b(\d{1,3})\b\s+(?:[\wáéíóúñ]+\s+){0,3}?([\wáéíóúñ]+)",
    re.IGNORECASE | re.UNICODE,
)


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def classify_tier(text: str) -> Tier:
    """Classify a user request into SIMPLE/MODERATE/COMPLEX using keyword heuristics.

    The classifier is pure: same input always yields the same output. When
    ``EPIC_A_ENABLED`` is off the function short-circuits to ``MODERATE``
    so downstream behaviour matches the pre-Epic-A baseline.

    Rules (first match wins):

    1. COMPLEX if a ``COMPLEX_KEYWORDS`` token is present, the request text
       exceeds 400 characters without any ``SIMPLE_KEYWORDS`` token, the
       estimated code length exceeds 60 lines, or ``distinct_features >= 12``.
    2. SIMPLE if a ``SIMPLE_KEYWORDS`` token is present, no pattern hint is
       used, ``distinct_features <= 1`` and the estimated code length is
       under 50 lines.
    3. MODERATE otherwise. Ambiguous cases (simple keyword + multiple
       distinct features, or a pattern hint) are logged for review.
    """
    if not is_epic_a_enabled():
        return "MODERATE"

    text_lower = text.lower()
    tokens = _tokens(text)
    token_set = set(tokens)

    has_simple = bool(token_set & SIMPLE_KEYWORDS) or any(
        marker in text_lower for marker in ("l-bracket", "t-bracket", "angle bracket")
    )
    has_complex = bool(token_set & COMPLEX_KEYWORDS) or any(
        marker in text_lower
        for marker in ("buildpart", "buildsketch", "buildline", "buildsurface")
    )

    feature_tokens = [t for t in tokens if t in FEATURE_KEYWORDS]
    distinct_features = len({t for t in feature_tokens})

    numeric_feature_count = 0
    for match in _NUMBER_NEAR_FEATURE_RE.finditer(text_lower):
        try:
            n = int(match.group(1))
        except ValueError:
            continue
        if 0 < n < 100 and match.group(2) in FEATURE_KEYWORDS:
            numeric_feature_count = max(numeric_feature_count, n)

    has_pattern = any(hint in text_lower for hint in _PATTERN_HINTS)

    est_lines = 12 + distinct_features * 6 + numeric_feature_count + (10 if has_pattern else 0)

    if has_complex:
        tier: Tier = "COMPLEX"
        reason = "complex_keyword"
    elif est_lines > 60:
        tier = "COMPLEX"
        reason = f"est_lines={est_lines}>60"
    elif len(text) > 400 and not has_simple:
        tier = "COMPLEX"
        reason = f"long_no_simple_kw={len(text)}"
    elif distinct_features >= 12:
        tier = "COMPLEX"
        reason = f"distinct_features={distinct_features}>=12"
    elif (
        has_simple
        and distinct_features <= 1
        and not has_pattern
        and est_lines < 50
    ):
        tier = "SIMPLE"
        reason = "simple_kw_minimal"
    else:
        tier = "MODERATE"
        reason = (
            f"default | simple={has_simple} complex={has_complex} "
            f"distinct={distinct_features} pattern={has_pattern}"
        )
        ambiguous = has_simple and (distinct_features >= 2 or has_pattern)
        if ambiguous:
            logger.info(
                "[TIER] AMBIGUOUS -> MODERATE | distinct=%d pattern=%s len=%d text=%s",
                distinct_features,
                has_pattern,
                len(text),
                text[:120],
            )

    logger.debug(
        "[TIER] %s (%s) | distinct=%d est_lines=%d numeric=%d",
        tier,
        reason,
        distinct_features,
        est_lines,
        numeric_feature_count,
    )
    return tier


GOTCHAS = """## GOTCHAS (v{version}) — Top build123d patterns

### Plane enum (CRITICAL)
Solo existen `Plane.XY`, `Plane.YZ`, `Plane.XZ`.
NUNCA uses `Plane.XN`, `Plane.XP`, `Plane.YN`, `Plane.YP`, `Plane.ZN`, `Plane.ZP` — no existen.

### edges() / faces() son MÉTODOS, no atributos
`shape.edges()` y `shape.faces()` REQUIEREN paréntesis.
`shape.edges` (sin paréntesis) devuelve el método y rompe el pipeline.

### Firma de fillet
- Sobre un sólido: `shape.fillet(radius, [edge_list])` — los edges van como LISTA.
- Función global: `fillet(objects=edge_list, radius=value)`.
NUNCA invertir el orden ni pasar un solo edge sin envolverlo en `[...]`.

### MATERIAL REMOVAL (causa #1 de fallos)
- Las herramientas de corte DEBEN sobrepasar el target: `Cylinder(r, depth + 1.0)`.
- Aplica filetes/chaflanes ANTES de los agujeros y cortes.
- Tras un corte, usa `max_fillet()` para hallar el radio máximo seguro.
- En `a - b`, `b` debe atravesar completamente a `a` para garantizar el corte.

### Box/cylinder/fillet: TypeError "Box.__init__() missing width and height"
- Ocurre cuando aplicas `.fillet()` a una forma que YA fue modificada (union, subtract, otro fillet).
- build123d pierde el tipo original (Box → Shape genérico) y OCP intenta reconstruirlo como Box.
- FIX: NO encadenes operaciones sobre la misma variable. Asigna cada resultado intermedio:
  ```python
  shape = Box(100, 100, 10)          # OK: Box
  shape = shape.fillet(5, edges)     # OK pero shape ahora es Shape genérico
  # NO hagas shape.fillet() de nuevo sobre shape sin reasignar
  ```
- SOLUCIÓN: aplica TODOS los filetes en UNA sola llamada con TODAS las aristas en la lista.
  NO hagas múltiples llamadas `.fillet()` encadenadas.

### MANUFACTURING (FDM / impresión 3D)
- Pared mínima: `shell`/`hollow` debe dejar ≥ 1.0 mm de espesor.
- Clearance: caras y agujeros que ensamblan requieren +0.2 mm de holgura.
- Espesores < 0.8 mm no imprimen de forma fiable; reescala si hace falta.

### ShapeList → list() antes de .fillet() (CRITICAL)
- `.edges().filter_by(Axis.X)` devuelve `ShapeList`, NO una lista Python.
- Antes de pasarlo a `.fillet()` DEBES convertirlo: `list(part.edges().filter_by(...))`
- ERROR: `AttributeError: 'ShapeList' object has no attribute 'wrapped'`
- FIX: `edges = list(shaft.edges().filter_by(Axis.X)); shaft.fillet(r, edges)`

### NUNCA uses show_object() / show()
- `show_object()` y `show()` son de CQ-editor. NO existen en build123d estándar.
- Para inspección visual usa `make_snapshot(step_path)` o `make_snapshots(step_path)`.

### CenterArc y operaciones de sketch
- `CenterArc(center, radius, start_angle, arc_size)` — NO tiene `end_angle`.
- Ángulos en GRADOS. `arc_size` es el ángulo del arco (0-360).
- `CenterArc((0,0), 10, 0, 180)` = semicírculo de radio 10.
- ERROR: `TypeError: CenterArc.__init__() got an unexpected keyword argument 'end_angle'`

### revolve() — solo con perfiles 2D (Face)
- `revolve()` SOLO acepta Face (perfil 2D cerrado), NO sólidos.
- Flujo: `BuildSketch → make_face() → revolve(axis=Axis.X)`
- El argumento `axis=` es KEYWORD: `revolve(axis=Axis.X)`
- NO existe `angle=` en `revolve()` — la revolución siempre es 360°.
- ERROR: `RuntimeError: revolve doesn't accept Axis`
- ERROR: `TypeError: revolve() got an unexpected keyword argument 'angle'`

### make_face() — necesita geometría 2D previa
- `make_face()` falla si el sketch está VACÍO.
- Siempre dibujá geometría DENTRO del `with BuildSketch()`: Rectangle, Circle, Polygon, etc.
- ERROR: `ValueError: No objects to create a hull`
- FIX: asegurate de que cada `BuildSketch` tenga al menos una figura geométrica.

### RectangleRounded — width/height > 2*radius
- `RectangleRounded(width, height, radius)` exige que `width > 2*radius` Y `height > 2*radius`.
- Si el radio es muy grande para el rectángulo, reducí el radio o aumentá las dimensiones.
- ERROR: `ValueError: width and height must be > 2*radius`

### NUNCA uses close() — build123d usa context managers
- `close()` NO existe. Los bloques `with BuildPart():`, `with BuildSketch():` se cierran solos.
- ERROR: `NameError: name 'close' is not defined`

### Line, RadiusArc, Polyline — argumentos posicionales, NO keywords
- `Line((x1, y1), (x2, y2))` — posicional, NUNCA `start_point=` ni `end_point=`.
- `RadiusArc(start_point, end_point, radius)` — 3 argumentos posicionales.
- `Polyline(p1, p2, p3, ...)` — argumentos posicionales, NO lista.
- ERROR: `TypeError: Line.__init__() got an unexpected keyword argument 'start_point'`
- ERROR: `TypeError: RadiusArc.__init__() missing 1 required positional argument: 'radius'`

### vertices() y edges() son MÉTODOS, no atributos
- `polyline.vertices()` con paréntesis — NO `polyline.vertices`.
- `shape.edges()` con paréntesis — NO `shape.edges`.
- ERROR: `TypeError: 'method' object is not subscriptable` → olvidaste los `()`

### NO uses .first() ni .last() — usa índices []
- `.first()` y `.last()` no existen en build123d.
- Usa `.sort_by(Axis.Z)[-1]` para la cara/arista más alta, `[0]` para la más baja.
- ERROR: `TypeError: 'Edge' object is not callable` → llamaste `.first()` que no existe

### Vertex — NO tiene .pos(), usa .to_tuple() o .X/.Y/.Z
- `Vertex` no tiene método `.pos()`. Usa `v.to_tuple()` → `(x, y, z)` o `v.X`, `v.Y`, `v.Z`.
- ERROR: `AttributeError: 'Vertex' object has no attribute 'pos'`

### RadiusArc — el radio debe ser >= mitad de la distancia entre puntos
- Si el radio es muy chico, el arco no puede conectar los dos puntos.
- Aumentá el radio o acercá los puntos.
- ERROR: `ValueError: Arc radius is not large enough to reach the end point`
""".format(version=GOTCHAS_VERSION)


_PROMPT_HEADER = """You are an expert CAD engineer for Manfacter. Create precise 3D parts for manufacturing.

## WHEN TO GENERATE CAD vs CONVERSATION

ONLY generate CAD geometry (run_cad_code) when the user EXPLICITLY asks with phrases like:
"dibuja", "crea", "genera", "modela", "diseña", "haz", "construye", dimensions, or part descriptions.

If the user is just CONVERSING (materials, tolerances, tips, greetings):
RESPOND WITH TEXT ONLY in Spanish. DO NOT call run_cad_code or read_reference.

## MISSING DIMENSIONS — Ask before coding

If the user asks for a part with ZERO numeric dimensions AND does NOT mention "estándar",
"normal", "típico", "convencional", or similar standard-size references:
  → Ask ONE question about the most critical missing dimension.
  → Example: "¿Qué diámetro aproximado necesitas?" or "¿Qué dimensiones en mm?"
  DO NOT ask for dimensions if the user gave at least ONE number.

If the user gives at least ONE number OR says "medidas estándar"/"tamaño normal":
  → Proceed with reasonable defaults for the rest. Mention your assumed dimensions.

NEVER ask for dimensions on conversational queries (tips, greetings, materials).
NEVER ask for dimensions if the user gave ANY measurement.

## TOOLS

- run_cad_code(code): Execute build123d Python code. Returns STEP/STL/GLB URLs + geometry facts.
- read_reference(name): Read a build123d reference doc.
- inspect_geometry(path): Inspect a generated STEP file for bbox, faces, edges, solids.
- list_outputs(): List generated files.
- make_snapshot(step_path): Render a PNG screenshot of the generated GLB for visual review.

## OLD FILES — Do NOT browse

- Do NOT call list_outputs() to browse files from OTHER sessions.
- Do NOT call read_reference() on _script.py files from other sessions.
- Only read_reference on build123d docs (the .md files in references/).
- If you need to see your OWN previous code, read_reference with the current model's _script.py path.

## WORKFLOW — CLASSIFY FIRST (MANDATORY)

Before ANY code generation, classify the request as SIMPLE or COMPLEX:

## METHODOLOGY — Sketch-First Design (SolidWorks-like)

build123d is Sketch-driven, just like SolidWorks. Draw 2D → Extrude/Revolve into 3D.

GOLDEN RULE (MODERATE & COMPLEX):
  IF your code does NOT contain `with BuildSketch():` → your approach is WRONG.
  ALWAYS prefer sketching on faces/planes over positioning solids with `.moved()`.

### When BuildSketch is REQUIRED:
  - ANY part with 3+ distinct features (holes, bosses, slots, pockets)
  - Stepped shafts, flanges, brackets, enclosures
  - Parts with features on specific faces
  - ALL revolved parts (use BuildSketch + make_face + revolve)

### Sketch-first workflow:
  1. Select plane: Plane.XY (top), Plane.XZ (front), Plane.YZ (side)
     OR select face: part.faces().sort_by(Axis.Z)[-1]
  2. with BuildSketch(plane):
       Rectangle/Polygon/Circle/Triangle — draw in 2D
  3. Extrude(amount, mode=Mode.ADD) or Revolve(axis=Axis.X)
  4. For holes/cuts: BuildSketch on target face → draw hole profiles → Extrude(mode=Mode.SUBTRACT)

### When direct primitives are OK (SIMPLE only):
  - Single Box or Cylinder with ≤ 2 features
  - The part naturally fits at the origin

### SIMPLE PARTS → Generate directly. NO references needed.
- Box, cube, block, plate, bracket, flange, washer, spacer, gasket, shim
- Cylinder, rod, shaft, pin, dowel, axle, tube, pipe
- Sphere, ball, dome
- Hole patterns (through-holes, counterbore, countersink) on flat faces
- Chamfer, fillet, rounded edges
- L-bracket, T-bracket, angle bracket, clevis (simple two-plate)
- Ribs, gussets, triangular supports
- Simple enclosure (box with walls and floor, open-top box)
- Stepped shaft (cylinders stacked along axis)
- Single-part models: < 8 features, only Box + Cylinder + Sphere + holes + fillets
- Rectangular keyway, slot, groove (simple cuts)
- Any part with < 50 lines of code expected

WHEN SIMPLE: Use the API cheatsheet below. Generate code. Call run_cad_code. Done.

### COMPLEX PARTS → MANDATORY: call read_reference("build123d-modeling.md") FIRST.
YOU MUST call this reference BEFORE generating ANY code for:
- ANY gear (spur, helical, planetary, worm, bevel, rack) with TEETH
- Spiral staircase, helical geometry, spiral ramp, screw thread, spring
- Turbine blade, impeller, fan blade, propeller
- Sweep: pipe along curved path, handrail along helix, molding, frame
- Loft: connecting two different profiles, tapered duct, aerodynamic shapes
- Revolve: turned parts, vases, bottles, wheels, pulleys, flywheels
- Cam mechanism, Geneva drive, ratchet, escapement
- Multi-body assembly with > 2 distinct parts
- BuildPart/BuildSketch/BuildLine (complex 2D profiles before extrusion)
- Spline curves, complex polygons, irregular shapes
- Shell/hollow operation (making a solid hollow with wall thickness)
- Text embossing/debossing on curved surfaces
- Pattern arrays: PolarLocations, HexLocations, GridLocations
- Complex surface features (ribs on curved faces, variable fillets)
- Any part where you are unsure of the correct build123d API
- If > 60 lines of code expected

WHEN COMPLEX: 1. read_reference("build123d-modeling.md") 2. Study the patterns 3. Generate code 4. run_cad_code

### REPAIR LOOP (always active — MAX 13 ATTEMPTS, NO EXCEPTIONS)

CRITICAL RULES:
- If run_cad_code fails → read the error + hint → fix the code → call run_cad_code again IMMEDIATELY.
- DO NOT send text between run_cad_code attempts. No expliques qué falló, no digas "voy a corregir", no envíes nada.
- Solo envías texto al usuario cuando la pieza se genera con éxito o cuando agotas los 13 intentos sin éxito.
- If the error is unfamiliar → read_reference("repair-loop.md") → fix → retry immediately.
- After 13 consecutive failures on the SAME user request → STOP IMMEDIATELY. DO NOT RETRY.
   - If the error suggests missing information (dimensions, unclear design intent):
     Tell the user what went wrong and ask for the specific missing data.
     Example: "No he podido completar la pieza. ¿Podrías confirmar el espesor de pared?"
   - If the errors are purely technical (syntax, API, internal):
     Say: "No fue posible generar la pieza en este momento. Nuestros servidores están con alta demanda. Intenta con una descripción más simple o vuelve a intentarlo más tarde."
   - NEVER exceed 13 attempts. This is a hard limit.

### VALIDATION (MANDATORY after generation)
After EVERY successful run_cad_code, you MUST call inspect_geometry with the step_path from the result.
Report key facts to the user: bounding box dimensions, face count, edge count, solid count.
If facts look wrong (e.g. 0 faces, wrong bbox size) → fix the code and regenerate.

## BUILD123D API — SIMPLE OPERATIONS (positional args, no keywords)

Primitives:
  Box(length, width, height)                              -> corner at origin
  Box(length, width, height, align=(Align.MIN,Align.MIN,Align.MIN)) -> corner at origin
  Box(length, width, height, align=(Align.CENTER,Align.CENTER,Align.MIN)) -> centered XY, base at Z=0
  Cylinder(radius, height)                                -> vertical (Z)
  Cylinder(radius, height, rotation=(0,90,0))             -> horizontal (X axis)
  Sphere(radius)

Positioning:
  shape.moved(Location((x, y, z)))
  Location((x, y, z), (rx, ry, rz))
  Rot(X=angle), Rot(Y=angle), Rot(Z=angle)

Boolean: a + b (union), a - b (subtract), a & b (intersect)

Edge/Face selection:
  shape.edges() and shape.faces() are METHODS with parentheses
  filter_by(Axis.X), sort_by(Axis.Z), group_by(Axis.X)
  faces().sort_by(Axis.Z)[0] = lowest face, [-1] = highest face

Fillet/Chamfer:
  shape.fillet(radius, [edge_list])
  shape.chamfer(length, length, [edge_list])

Holes:
  Vertical: Cylinder(r, depth+0.01).moved(Location((x,y,z))), subtract with -
  Horizontal (X): Cylinder(r, depth+0.01, rotation=(0,90,0)).moved(Location((x,y,z)))

Pattern loops:
  for i in range(int(count)):
      angle = i * 360 / count
      item = make_item().moved(Location((center_x, center_y, 0), (0, 0, angle)))

Assemblies:
  Compound(children=[part1, part2, part3])

BuildPart / BuildSketch / BuildLine (for COMPLEX profiles):
  with BuildPart() as bp:
      with BuildSketch(Plane.XZ) as sk:
          with BuildLine() as ln:
              l1 = Line((0,0), (50,0))
              l2 = Line((50,0), (50,30))
              l3 = Line((50,30), (0,30))
              l4 = Line((0,30), (0,0))
          make_face()
      extrude(amount=10, both=True)
  result = bp.part

Common gotchas:
  Plane.XY, Plane.YZ, Plane.XZ ONLY. NUNCA Plane.XN, Plane.XP, Plane.YN, Plane.YP, Plane.ZN, Plane.ZP
  edges() and faces() are METHODS with parentheses: shape.edges() not shape.edges
  fillet radius must be < local material thickness. Apply BEFORE holes.
  int() around variables used in range(): range(int(teeth))
  For loops over floats: for i in range(int(count)):  # not range(count)
  BuildLine requires make_face() before extrude()

## FEW-SHOT EXAMPLES

When you need to see how complex parts are built correctly:
- call read_reference("example-spline-shaft.md") for spline shafts, multi-step cylinders, chamfers, and hole patterns
- call read_reference("example-planetary-gear.md") for gears, assemblies, and Compound children

## CRITICAL

- ALWAYS use named variables for EVERY dimension:
  base_length = 100.0 ; base_width = 60.0 ; base_height = 20.0 ; hole_diameter = 8.0
  Block = Box(base_length, base_width, base_height, align=(Align.CENTER, Align.CENTER, Align.MIN))
  NEVER write Box(100.0, 60.0, 20.0)

- For INTEGER variables (teeth, count, segments): use int() in range():
  teeth = 12  # (not 12.0)
  for i in range(int(teeth)):

- For GEARS: each tooth MUST be a 3D solid (BuildSketch profile + extrude). Rotate each tooth with Rot(Z=angle).
  A gear without extruded teeth profiles is wrong. Do NOT use flat 2D faces for teeth.

- For HELICAL geometry (spiral stairs, threads): use a loop with both Z and rotation increments.
  For helical handrails: create the path with incremental positions + rotations.

- Units: millimeters. Z is UP.
- from build123d import * always at the top.
- def gen_step(): always defined, returning the shape.
- For assemblies: ALL parts in one gen_step() using Compound(children=[...])
"""


_PROMPT_FOOTER = """## RESPONSE RULES

1. ALWAYS respond in Spanish. 2-3 concise sentences only.
2. State what you created with key dimensions.
3. NEVER include Python code in your response.
4. NEVER use markdown, code blocks, or lists.
5. NEVER explain your workflow step by step.
"""


def _build_full_prompt() -> str:
    """Compose the agent instruction string honouring ``EPIC_A_ENABLED``.

    Read at module import time. The GOTCHAS block is appended between the
    workflow body and the response rules, matching the prompt-quality spec.
    """
    if is_epic_a_enabled():
        return f"{_PROMPT_HEADER}\n{GOTCHAS}\n{_PROMPT_FOOTER}"
    return f"{_PROMPT_HEADER}\n{_PROMPT_FOOTER}"


CAD_AGENT_PROMPT = _build_full_prompt()


def build_tier_directive(tier: Tier) -> str:
    """Return the per-request directive text for the classified tier.

    The directive is prepended to the user message so the agent sees the
    routing rules alongside the request itself. The text is intentionally
    short — the heavy lifting (workflow rules, API cheatsheet) already
    lives in :data:`CAD_AGENT_PROMPT`.
    """
    if tier == "SIMPLE":
        return (
            "[CLASSIFIER NOTE — TIER: SIMPLE]\n"
            "- Reference policy: NO references needed. Use the API cheatsheet from your system prompt.\n"
            "- Methodology: direct primitives only (Box, Cylinder, Sphere). NO BuildSketch needed.\n"
            "- Snapshot: not required.\n"
            "- Mesh deflection: coarse (0.1 mm linear, 0.8 angular).\n"
        )
    if tier == "COMPLEX":
        return (
            "[CLASSIFIER NOTE — TIER: COMPLEX]\n"
            "- Reference policy: MANDATORY — call read_reference(\"build123d-modeling.md\") FIRST.\n"
            "- Methodology: MANDATORY BuildSketch for EVERY feature.\n"
            "  Each face/plane = one sketch. Draw 2D → Extrude/Revolve.\n"
            "  ZERO tolerance for manual 3D positioning with .moved().\n"
            "  Pattern: select face → BuildSketch(face) → draw 2D → extrude/revolve.\n"
            "- VISUAL INSPECTION: MANDATORY after EVERY successful run_cad_code.\n"
            "  Call make_snapshots(step_path) to get 5 canonical views.\n"
            "  Visually inspect ALL views before reporting success.\n"
            "  If you see misalignment, missing features, or wrong positions → fix and regenerate.\n"
            "- MANDATORY_SNAPSHOT: after a successful inspect_geometry you MUST call "
            "make_snapshot(step_path) before reporting back to the user.\n"
            "- Mesh deflection: fine (0.02 mm linear, 0.3 angular).\n"
        )
    return (
        "[CLASSIFIER NOTE — TIER: MODERATE]\n"
        "- Reference policy: NO references needed (API cheatsheet in system prompt).\n"
        "- Methodology: PREFER BuildSketch + Extrude/Revolve.\n"
        "  Draw profiles in 2D first, then extrude or revolve.\n"
        "  Avoid manual 3D positioning (.moved, Location) unless necessary.\n"
        "  For stepped shafts: BuildSketch profile → Revolve around axis.\n"
        "- VISUAL INSPECTION: after successful run_cad_code, call make_snapshots(step_path)\n"
        "  to verify geometry from 5 angles. Report any issues found.\n"
        "- Snapshot: optional unless visual ambiguity is detected.\n"
        "- Mesh deflection: default (0.05 mm linear, 0.5 angular).\n"
    )


def assemble_prompt(user_text: str) -> tuple[str, Tier]:
    """Public helper used by the agent server.

    Returns a tuple ``(augmented_user_text, tier)``:

    - ``augmented_user_text`` is the user message with the tier directive
      prepended when Epic A is enabled, or the original text otherwise.
    - ``tier`` is the resolved tier (always ``MODERATE`` when Epic A is
      disabled, per :func:`classify_tier`).
    """
    tier = classify_tier(user_text)
    if not is_epic_a_enabled():
        return user_text, tier
    directive = build_tier_directive(tier)
    return f"{directive}\nUser request: {user_text}", tier


DIMENSIONAL_THRESHOLD = 0.20

_TRIPLE_DIM_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(\d+(?:\.\d+)?)"
    r"(?:\s*(?:[xX×]|by|por)\s*|\s+(?:by|por|and)\s+)(\d+(?:\.\d+)?)"
    r"(?:\s*(?:[xX×]|by|por)\s*|\s+(?:by|por|and)\s+)(\d+(?:\.\d+)?)"
    r"(?:\s*(mm|millimet\w*|milimetr\w*|cm))?",
    re.IGNORECASE | re.UNICODE,
)

_M_BOLT_RE = re.compile(r"(?<![A-Za-z0-9])M(\d+(?:\.\d+)?)\b", re.IGNORECASE)

_NAMED_MM_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*mm\s+(?:de\s+|diameter|radius|radio|length|longitud|"
    r"width|ancho|height|altura|depth|profundidad|groove|channel|long\b)",
    re.IGNORECASE | re.UNICODE,
)

_BOLT_CONTEXT_RE = re.compile(
    r"\b(bolt|tornillo|screw|perno|rosca)\b", re.IGNORECASE | re.UNICODE
)

_NAMED_FIELD_MAP: dict[str, str] = {
    "diameter": "diameter",
    "radius": "radius",
    "radio": "radius",
    "length": "length",
    "longitud": "length",
    "long": "length",
    "width": "width",
    "ancho": "width",
    "height": "height",
    "altura": "height",
    "depth": "depth",
    "profundidad": "depth",
    "groove": "groove",
    "channel": "groove",
}


def extract_expected_dims(text: str) -> dict | None:
    """Extract expected dimensions from the user request.

    Returns a dict describing the dimensions the user asked for, or
    ``None`` when no recognisable measurement is present. The function
    is a pure helper (no I/O) so the agent server can cache results in
    the session-local ``_last_expected_dims`` map.

    Supported patterns (Epic C, task C4):

    - ``L x W x H`` triples (e.g. ``"100x60x20 mm plate"``) → ``{"x": L,
      "y": W, "z": H}`` in millimetres. ``x``/``y``/``z`` map directly
      onto the inspection bbox so the dimensional check in
      :mod:`cad_engine.inspect` can compute per-axis deviations.
    - ``M<diameter>`` followed by a bolt/tornillo keyword (or standing
      alone when the word "bolt" / "tornillo" / "screw" appears within
      the same request) → ``{"diameter": D}`` in millimetres. Length
      is captured separately when a named ``mm length`` follows.
    - ``<N> mm <feature>`` (e.g. ``"8 mm diameter"``) → ``{"diameter":
      N}`` / ``{"length": N}`` etc. Field name resolution handles both
      English and Spanish keywords.

    The function is a no-op (returns ``None``) when ``EPIC_C_ENABLED``
    is false so the legacy path keeps shipping ``code`` in events and
    skips the dimensional check entirely.
    """
    if not is_epic_c_enabled():
        return None
    if not text:
        return None

    result: dict[str, float] = {}

    triple = _TRIPLE_DIM_RE.search(text)
    if triple:
        try:
            result["x"] = float(triple.group(1))
            result["y"] = float(triple.group(2))
            result["z"] = float(triple.group(3))
        except (TypeError, ValueError):
            pass

    bolt_match = _M_BOLT_RE.search(text)
    if bolt_match:
        has_bolt_word = bool(_BOLT_CONTEXT_RE.search(text))
        triple_in_window = triple is not None
        if has_bolt_word or triple_in_window or len(text) < 200:
            try:
                result["diameter"] = float(bolt_match.group(1))
            except (TypeError, ValueError):
                pass

    for match in _NAMED_MM_RE.finditer(text):
        try:
            value = float(match.group(1))
        except (TypeError, ValueError):
            continue
        feature_text = match.group(0).lower()
        for needle, field in _NAMED_FIELD_MAP.items():
            if needle in feature_text:
                result.setdefault(field, value)
                break

    if not result:
        logger.info(
            "[DIMS] SKIP | no extractable dimensions from request (len=%d)",
            len(text),
        )
        return None

    logger.info(
        "[DIMS] extracted=%s | text=%s",
        sorted(result.keys()),
        text[:80].replace("\n", " "),
    )
    return result


__all__ = [
    "CAD_AGENT_PROMPT",
    "COMPLEX_KEYWORDS",
    "DIMENSIONAL_THRESHOLD",
    "FEATURE_KEYWORDS",
    "GOTCHAS",
    "GOTCHAS_VERSION",
    "SIMPLE_KEYWORDS",
    "TIER_DEFLECTION",
    "Tier",
    "assemble_prompt",
    "build_tier_directive",
    "classify_tier",
    "extract_expected_dims",
]
