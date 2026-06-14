/**
 * CAD agent system prompt and tier classification.
 *
 * ForgeCAD-aligned: uses Shape class methods, variadic booleans,
 * correct primitive signatures, and ForgeCAD reference docs.
 * The prompt is in Spanish because the target users are Spanish-speaking
 * mechanical engineers.
 */

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Tier } from './types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const GOTCHAS_VERSION = '3';

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
// Reference file list — built dynamically from filesystem
// ---------------------------------------------------------------------------

let _referenceFiles: string[] | null = null;

async function getReferenceFiles(): Promise<string[]> {
  if (_referenceFiles) return _referenceFiles;

  const refDir = resolve(process.cwd(), 'references');
  try {
    const entries = await readdir(refDir, { recursive: true });
    _referenceFiles = entries
      .filter((e) => typeof e === 'string' && e.endsWith('.md'))
      .map((e) => String(e).replace(/\\/g, '/'));
  } catch {
    _referenceFiles = [];
  }
  return _referenceFiles;
}

/** Invalidate cached reference file list (called when files change). */
export function invalidateReferenceCache(): void {
  _referenceFiles = null;
}

// ---------------------------------------------------------------------------
// GOTCHAS block
// ---------------------------------------------------------------------------

export const GOTCHAS = `## GOTCHAS (v${GOTCHAS_VERSION}) — ForgeCAD API patterns

### Boolean operations (CRITICAL)
- \`union(s1, s2, s3)\`, \`difference(base, cutter1, cutter2)\`, \`intersection(s1, s2)\`
- Variadic — pass shapes as separate arguments, NOT as an array.
- All are INMUTABLE — return a new Shape, never mutate the original.
- Cutters MUST extend beyond the target: use \`box(w+2, h+2, d+2)\` centered.

### Primitives
- \`box(x, y, z)\` — centered on XY, base at Z=0. NOT centered at origin.
- \`cylinder(height, radius)\` — centered on XY, base at Z=0. Optional: \`radiusTop\`, \`segments\`.
- \`sphere(radius)\` — centered at origin.
- \`torus(majorRadius, minorRadius)\` — ring in XY plane, centered at origin.

### Chained transforms (Shape class methods)
- \`shape.translate(x, y, z)\` — returns NEW Shape
- \`shape.rotate([nx, ny, nz], angleDeg)\` or \`shape.rotateX(45)\` / \`rotateY\` / \`rotateZ\`
- \`shape.scale(factor)\` or \`shape.scale([x, y, z])\` — returns NEW Shape
- \`shape.mirror([nx, ny, nz])\` — mirror over plane defined by normal vector

### Inspection ALWAYS after generating
- After \`runCadCode\`, ALWAYS call \`inspectCadModel\` to verify bbox and volume.
- If bbox doesn't match expected dimensions → fix and regenerate.

### MANUFACTURING (FDM / 3D printing)
- Minimum wall: ≥ 1.0 mm thickness.
- Clearance: mating faces require +0.2 mm tolerance.
- Thickness < 0.8 mm doesn't print reliably.
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

- runCadCode(code): Ejecuta código CAD JavaScript con ForgeCAD manifold-3d. Devuelve URLs GLB/STL + datos geométricos.
- inspectCadModel(modelId): Inspecciona un modelo generado: bbox, volumen, colisiones.
- readReference(name): Lee un documento de referencia ForgeCAD.
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

### PIEZAS COMPLEJAS → OBLIGATORIO: llama readReference("forgecad/core.md") PRIMERO.
DEBES llamar esta referencia ANTES de generar CUALQUIER código para:
- Cualquier engranaje con dientes
- Geometría helicoidal, espiral, rosca, resorte
- Turbina, impulsor, hélice
- Barrido (sweep) a lo largo de curva
- Loft: conectar dos perfiles diferentes
- Revolución: piezas torneadas, poleas, volantes
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

## FORGECAD API — Operaciones completas

Primitivas:
  box(x, y, z)                              → centrado en XY, base en Z=0
  cylinder(height, radius, radiusTop?, segments?) → centrado en XY, base en Z=0
  sphere(radius, segments?)              → centrado en origen
  torus(majorRadius, minorRadius, segments?) → anillo en plano XY

Métodos de Shape (chainable, inmutables):
  shape.translate(x, y, z)               → mueve
  shape.rotate([nx, ny, nz], angleDeg)    → rota alrededor de eje
  shape.rotateX(angleDeg)                  → rota alrededor de X
  shape.rotateY(angleDeg)                  → rota alrededor de Y
  shape.rotateZ(angleDeg)                  → rota alrededor de Z
  shape.scale(factor) or shape.scale([x,y,z]) → escala
  shape.mirror([nx, ny, nz])              → espejo sobre plano (NO string como 'x')
  shape.boundingBox() → { min, max, size }
  shape.volume() → number (mm³)
  shape.surfaceArea() → number (mm²)
  shape.numTri() → number
  shape.isEmpty() → boolean

Booleanos (variadic, inmutables):
  union(s1, s2, s3)                          → combina
  difference(base, cutter1, cutter2)         → resta
  intersection(s1, s2)                       → intersección

Caras nombradas (TrackedShape desde box/cylinder):
  box(10, 20, 5).face('top')    → { center: [0,0,5], normal: [0,0,1] }
  cylinder(10, 3).face('side')  → { center: [0,0,5], normal: [1,0,0] }
  Caras de box: top, bottom, front, back, left, right
  Caras de cylinder: top, bottom, side

Operaciones adicionales:
  group(s1, s2, ...) → ShapeGroup         — agrupa formas
  hull3d(s1, s2, ...) → Shape             — envolvente convexa
  roundedBox(x, y, z, radius) → Shape    — caja con TODOS los bordes redondeados (USA ESTE en vez de fillet)
  fillet(shape, radius, edgeName?)    — redondea aristas individuales (box/cylinder)
  chamfer(shape, distance, edgeName?) — bisela aristas (box/cylinder)
  linearPattern(shape, count, spacing) → Shape — patrón lineal
  circularPattern(shape, count, angle) → Shape — patrón circular
  gear(module, teeth, faceWidth) → Shape  — engranaje recto con perfil involuta
  internalGear(module, teeth, faceWidth) → Shape — corona dentada interna
  helicalGear(module, teeth, faceWidth, helixAngle?) → Shape — engranaje helicoidal (stub: devuelve recto)

Exportación (AUTOMÁTICA — no llames en tu código):
  El sistema genera GLB y STL automáticamente después de runCadCode.
  NO necesitas llamar toSTL/toGLB/toSTEP en tu código.

Parámetros:
  Param.number("name", default, { min, max, step, unit })
  Param.bool("name", default)
  Param.choice("name", ["a", "b"], "a")

## ESTRUCTURA DEL CÓDIGO — OBLIGATORIO

Tu código DEBE terminar con 'const result = tuPieza;' o 'return tuPieza;' donde tuPieza es un Shape, TrackedShape o ShapeGroup válido. NO llames toSTL/toGLB/toSTEP (el sistema exporta automáticamente).

Ejemplo completo de código válido:
--- ejemplo ---
const diametro = Param.number("Diámetro", 200, { min: 50, max: 500, unit: "mm" });
const espesor = Param.number("Espesor", 10, { min: 2, max: 50, unit: "mm" });
const brida = cylinder(espesor, diametro / 2);
const agujero = cylinder(espesor + 2, 6.0);
const resultado = difference(brida, agujero);
const result = resultado;
--- fin ejemplo ---

Si tu código NO termina con const result = ... o return ... → FAIL automático.

## CRÍTICO

- USA Param.number() para TODAS las dimensiones que el usuario pueda querer ajustar:
  const largo = Param.number("Largo", 100, { min: 10, max: 500, unit: "mm" });
  const base = box(largo, ancho, alto);
  NUNCA escribas números mágicos como box(100.0, 60.0, 20.0)

- Unidades: milímetros. Z es ARRIBA.
- fillet() SOLO funciona en box() y cylinder() individuales (ANTES de union/difference).
  PATRÓN CORRECTO para soporte en L con redondeos:
    const base = fillet(box(100, 80, 8), 3);  // redondea aristas de la caja base
    const vert = fillet(box(8, 80, 80), 3);    // redondea aristas de la pata vertical
    const soporte = union(base, vert.translate(46, 0, 44));  // unir después
  NUNCA hagas fillet() DESPUÉS de union/difference — pierde efecto.
  NUNCA construyas redondeos manuales con cilindros y esferas — usa fillet().
- chamfer(biselado) funciona igual que fillet en aristas con nombre:
    const bevel = chamfer(box(10, 10, 10), 2, 'top_front')
- El código debe ser JavaScript/TypeScript válido usando la API de ForgeCAD.
- box(x, y, z) — centrado en XY con base en Z=0. NO llames box(width, depth, height).
- cylinder(height, radius) — height PRIMERO, radius SEGUNDO.
- mirror(shape, [nx, ny, nz]) — acepta vector normal, NO string como 'x' o 'y'.
- Booleanos son variadic: difference(base, cutter1, cutter2), NO difference(base, [cutter1]).
- NO uses toSTL(), toGLB(), toSTEP() en tu código — el sistema lo hace automático.
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
      '- Reference policy: MANDATORY — call readReference("forgecad/core.md") FIRST.\n' +
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