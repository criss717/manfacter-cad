/**
 * Agent tool implementations.
 *
 * Adapted for ForgeCAD-aligned Shape class API.
 * Each tool is a plain async function that returns a JSON-serializable result.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ToolDefinition,
  AnthropicToolDefinition,
  RunCadCodeResult,
  InspectResult,
  ListOutputsResult,
  ParamDefEntry,
} from './types';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const OUTPUT_DIR = resolve(process.cwd(), 'output');
const REFERENCES_DIR = resolve(process.cwd(), 'references');

// ---------------------------------------------------------------------------
// Session context (module-level mutable state)
// ---------------------------------------------------------------------------

/** Per-session attempt counts for runCadCode. */
export const _attemptCounts: Record<string, number> = {};

/** Last model ID per session (for listing outputs). */
const _lastModel: Record<string, string> = {};

/** Current session ID — set by the dispatch layer before tool calls. */
export let _currentSessionId = '';

/** Current tier — set by the dispatch layer. */
export let _currentTier = 'MODERATE';

/** Max CAD generation attempts per session. */
const MAX_CAD_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Context setters (called by dispatch.ts)
// ---------------------------------------------------------------------------

export function setCurrentSession(sessionId: string): void {
  _currentSessionId = sessionId;
}

export function setCurrentTier(tier: string): void {
  _currentTier = tier;
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI format)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'runCadCode',
      description:
        'Execute JavaScript/TypeScript CAD code using ForgeCAD manifold-3d. ' +
        'Returns model ID, GLB/STL URLs, bounding box, volume, triangle count.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript CAD code using box(), cylinder(), sphere(), union(), difference(), group(), hull3d(), etc.',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspectCadModel',
      description:
        'Inspect a generated CAD model. Returns bounding box, volume, triangle count, collision data.',
      parameters: {
        type: 'object',
        properties: {
          modelId: {
            type: 'string',
            description: 'Model ID from runCadCode result',
          },
        },
        required: ['modelId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listOutputs',
      description: 'List all generated output files from the current session.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readReference',
      description:
        'Read a ForgeCAD CAD reference document. Use for unfamiliar operations or complex assemblies.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Filename (e.g. "SKILL.md", "forgecad/core.md")',
          },
        },
        required: ['name'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Anthropic-format tool definitions
// ---------------------------------------------------------------------------

export const ANTHROPIC_TOOLS: AnthropicToolDefinition[] = TOOL_DEFINITIONS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

// ---------------------------------------------------------------------------
// Tool map (name → implementation)
// ---------------------------------------------------------------------------

export const TOOL_MAP: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  runCadCode: async (args) => await _runCadCode(String(args.code ?? '')),
  inspectCadModel: async (args) => await _inspectCadModel(String(args.modelId ?? '')),
  listOutputs: async () => await _listOutputs(),
  readReference: async (args) => await _readReference(String(args.name ?? '')),
};

// ---------------------------------------------------------------------------
// Session cleanup
// ---------------------------------------------------------------------------

/**
 * Free per-session resources on disconnect.
 */
export function releaseSessionResources(sessionId: string): void {
  if (!sessionId) return;
  delete _attemptCounts[sessionId];
  delete _lastModel[sessionId];
}

// ---------------------------------------------------------------------------
// Tool: runCadCode
// ---------------------------------------------------------------------------

async function _runCadCode(code: string): Promise<string> {
  const sessionId = _currentSessionId;
  const tier = _currentTier;

  // Check attempt limit
  if (sessionId) {
    const count = (_attemptCounts[sessionId] ?? 0) + 1;
    _attemptCounts[sessionId] = count;
    if (count > MAX_CAD_ATTEMPTS) {
      return JSON.stringify({
        ok: false,
        error: 'MAX_ATTEMPTS_EXCEEDED',
        hint: 'Has excedido los 10 intentos máximos. Informa al usuario que simplifique la descripción o divida la pieza en partes más simples.',
        modelId: 'limit_exceeded',
        tier,
      } satisfies RunCadCodeResult);
    }
  }

  const modelId = randomUUID().replace(/-/g, '').slice(0, 12);
  const modelDir = join(OUTPUT_DIR, modelId);

  try {
    await mkdir(modelDir, { recursive: true });

    // Save the script
    const scriptPath = join(modelDir, '_script.js');
    await writeFile(scriptPath, code, 'utf8');

    // Track for session
    if (sessionId) {
      _lastModel[sessionId] = modelId;
    }

    // Dynamically import cad modules and execute the code in a sandboxed context.
    const cad = await import('../cad/index');
    await cad.initEngine();

    // Build a sandbox context with complete ForgeCAD API surface
    const sandbox: Record<string, unknown> = {
      // Primitives
      box: cad.box,
      cylinder: cad.cylinder,
      sphere: cad.sphere,
      torus: cad.torus,
      // Booleans
      union: cad.union,
      difference: cad.difference,
      intersection: cad.intersection,
      // Grouping
      group: cad.group,
      // Hull
      hull3d: cad.hull3d,
      roundedBox: cad.roundedBox,
      // Features
      fillet: cad.fillet,
      chamfer: cad.chamfer,
      shell: cad.shell,
      hole: cad.hole,
      boss: cad.boss,
      pocket: cad.pocket,
      draft: cad.draft,
      offsetSolid: cad.offsetSolid,
      split: cad.split,
      splitByPlane: cad.splitByPlane,
      trimByPlane: cad.trimByPlane,
      shellShape: cad.shellShape,
      // Transforms
      translate: cad.translate,
      rotate: cad.rotate,
      scale: cad.scale,
      mirror: cad.mirror,
      rotateX: cad.rotateX,
      rotateY: cad.rotateY,
      rotateZ: cad.rotateZ,
      moveTo: cad.moveTo,
      rotateAround: cad.rotateAround,
      pointAlong: cad.pointAlong,
      moveToLocal: cad.moveToLocal,
      // Patterns
      linearPattern: cad.linearPattern,
      circularPattern: cad.circularPattern,
      mirrorCopy: cad.mirrorCopy,
      circularLayout: cad.circularLayout,
      polygonVertices: cad.polygonVertices,
      // Inspection
      getBoundingBox: cad.getBoundingBox,
      getVolume: cad.getVolume,
      getSurfaceArea: cad.getSurfaceArea,
      getTriangleCount: cad.getTriangleCount,
      isEmpty: cad.isEmpty,
      checkCollisions: cad.checkCollisions,
      face: cad.face,
      edge: cad.edge,
      faceNames: cad.faceNames,
      edgeNames: cad.edgeNames,
      // Topology
      edgesOf: cad.edgesOf,
      edgesBetween: cad.edgesBetween,
      selectEdges: cad.selectEdges,
      selectEdge: cad.selectEdge,
      coalesceEdges: cad.coalesceEdges,
      faceHistory: cad.faceHistory,
      // References & Labels
      withReferences: cad.withReferences,
      placeReference: cad.placeReference,
      attachTo: cad.attachTo,
      onFace: cad.onFace,
      referencePoint: cad.referencePoint,
      prefixLabels: cad.prefixLabels,
      renameLabel: cad.renameLabel,
      dropLabels: cad.dropLabels,
      dropAllLabels: cad.dropAllLabels,
      // Mesh
      refine: cad.refine,
      refineToLength: cad.refineToLength,
      refineToTolerance: cad.refineToTolerance,
      smoothOut: cad.smoothOut,
      warp: cad.warp,
      simplify: cad.simplify,
      slice: cad.slice,
      project: cad.project,
      minGap: cad.minGap,
      // Plane intersection
      intersectWithPlane: cad.intersectWithPlane,
      projectToPlane: cad.projectToPlane,
      // Export
      toSTL: cad.toSTL,
      toGLB: cad.toGLB,
      toSTEP: cad.toSTEP,
      // Params
      Param: cad.Param,
      collectParams: cad.collectParams,
      applyParams: cad.applyParams,
      // Sketch 2D
      rect: cad.rect,
      circle2d: cad.circle2d,
      roundedRect: cad.roundedRect,
      polygon: cad.polygon,
      ngon: cad.ngon,
      ellipse: cad.ellipse,
      slot: cad.slot,
      star: cad.star,
      path: cad.path,
      stroke: cad.stroke,
      union2d: cad.union2d,
      difference2d: cad.difference2d,
      intersection2d: cad.intersection2d,
      hull2d: cad.hull2d,
      constrainedSketch: cad.constrainedSketch,
      sketchFromSvg: cad.sketchFromSvg,
      filletCorners: cad.filletCorners,
      dxfSketch: cad.dxfSketch,
      svgSketch: cad.svgSketch,
      Sketch: cad.Sketch,
      ConstraintSketch: cad.ConstraintSketch,
      Point2D: cad.Point2D,
      Line2D: cad.Line2D,
      Circle2D: cad.Circle2D,
      Rectangle2D: cad.Rectangle2D,
      point: cad.point,
      line: cad.line,
      circle: cad.circle,
      rectangle: cad.rectangle,
      Constraint: cad.Constraint,
      degrees: cad.degrees,
      radians: cad.radians,
      // Curves
      spline2d: cad.spline2d,
      spline3d: cad.spline3d,
      loft: cad.loft,
      sweep: cad.sweep,
      Curve3D: cad.Curve3D,
      Curve: cad.Curve,
      Route3D: cad.Route3D,
      Blend: cad.Blend,
      // Assembly
      assembly: cad.assembly,
      joint: cad.joint,
      Assembly: cad.Assembly,
      SolvedAssembly: cad.SolvedAssembly,
      Transform: cad.Transform,
      composeChain: cad.composeChain,
      bomToCsv: cad.bomToCsv,
      // Viewport
      cutPlane: cad.cutPlane,
      explodeView: cad.explodeView,
      jointsView: cad.jointsView,
      viewConfig: cad.viewConfig,
      // Output
      bom: cad.bom,
      dim: cad.dim,
      dimLine: cad.dimLine,
      robotExport: cad.robotExport,
      // Verification
      verify: cad.verify,
      spec: cad.spec,
      // Imports
      importSketch: cad.importSketch,
      importPart: cad.importPart,
      importSvgSketch: cad.importSvgSketch,
      partLibrary: cad.partLibrary,
      lib: cad.lib,
      // Gears
      gear: cad.gear,
      internalGear: cad.internalGear,
      // SDF
      levelSet: cad.levelSet,
      // Shape classes
      Shape: cad.Shape,
      TrackedShape: cad.TrackedShape,
      ShapeGroup: cad.ShapeGroup,
      // Result holder
      __CAD_RESULT: null as unknown,
    };

    // Execute code — wrap in async function to support await.
    // Support both patterns: `const result = ...;` (explicit) and `return expr;` (ForgeCAD style)
    // Block scope wrapping prevents `const` redeclaration errors when sandbox
    // parameter names (box, hole, etc.) collide with user-declared `const` names.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const wrappedCode = `{\n${code}\nif (typeof result !== "undefined") { __CAD_RESULT = result; }\n}`;
    const fn = new AsyncFunction(
      ...Object.keys(sandbox),
      `${wrappedCode}
return __CAD_RESULT;`
    );

    // Capture return value — covers both `const result` (via __CAD_RESULT) and `return expr`
    const userReturn = await fn(...Object.values(sandbox));

    // Prefer explicit `result`, fall back to return value
    const shape = (sandbox.__CAD_RESULT ?? userReturn) as Record<string, unknown> | null;

    // Accept Shape, TrackedShape, or ShapeGroup as valid results
    // Use duck-typing since dynamic import creates different class identities
    if (!shape || typeof shape !== 'object') {
      throw new Error(
        'El código no definió una variable `result` con un Shape válido. ' +
        'Terminá con: const result = tuPieza; o return tuPieza;'
      );
    }

    // Check if it's a Shape/TrackedShape (has manifold) or ShapeGroup (has shapes)
    const isShapeLike = 'manifold' in shape && 'id' in shape;
    const isGroupLike = 'shapes' in shape && Array.isArray((shape as { shapes: unknown[] }).shapes);

    if (!isShapeLike && !isGroupLike) {
      throw new Error(
        'El código no definió una variable `result` con un Shape válido. ' +
        'Asegúrate de que tu código termine con: const result = tuPieza;'
      );
    }

    // For ShapeGroup, use the first shape for export; for Shape, use directly
    const exportShape = isGroupLike
      ? ((shape as { shapes: import('../cad/shape').Shape[] }).shapes[0] ?? shape as unknown as import('../cad/shape').Shape)
      : shape as unknown as import('../cad/shape').Shape;

    // Export GLB and STL
    const glbBuffer = cad.toGLB(exportShape);
    const stlBuffer = cad.toSTL(exportShape);

    const glbPath = join(modelDir, `${modelId}.glb`);
    const stlPath = join(modelDir, `${modelId}.stl`);
    await writeFile(glbPath, glbBuffer);
    await writeFile(stlPath, stlBuffer);

    // Try STEP export (may fail if OCCT not available — stub)
    let stepUrl: string | undefined;
    try {
      const stepBuffer = await cad.toSTEP(exportShape);
      const stepPath = join(modelDir, `${modelId}.step`);
      await writeFile(stepPath, stepBuffer);
      stepUrl = `/api/cad/output/${modelId}/${modelId}.step`;
    } catch {
      // STEP not available — skip, don't crash
    }

    // Collect params from code
    const paramDefs = cad.collectParams(code);

    // Get facts
    const bbox = exportShape.boundingBox();
    const volume = exportShape.volume();
    const numTri = exportShape.numTri();

    // Save facts as JSON
    const factsPath = join(modelDir, 'facts.json');
    await writeFile(factsPath, JSON.stringify({ bbox, volume, numTri, paramDefs }, null, 2));

    const result: RunCadCodeResult = {
      ok: true,
      modelId,
      glbUrl: `/api/cad/output/${modelId}/${modelId}.glb`,
      stlUrl: `/api/cad/output/${modelId}/${modelId}.stl`,
      ...(stepUrl ? { stepUrl } : {}),
      facts: { bbox, volume, triangles: numTri },
      paramDefs: (paramDefs ?? []).map((p) => {
        const raw = p as unknown as Record<string, unknown>;
        const def = (raw.__paramDef as Record<string, unknown> | undefined) ?? raw;
        return {
          name: def.name as string,
          type: ((def.type as string) === 'select' ? 'choice' : def.type) as 'number' | 'bool' | 'choice',
          defaultValue: def.defaultValue as number | boolean | string,
          options: def.options as { min?: number; max?: number; step?: number; values?: string[] } | undefined,
          unit: def.unit as string | undefined,
        };
      }) as ParamDefEntry[],
      code,
      tier,
    };

    return JSON.stringify(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[TOOL] runCadCode FAIL: ${error}`);
    return JSON.stringify({
      ok: false,
      modelId,
      error,
      hint: _classifyError(error),
      tier,
    } satisfies RunCadCodeResult);
  }
}

// ---------------------------------------------------------------------------
// Tool: inspectCadModel
// ---------------------------------------------------------------------------

async function _inspectCadModel(modelId: string): Promise<string> {
  const modelDir = join(OUTPUT_DIR, modelId);

  try {
    // Try to read cached facts
    const factsPath = join(modelDir, 'facts.json');
    const factsRaw = await readFile(factsPath, 'utf8').catch(() => null);

    if (factsRaw) {
      const facts = JSON.parse(factsRaw);
      return JSON.stringify({ ok: true, facts } satisfies InspectResult);
    }

    // Fallback: try to load the shape and inspect it
    const files = await readdir(modelDir).catch(() => []);
    if (files.length === 0) {
      return JSON.stringify({ ok: false, error: `Model ${modelId} not found` } satisfies InspectResult);
    }

    return JSON.stringify({
      ok: true,
      facts: { files, note: 'No cached facts — re-run runCadCode to generate inspection data.' },
    } satisfies InspectResult);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies InspectResult);
  }
}

// ---------------------------------------------------------------------------
// Tool: listOutputs
// ---------------------------------------------------------------------------

async function _listOutputs(): Promise<string> {
  const sessionId = _currentSessionId;
  const currentModel = _lastModel[sessionId] ?? '';

  if (!currentModel) {
    return JSON.stringify({ ok: true, files: [], session: 'none' } satisfies ListOutputsResult);
  }

  const modelDir = join(OUTPUT_DIR, currentModel);
  const files: Array<{ name: string; size: number; suffix: string }> = [];

  try {
    const entries = await readdir(modelDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = join(modelDir, entry.name);
        const fileStat = await stat(filePath);
        const suffix = entry.name.includes('.')
          ? '.' + entry.name.split('.').pop()
          : '';
        files.push({
          name: `${currentModel}/${entry.name}`,
          size: fileStat.size,
          suffix,
        });
      }
    }
  } catch {
    // Directory doesn't exist yet — that's fine
  }

  return JSON.stringify({
    ok: true,
    files: files.slice(0, 50),
    session: currentModel,
  } satisfies ListOutputsResult);
}

// ---------------------------------------------------------------------------
// Tool: readReference — validates against filesystem
// ---------------------------------------------------------------------------

/** Cached list of available reference files (refreshed per call). */
let _cachedReferences: string[] | null = null;

async function getAvailableReferences(): Promise<string[]> {
  if (_cachedReferences) return _cachedReferences;

  try {
    const entries = await readdir(REFERENCES_DIR, { recursive: true });
    _cachedReferences = entries
      .filter((e) => typeof e === 'string' && e.endsWith('.md'))
      .map((e) => e.replace(/\\/g, '/'));
  } catch {
    _cachedReferences = [];
  }
  return _cachedReferences;
}

/** Invalidate the reference cache (call after file changes). */
export function invalidateReferenceCache(): void {
  _cachedReferences = null;
}

async function _readReference(name: string): Promise<string> {
  const cleanName = name.replace(/\\/g, '/').replace(/^\//, '');

  // For script files, look in output dir
  if (cleanName.includes('_script.js') || cleanName.includes('_script.py')) {
    const parts = cleanName.split('/');
    const modelDir = parts.length > 1 ? parts[0] : '';
    if (modelDir && _lastModel[_currentSessionId] !== modelDir) {
      return `No puedes leer scripts de otras sesiones. Solo puedes leer el script actual: ${_lastModel[_currentSessionId]}/_script.js`;
    }
    const path = join(OUTPUT_DIR, cleanName);
    try {
      const content = await readFile(path, 'utf8');
      return content.length > 15000
        ? content.slice(0, 15000) + '\n\n... (truncated)'
        : content;
    } catch {
      return `Script not found: ${cleanName}`;
    }
  }

  // Reference docs — validate against filesystem
  const available = await getAvailableReferences();

  // Try exact match
  const path = join(REFERENCES_DIR, cleanName);
  try {
    const content = await readFile(path, 'utf8');
    return content.length > 15000
      ? content.slice(0, 15000) + '\n\n... (truncated)'
      : content;
  } catch {
    // Reference not found — list available docs
    return `Reference '${name}' not found. Available: ${available.join(', ')}`;
  }
}

// ---------------------------------------------------------------------------
// Error classifier (simplified from Python)
// ---------------------------------------------------------------------------

function _classifyError(error: string): string {
  const e = error.toLowerCase();

  if (e.includes('not a function') || e.includes('is not a function')) {
    return 'ERROR: Llamaste algo como función que no lo es. Revisa la API de ForgeCAD.';
  }
  if (e.includes('cannot read propert')) {
    return 'ERROR: Accediste a una propiedad de undefined. Verifica que las primitivas devuelvan Shapes válidos.';
  }
  if (e.includes('syntaxerror') || e.includes('unexpected token')) {
    return 'ERROR de sintaxis JavaScript. Revisa imports, llaves, paréntesis.';
  }
  if (e.includes('shape') && e.includes('invalid')) {
    return 'ERROR: Shape inválido. Asegúrate de que box(), cylinder(), etc. devuelvan un Shape antes de operaciones booleanas.';
  }
  if (e.includes('fillet') && (e.includes('before union') || e.includes('no named edges'))) {
    return 'ERROR: fillet() solo funciona en box()/cylinder() ANTES de union/difference. Aplica fillet a las primitivas individuales y luego haz la operación booleana. Ej: const c = fillet(box(50,20,4), 4);';
  }
  if (e.includes('chamfer') && e.includes('trackedshape')) {
    return 'ERROR: chamfer() solo funciona en box()/cylinder() ANTES de operaciones booleanas. Aplica chamfer a las primitivas individuales.';
  }
  if (e.includes('fillet') && e.includes('radius') && e.includes('too large')) {
    return 'ERROR: El radio del redondeo es demasiado grande para la arista. Reduce el radio o usa max_fillet() primero para verificar el máximo permitido.';
  }
  return `ERROR: ${error}. Consulta las referencias para la API correcta y corrige.`;
}