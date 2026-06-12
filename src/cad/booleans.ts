/**
 * Boolean CSG operations: union, subtract, intersect.
 *
 * All operations are immutable — they return new Shapes without modifying
 * the originals.
 */

import type { Shape } from './types';
import {
  getManifold,
  buildShapeFromManifold,
  getManifoldFromShape,
} from './engine';

/**
 * Boolean union of one or more shapes.
 * Returns a single Shape combining all input volumes.
 */
export function union(shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('union requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  const m = getManifold();
  const manifolds = shapes.map(getManifoldFromShape);
  const result = m.Manifold.union(manifolds);
  return buildShapeFromManifold(result, shapes[0].color, shapes[0].material);
}

/**
 * Boolean difference: subtract one or more cutter shapes from a base.
 */
export function subtract(base: Shape, cutters: Shape[]): Shape {
  if (cutters.length === 0) return base;

  const m = getManifold();
  let result = getManifoldFromShape(base);

  for (const cutter of cutters) {
    result = result.subtract(getManifoldFromShape(cutter));
  }

  return buildShapeFromManifold(result, base.color, base.material);
}

/**
 * Boolean intersection of two or more shapes.
 * Returns the volume common to all inputs.
 */
export function intersect(shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('intersect requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  const m = getManifold();
  const manifolds = shapes.map(getManifoldFromShape);
  const result = m.Manifold.intersection(manifolds);
  return buildShapeFromManifold(result, shapes[0].color, shapes[0].material);
}
