/**
 * Core manifold-3d WASM initialization and Shape wrapper.
 *
 * The WASM module is loaded lazily on first use and cached as a singleton.
 * Shape wraps a Manifold solid with color/material metadata — all operations
 * are immutable and return new Shape instances.
 */

import type { BBox, Shape, ShapeMaterialProps, ParamDef } from './types';

// ---------------------------------------------------------------------------
// WASM singleton
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _module: any = null;
let _initPromise: Promise<void> | null = null;

/**
 * Initialize the manifold-3d WASM module. Safe to call multiple times —
 * subsequent calls are no-ops. Must be called (and awaited) before any
 * shape construction.
 */
export async function initEngine(): Promise<void> {
  if (_module) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import — avoids loading WASM at bundle parse time.
    const mod = await import('manifold-3d');
    // The default export is a factory function that returns the initialized module.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = (mod as any).default ?? mod;
    _module = typeof factory === 'function' ? await factory() : factory;
    if (typeof _module.setup === 'function') {
      _module.setup();
    }
  })();

  return _initPromise;
}

/**
 * Return the cached Manifold module. Throws if `initEngine()` has not been
 * called yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getManifold(): any {
  if (!_module) {
    throw new Error(
      'manifold-3d not initialized — call initEngine() first'
    );
  }
  return _module;
}

// ---------------------------------------------------------------------------
// Shape ID counter
// ---------------------------------------------------------------------------

let _nextId = 1;
function newId(): string {
  return `shape-${_nextId++}`;
}

// ---------------------------------------------------------------------------
// Shape construction helpers
// ---------------------------------------------------------------------------

/**
 * Build a Shape from an existing Manifold instance.
 * Used internally by primitives and boolean ops.
 */
export function buildShapeFromManifold(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifoldShape: any,
  color: string = '#cccccc',
  material: ShapeMaterialProps = {},
  params: ParamDef[] = []
): Shape {
  const box = manifoldShape.boundingBox() as { min: number[]; max: number[] };
  const min: [number, number, number] = [box.min[0], box.min[1], box.min[2]];
  const max: [number, number, number] = [box.max[0], box.max[1], box.max[2]];
  const dimensions: BBox = {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };

  return Object.freeze({
    id: newId(),
    manifold: manifoldShape,
    color,
    material,
    params,
    dimensions,
  }) as Shape;
}

/**
 * Internal helper: extract the raw Manifold object from a Shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getManifoldFromShape(shape: Shape): any {
  return shape.manifold;
}

// ---------------------------------------------------------------------------
// Shape utility methods
// ---------------------------------------------------------------------------

/**
 * Clone a Shape with an optional new color/material override.
 */
export function cloneShape(
  shape: Shape,
  overrides?: Partial<Pick<Shape, 'color' | 'material'>>
): Shape {
  return Object.freeze({
    ...shape,
    id: newId(),
    ...(overrides ?? {}),
  }) as Shape;
}
