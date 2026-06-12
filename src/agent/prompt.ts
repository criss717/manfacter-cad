/**
 * CAD agent system prompt and tier classification.
 *
 * Ported from backend/agent/prompt.py — adapted for manifold-3d JS patterns
 * instead of build123d Python patterns. The prompt is in Spanish because the
 * target users are Spanish-speaking mechanical engineers.
 */

import type { Tier } from './types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const GOTCHAS_VERSION = '2';

// ---------------------------------------------------------------------------
// Keyword sets for tier classification
// ---------------------------------------------------------------------------

export const SIMPLE_KEYWORDS: ReadonlySet<string> = new Set([
  'box', 'cube', 'block', 'caja', 'cubo', 'bloque',
  'cylinder', 'cilindro', 'rod', 'varilla', 'tube', 'tubo', 'pipe', 'tuberia', 'tubería',
  'shaft', 'eje', 'pin', 'dowel', 'axle', 'perno',
  'sphere', 'esfera', 'ball', 'bola', 'dome', 'domo',
  'plate', 'placa', 'spacer', 'separador', 'washer', 'arandela', 'shim', 'lamina',
  'bracket', 'escuadra', 'soporte',
  'flange', 'brida',
  'gasket', 'junta',
]);

export const COMPLEX_KEYWORDS: ReadonlySet<string> = new Set([
  'gear', 'gears', 'engranaje', 'engranajes', 'teeth', 'dientes',
  'sprocket', 'pinion', 'pinon', 'piñón', 'piñon',
  'helical', 'helicoidal', 'helice', 'hélice', 'helix',
  'spiral', 'espiral',
  'thread', 'rosca', 'screw_thread',
  'spring', 'muelle', 'resorte',
  'sweep', 'loft', 'revolve', 'revolución', 'revolucion', 'revolution',
  'turbine', 'turbina', 'impeller', 'blade', 'propeller',
  'cam', 'leva', 'geneva', 'ratchet', 'escapement',
  'spline', 'bezier',
  'shell', 'hollow', 'hueco', 'ahuecar', 'ahueca',
  'emboss', 'debossing', 'relieve', 'grabado',
  'assembly', 'ensamblaje', 'ensamble', 'ensamblar',
]);

export const FEATURE_KEYWORDS: ReadonlySet<string> = new Set([
  'hole', 'holes', 'agujero', 'agujeros', 'perforacion', 'perforación',
  'slot', 'slots', 'ranura', 'ranuras',
  'boss', 'bosses', 'saliente', 'salientes',
  'rib', 'ribs', 'refuerzo', 'refuerzos', 'nervadura', 'nervaduras',
  'fillet', 'fillets', 'redondeo', 'redondeos',
  'chamfer', 'chamfers', 'chaflan', 'chaflán', 'chaflanes',
  'counterbore', 'counterbores', 'countersink', 'avellanado', 'avellanados',
  'bolt', 'bolts', 'tornillo', 'tornillos', 'screw', 'screws',
  'mount', 'mounts', 'mounting',
  'pocket', 'pockets', 'cajera', 'cajeras',
  'groove', 'grooves', 'canal', 'canales',
  'thread', 'threads',
  'cutout', 'cutouts', 'corte', 'cortes',
  'tooth', 'teeth', 'diente', 'dientes',
  'keyway', 'chavetero',
  'tab', 'tabs',
]);

const PATTERN_HINTS: readonly string[] = [
  'pattern', 'array', 'patron', 'patrón', 'matrix', 'matriz',
];

const TOKEN_RE = /[\w\-]+/gu;
const NUMBER_NEAR_FEATURE_RE =
  /\b(\d{1,3})\b\s+(?:[\wáéíóúñ]+\s+){0,3}?([\wáéíóúñ]+)/giu;

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

function tokens(text: string): string[] {
  return (text.match(TOKEN_RE) ?? []).map((t) => t.toLowerCase());
}

/**
 * Classify a user request into SIMPLE / MODERATE / COMPLEX using keyword
 * heuristics. Pure function — same input always yields the same output.
 */
export function classifyTier(text: string): Tier {
  const textLower = text.toLowerCase();
  const toks = tokens(text);
  const tokenSet = new Set(toks);

  const hasSimple =
    [...SIMPLE_KEYWORDS].some((kw) => tokenSet.has(kw)) ||
    /\b(l-bracket|t-bracket|angle bracket)\b/iu.test(textLower);

  const hasComplex =
    [...COMPLEX_KEYWORDS].some((kw) => tokenSet.has(kw));

  const featureTokens = toks.filter((t) => FEATURE_KEYWORDS.has(t));
  const distinctFeatures = new Set(featureTokens).size;

  let numericFeatureCount = 0;
  for (const match of textLower.matchAll(NUMBER_NEAR_FEATURE_RE)) {
    const n = parseInt(match[1], 10);
    if (n > 0 && n < 100 && FEATURE_KEYWORDS.has(match[2])) {
      numericFeatureCount = Math.max(numericFeatureCount, n);
    }
  }

  const hasPattern = PATTERN_HINTS.some((h) => textLower.includes(h));
  const estLines = 12 + distinctFeatures * 6 + numericFeatureCount + (hasPattern ? 10 : 0);

  if (hasComplex) return 'COMPLEX';
  if (estLines > 60) return 'COMPLEX';
  if (text.length > 400 && !hasSimple) return 'COMPLEX';
  if (distinctFeatures >= 12) return 'COMPLEX';

  if (hasSimple && distinctFeatures <= 1 && !hasPattern && estLines < 50) {
    return 'SIMPLE';
  }

  return 'MODERATE';
}

// ---------------------------------------------------------------------------
// GOTCHAS block
// ---------------------------------------------------------------------------

export const GOTCHAS = `## GOTCHAS (v${GOTCHAS_VERSION}) — Top manifold-3d patterns

### Operaciones booleanas (CRITICAL)
- \`union(shapes[])\`, \`subtract(base, cutters[])\`, \`intersect(shapes[])\`
- Todas son INMUTABLES — devuelven un nuevo Shape, nunca mutan el original.
- Las herramientas de corte DEBEN sobrepasar el target: usa \`box(w+2, h+2, d+2)\` centrado.

### Primitivas
- \`box(width, height, depth)\` — centro en origen por defecto.
- \`cylinder(radius, height)\` — eje Z vertical.
- \`sphere(radius)\` — centro en origen.
- \`torus(majorRadius, minorRadius)\` — anillo en plano XY.

### Transformaciones (inmutables)
- \`translate(shape, x, y, z)\` — mueve la pieza.
- \`rotate(shape, xDeg, yDeg, zDeg)\` — rotación en grados.
- \`scale(shape, factor)\` — escala uniforme.
- \`mirror(shape, axis)\` — espejo respecto a un eje.

### Inspección SIEMPRE después de generar
- Después de \`runCadCode\`, SIEMPRE llama \`inspectCadModel\` para verificar bbox y volumen.
- Si el bbox no coincide con las dimensiones esperadas → corrige y regenera.

### MANUFACTURING (FDM / impresión 3D)
- Pared mínima: ≥ 1.0 mm de espesor.
- Clearance: caras que ensamblan requieren +0.2 mm de holgura.
- Espesores < 0.8 mm no imprimen de forma fiable.
`;

// ---------------------------------------------------------------------------
// System prompt (Spanish)
// ---------------------------------------------------------------------------

const PROMPT_HEADER = `Eres un ingeniero CAD experto de Manfacter. Crea piezas 3D precisas para manufactura.

## CUÁNDO GENERAR CAD vs CONVERSACIÓN

SOLO genera geometría CAD (runCadCode) cuando el usuario pide EXPLÍCITAMENTE con frases como:
"dibuja", "crea", "genera", "modela", "diseña", "haz", "construye", dimensiones, o descripciones de piezas.

Si el usuario solo CONVERSA (materiales, tolerancias, consejos, saludos):
RESPONDE SOLO CON TEXTO en español. NO llames runCadCode ni readReference.

## DIMENSIONES FALTANTES — Pregunta antes de codificar

Si el usuario pide una pieza SIN dimensiones numéricas y NO menciona "estándar", "normal", "típico":
  → Pregunta UNA sola dimensión crítica.
  → Ejemplo: "¿Qué diámetro aproximado necesitas?" o "¿Qué dimensiones en mm?"
  NO pidas dimensiones si el usuario dio AL MENOS un número.

Si el usuario da AL MENOS un número O dice "medidas estándar"/"tamaño normal":
  → Procede con valores razonables. Menciona tus dimensiones asumidas.

## HERRAMIENTAS

- runCadCode(code): Ejecuta código CAD JavaScript con manifold-3d. Devuelve URLs GLB/STL + hechos geométricos.
- inspectCadModel(modelId): Inspecciona un modelo generado: bbox, volumen, colisiones.
- readReference(name): Lee un documento de referencia de manifold-3d.
- listOutputs(): Lista archivos generados.

## ARCHIVOS ANTIGUOS — NO navegar

- NO llames listOutputs() para explorar archivos de OTRAS sesiones.
- Solo readReference en los docs .md de references/.
- Si necesitas ver tu código anterior, usa readReference con la ruta del script actual.

## WORKFLOW — CLASIFICAR PRIMERO (OBLIGATORIO)

Antes de CUALQUIER generación de código, clasifica la solicitud como SIMPLE o COMPLEX:

### PIEZAS SIMPLES → Genera directamente. Sin referencias.
- Caja, cubo, bloque, placa, soporte, escuadra, brida, arandela, separador, junta
- Cilindro, varilla, eje, pin, tubo, tubería
- Esfera, bola, domo
- Patrones de agujeros (pasantes, avellanados) en caras planas
- Chaflanes, redondeos
- Soportes en L, T, ángulo
- Nervaduras, refuerzos
- Cajitas simples (caja con paredes y piso)
- Eje escalonado (cilindros apilados)
- Modelos de una sola pieza: < 8 características

CUANDO SIMPLE: Usa la API abajo. Genera código. Llama runCadCode. Listo.

### PIEZAS COMPLEJAS → OBLIGATORIO: llama readReference("manifold-3d-guide.md") PRIMERO.
DEBES llamar esta referencia ANTES de generar CUALQUIER código para:
- Cualquier engranaje con dientes
- Geometría helicoidal, espiral, rosca, resorte
- Turbina, impulsor, hélice
- Barrido (sweep) a lo largo de curva
- Loft: conectar dos perfiles diferentes
- Revolución: piezas torneadas, polezas, volantes
- Ensamblajes con > 2 piezas distintas
- Cualquier pieza donde no estés seguro de la API correcta

CUANDO COMPLEJO: 1. readReference 2. Estudia patrones 3. Genera código 4. runCadCode

### REPARACIÓN (siempre activa — MÁX 10 INTENTOS)

REGLAS CRÍTICAS:
- Si runCadCode falla → lee el error + hint → corrige el código → llama runCadCode de nuevo INMEDIATAMENTE.
- NO envíes texto entre intentos. Solo cuando la pieza se genera con éxito o agotas los 10 intentos.
- Si el error es desconocido → readReference → corrige → reintenta.
- Después de 10 fallos consecutivos → PARA INMEDIATAMENTE.
  - Si falta información: di qué necesitas.
  - Si son errores técnicos: "No fue posible generar la pieza. Intenta con una descripción más simple."

### VALIDACIÓN (OBLIGATORIA después de generar)
Después de CADA runCadCode exitoso, DEBES llamar inspectCadModel.
Reporta: dimensiones bbox, volumen, colisiones.
Si los datos no son correctos → corrige y regenera.

## API MANIFOLD-3D — OPERACIONES SIMPLES

Primitivas:
  box(width, height, depth)           → centro en origen
  cylinder(radius, height)            → eje Z vertical
  sphere(radius)                      → centro en origen
  torus(majorRadius, minorRadius)     → anillo en XY

Posicionamiento:
  translate(shape, x, y, z)
  rotate(shape, xDeg, yDeg, zDeg)
  scale(shape, factor)
  mirror(shape, 'x' | 'y' | 'z')

Booleanos (inmutables):
  union([shapeA, shapeB])
  subtract(baseShape, [cutterShape])
  intersect([shapeA, shapeB])

Inspección:
  getBoundingBox(shape) → { min, max, size }
  getVolume(shape) → number (mm³)
  getSurfaceArea(shape) → number (mm²)
  getTriangleCount(shape) → number
  isEmpty(shape) → boolean
  checkCollisions(shapes[]) → CollisionResult[]

Exportación:
  toSTL(shape) → Buffer
  toGLB(shape) → Buffer
  toSTEP(shape) → Buffer (requiere OCCT)

Parámetros:
  Param.number("name", default, { min, max, step, unit })
  Param.bool("name", default)
  Param.select("name", ["a", "b"], "a")

## CRÍTICO

- SIEMPRE usa variables con nombre para CADA dimensión:
  const baseLength = 100.0; const baseWidth = 60.0; const baseHeight = 20.0;
  const base = box(baseLength, baseWidth, baseHeight);
  NUNCA escribas box(100.0, 60.0, 20.0)

- Unidades: milímetros. Z es ARRIBA.
- El código debe ser JavaScript/TypeScript válido con imports de src/cad/.
`;

const PROMPT_FOOTER = `## REGLAS DE RESPUESTA

1. SIEMPRE responde en español. 2-3 oraciones concisas.
2. Indica qué creaste con dimensiones clave.
3. NUNCA incluyas código JavaScript en tu respuesta.
4. NUNCA uses markdown, bloques de código, ni listas.
5. NUNCA expliques tu flujo de trabajo paso a paso.
`;

export const CAD_AGENT_PROMPT = `${PROMPT_HEADER}\n${GOTCHAS}\n${PROMPT_FOOTER}`;

// ---------------------------------------------------------------------------
// Tier directive builder
// ---------------------------------------------------------------------------

/**
 * Return the per-request directive text for the classified tier.
 * Prepended to the user message so the agent sees routing rules
 * alongside the request.
 */
export function buildTierDirective(tier: Tier): string {
  if (tier === 'SIMPLE') {
    return (
      '[CLASSIFIER NOTE — TIER: SIMPLE]\n' +
      '- Reference policy: NO references needed. Use the API cheatsheet from your system prompt.\n' +
      '- Snapshot: not required.\n'
    );
  }
  if (tier === 'COMPLEX') {
    return (
      '[CLASSIFIER NOTE — TIER: COMPLEX]\n' +
      '- Reference policy: MANDATORY — call readReference("manifold-3d-guide.md") FIRST.\n' +
      '- After a successful inspectCadModel you MUST report back to the user.\n'
    );
  }
  return (
    '[CLASSIFIER NOTE — TIER: MODERATE]\n' +
    '- Reference policy: NO references needed (API cheatsheet in system prompt).\n' +
    '- Snapshot: optional unless visual ambiguity is detected.\n'
  );
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/**
 * Public entry point used by the agent server.
 * Returns the augmented user text (with tier directive) and the resolved tier.
 */
export function assemblePrompt(userText: string): { augmentedText: string; tier: Tier } {
  const tier = classifyTier(userText);
  const directive = buildTierDirective(tier);
  return {
    augmentedText: `${directive}\nUser request: ${userText}`,
    tier,
  };
}
