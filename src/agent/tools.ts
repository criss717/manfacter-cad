/**
 * Agent tool implementations.
 *
 * Ported from backend/agent/tools.py — adapted for manifold-3d JS engine.
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
        'Execute JavaScript/TypeScript CAD code using manifold-3d. ' +
        'Returns model ID, GLB/STL URLs, bounding box, volume, triangle count.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript CAD code using box(), cylinder(), sphere(), union(), subtract(), etc.',
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
        'Read a CAD reference document. Only use for unfamiliar errors or complex assemblies.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Filename (e.g. "manifold-3d-guide.md", "repair-loop.md")',
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
        hint: 'Has excedido los 10 intentos máximos permitidos. Informa al usuario.',
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
    // The code is expected to call functions from src/cad/ and assign to `module.exports`
    // or use `globalThis.__CAD_RESULT`.
    const cad = await import('../cad/index');
    await cad.initEngine();

    // Build a sandbox context with all CAD functions
    const sandbox = {
      // Primitives
      box: cad.box,
      cylinder: cad.cylinder,
      sphere: cad.sphere,
      torus: cad.torus,
      // Booleans
      union: cad.union,
      subtract: cad.subtract,
      intersect: cad.intersect,
      // Transforms
      translate: cad.translate,
      rotate: cad.rotate,
      scale: cad.scale,
      mirror: cad.mirror,
      // Inspection
      getBoundingBox: cad.getBoundingBox,
      getVolume: cad.getVolume,
      getSurfaceArea: cad.getSurfaceArea,
      getTriangleCount: cad.getTriangleCount,
      isEmpty: cad.isEmpty,
      checkCollisions: cad.checkCollisions,
      // Export
      toSTL: cad.toSTL,
      toGLB: cad.toGLB,
      toSTEP: cad.toSTEP,
      // Params
      Param: cad.Param,
      collectParams: cad.collectParams,
      applyParams: cad.applyParams,
      // Result holder
      __CAD_RESULT: null as unknown,
    };

    // Execute code — wrap in async function to support await
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      ...Object.keys(sandbox),
      `${code}\nif (typeof result !== 'undefined') { __CAD_RESULT = result; }`
    );
    await fn(...Object.values(sandbox));

    const shape = sandbox.__CAD_RESULT as import('../cad/types').Shape | null;
    if (!shape || typeof shape !== 'object' || !('manifold' in shape)) {
      throw new Error(
        'El código no definió una variable `result` con un Shape válido. ' +
        'Asegúrate de que tu código termine con: const result = tuPieza;'
      );
    }

    // Export GLB and STL
    const glbBuffer = cad.toGLB(shape);
    const stlBuffer = cad.toSTL(shape);

    const glbPath = join(modelDir, `${modelId}.glb`);
    const stlPath = join(modelDir, `${modelId}.stl`);
    await writeFile(glbPath, glbBuffer);
    await writeFile(stlPath, stlBuffer);

    // Collect params from code
    const params = cad.collectParams(code);

    // Get facts
    const bbox = cad.getBoundingBox(shape);
    const volume = cad.getVolume(shape);
    const numTri = cad.getTriangleCount(shape);

    // Save facts as JSON
    const factsPath = join(modelDir, 'facts.json');
    await writeFile(factsPath, JSON.stringify({ bbox, volume, numTri, params }, null, 2));

    const result: RunCadCodeResult = {
      ok: true,
      modelId,
      glbUrl: `/api/cad/output/${modelId}/${modelId}.glb`,
      stlUrl: `/api/cad/output/${modelId}/${modelId}.stl`,
      facts: { bbox, volume, triangles: numTri },
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
// Tool: readReference
// ---------------------------------------------------------------------------

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

  // Reference docs
  const path = join(REFERENCES_DIR, cleanName);
  try {
    const content = await readFile(path, 'utf8');
    return content.length > 15000
      ? content.slice(0, 15000) + '\n\n... (truncated)'
      : content;
  } catch {
    // List available references
    let available: string[] = [];
    try {
      const entries = await readdir(REFERENCES_DIR);
      available = entries.filter((e) => e.endsWith('.md'));
    } catch {
      // references/ dir doesn't exist
    }
    return `Reference '${name}' not found. Available: ${available.join(', ')}`;
  }
}

// ---------------------------------------------------------------------------
// Error classifier (simplified from Python)
// ---------------------------------------------------------------------------

function _classifyError(error: string): string {
  const e = error.toLowerCase();

  if (e.includes('not a function') || e.includes('is not a function')) {
    return 'ERROR: Llamaste algo como función que no lo es. Revisa la API de manifold-3d.';
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
  return `ERROR: ${error}. Consulta las referencias para la API correcta y corrige.`;
}
