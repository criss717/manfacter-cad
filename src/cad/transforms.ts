/**
 * Immutable spatial transforms: translate, rotate, scale, mirror.
 *
 * Every function returns a new Shape — the original is never modified.
 */

import type { Shape } from './types';
import { buildShapeFromManifold, getManifoldFromShape } from './engine';

/**
 * Move a shape by (x, y, z) millimetres.
 */
export function translate(
  shape: Shape,
  x: number,
  y: number,
  z: number
): Shape {
  const m = getManifoldFromShape(shape).translate([x, y, z]);
  return buildShapeFromManifold(m, shape.color, shape.material, shape.params);
}

/**
 * Rotate a shape by Euler angles (degrees) around X, Y, Z axes.
 * Rotation order: X → Y → Z (global frame).
 */
export function rotate(
  shape: Shape,
  xDeg: number,
  yDeg: number,
  zDeg: number
): Shape {
  const m = getManifoldFromShape(shape).rotate([xDeg, yDeg, zDeg]);
  return buildShapeFromManifold(m, shape.color, shape.material, shape.params);
}

/**
 * Scale a shape by (x, y, z) factors. Uniform scale if only one value given.
 */
export function scale(
  shape: Shape,
  x: number,
  y?: number,
  z?: number
): Shape {
  const m = getManifoldFromShape(shape).scale(
    y === undefined && z === undefined ? x : [x, y ?? 1, z ?? 1]
  );
  return buildShapeFromManifold(m, shape.color, shape.material, shape.params);
}

/**
 * Mirror a shape over a plane defined by its normal vector.
 * For example, `mirror(shape, [1, 0, 0])` mirrors over the YZ plane.
 */
export function mirror(
  shape: Shape,
  normal: [number, number, number]
): Shape {
  const m = getManifoldFromShape(shape).mirror(normal);
  return buildShapeFromManifold(m, shape.color, shape.material, shape.params);
}
