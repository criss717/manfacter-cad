/**
 * Free-function transforms that delegate to Shape class methods.
 *
 * These exist for backward compatibility and for use in sandbox contexts
 * where the agent prefers functional style:
 *
 *   translate(shape, x, y, z)  ≡ shape.translate(x, y, z)
 *   rotate(shape, axis, angle) ≡ shape.rotate(axis, angle)
 *   scale(shape, factor)       ≡ shape.scale(factor)
 *   mirror(shape, normal)      ≡ shape.mirror(normal)
 *
 * All operations are immutable — they return new Shapes.
 */

import { Shape, type Vec3 } from './shape';

/**
 * Move a shape by (x, y, z) millimetres.
 */
export function translate(shape: Shape, x: number, y: number, z: number): Shape {
  return shape.translate(x, y, z);
}

/**
 * Rotate a shape around an axis by angleDeg degrees.
 * axis can be a Vec3 [x,y,z] or 'x', 'y', 'z' shorthand.
 */
export function rotate(shape: Shape, axis: Vec3 | 'x' | 'y' | 'z', angleDeg: number): Shape {
  return shape.rotate(axis, angleDeg);
}

/**
 * Scale a shape by (x, y, z) factors. Uniform scale if only one value given.
 */
export function scale(shape: Shape, factor: number | Vec3): Shape {
  return shape.scale(factor);
}

/**
 * Mirror a shape over a plane defined by its normal vector.
 * Example: mirror(shape, [1, 0, 0]) mirrors over the YZ plane.
 */
export function mirror(shape: Shape, normal: Vec3): Shape {
  return shape.mirror(normal);
}