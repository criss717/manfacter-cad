/**
 * REST POST fallback for CAD generation.
 *
 * Route: POST /api/generate
 * Body: { code: string, modelId?: string }
 * Returns: { success, modelId, bbox, volume, glbUrl, stlUrl, params }
 *
 * This is a non-WebSocket alternative for clients that cannot use WS.
 * It runs the same runCadCode tool logic but returns the result as JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initEngine } from '@/cad/engine.js';
import {
  box,
  cylinder,
  sphere,
  torus,
} from '@/cad/primitives.js';
import {
  union,
  subtract,
  intersect,
} from '@/cad/booleans.js';
import {
  translate,
  rotate,
  scale,
  mirror,
} from '@/cad/transforms.js';
import {
  getBoundingBox,
  getVolume,
  getSurfaceArea,
  getTriangleCount,
  isEmpty,
  checkCollisions,
} from '@/cad/inspect.js';
import { toSTL, toGLB, toSTEP } from '@/cad/export.js';
import { Param, collectParams, applyParams } from '@/cad/params.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const OUTPUT_DIR = resolve(process.cwd(), 'output');

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { code?: string; modelId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const code = body.code;
  if (!code || typeof code !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid "code" field' },
      { status: 400 },
    );
  }

  const modelId = body.modelId ?? randomUUID().replace(/-/g, '').slice(0, 12);
  const modelDir = join(OUTPUT_DIR, modelId);

  try {
    await mkdir(modelDir, { recursive: true });

    // Save the script
    const scriptPath = join(modelDir, '_script.js');
    await writeFile(scriptPath, code, 'utf8');

    // Initialize engine and build sandbox
    await initEngine();

    const sandbox = {
      box,
      cylinder,
      sphere,
      torus,
      union,
      subtract,
      intersect,
      translate,
      rotate,
      scale,
      mirror,
      getBoundingBox,
      getVolume,
      getSurfaceArea,
      getTriangleCount,
      isEmpty,
      checkCollisions,
      toSTL,
      toGLB,
      toSTEP,
      Param,
      collectParams,
      applyParams,
      __CAD_RESULT: null as unknown,
    };

    // Execute code in sandboxed async context
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      ...Object.keys(sandbox),
      `${code}\nif (typeof result !== 'undefined') { __CAD_RESULT = result; }`,
    );
    await fn(...Object.values(sandbox));

    const shape = sandbox.__CAD_RESULT as import('@/cad/types.js').Shape | null;
    if (!shape || typeof shape !== 'object' || !('manifold' in shape)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'El código no definió una variable `result` con un Shape válido. ' +
            'Asegúrate de que tu código termine con: const result = tuPieza;',
        },
        { status: 422 },
      );
    }

    // Export files
    const glbBuffer = toGLB(shape);
    const stlBuffer = toSTL(shape);

    const glbPath = join(modelDir, `${modelId}.glb`);
    const stlPath = join(modelDir, `${modelId}.stl`);
    await writeFile(glbPath, glbBuffer);
    await writeFile(stlPath, stlBuffer);

    // Collect params and facts
    const params = collectParams(code);
    const bbox = getBoundingBox(shape);
    const volume = getVolume(shape);
    const numTri = getTriangleCount(shape);

    // Save facts
    const factsPath = join(modelDir, 'facts.json');
    await writeFile(factsPath, JSON.stringify({ bbox, volume, numTri, params }, null, 2));

    return NextResponse.json({
      success: true,
      modelId,
      bbox,
      volume,
      glbUrl: `/api/cad/output/${modelId}/${modelId}.glb`,
      stlUrl: `/api/cad/output/${modelId}/${modelId}.stl`,
      params,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[GENERATE] Error: ${error}`);
    return NextResponse.json(
      { success: false, error },
      { status: 500 },
    );
  }
}
