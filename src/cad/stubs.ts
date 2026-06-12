/**
 * Stub functions for ForgeCAD API completeness.
 *
 * These functions exist to satisfy the ForgeCAD API contract but are not
 * yet fully implemented. They log warnings and fall back to simpler
 * operations where possible.
 */

import { Shape, type Vec3 } from './shape';
import { union } from './booleans';
import { translate, rotate } from './transforms';
import { getManifold } from './engine';

/**
 * Compute the convex hull of one or more shapes.
 *
 * ForgeCAD spec requires `hull3d(s1, s2, ...)` to return a Shape
 * representing the convex hull of all inputs.
 *
 * Current implementation:
 *  - If manifold-3d provides `Manifold.hull()`, uses it for a true convex hull.
 *  - Otherwise falls back to boolean union and logs a warning.
 *
 * Single shape → returns it unchanged (no-op).
 */
export function hull3d(...shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('hull3d requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = getManifold();

  // Try manifold-3d's native convex hull (Manifold.hull was introduced in v3.x)
  if (typeof m.Manifold.hull === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifolds = shapes.map((s) => (s as any).manifold);
    const result = m.Manifold.hull(manifolds);
    // Inherit appearance from first shape
    const { color, material } = { color: shapes[0].color, material: shapes[0].material };
    return new Shape(result, color, material);
  }

  // Fallback: union is NOT a convex hull, but it's the closest reasonable
  // approximation available without a native hull implementation.
  console.warn(
    'hull3d: convex hull not fully implemented — falling back to boolean union. ' +
    'Install manifold-3d ≥ 3.x for native hull support.'
  );
  return union(...shapes);
}

// ---------------------------------------------------------------------------
// Feature stubs — free-function wrappers that delegate to Shape methods
// ---------------------------------------------------------------------------

/**
 * Fillet (round) edges on a shape. STUB.
 * Delegates to `shape.fillet(radius, edges)`.
 */
export function fillet(shape: Shape, radius: number, edges?: unknown): Shape {
  return shape.fillet(radius, edges);
}

/**
 * Chamfer (bevel) edges on a shape. STUB.
 * Delegates to `shape.chamfer(size, edges)`.
 */
export function chamfer(shape: Shape, size: number, edges?: unknown): Shape {
  return shape.chamfer(size, edges);
}

/**
 * Shell (hollow) a shape. STUB.
 * Delegates to `shape.shell(thickness, facesToOpen)`.
 */
export function shell(shape: Shape, thickness: number, facesToOpen?: unknown): Shape {
  return shape.shell(thickness, facesToOpen);
}

/**
 * Linear pattern — create a linear array. STUB.
 * Delegates to `shape.linearPattern(count, spacing, axis)`.
 */
export function linearPattern(
  shape: Shape,
  count: number,
  spacing: number,
  axis?: Vec3,
): Shape {
  return shape.linearPattern(count, spacing, axis);
}

/**
 * Circular pattern — create a circular array. STUB.
 * Delegates to `shape.circularPattern(count, angle, axis)`.
 */
export function circularPattern(
  shape: Shape,
  count: number,
  angle: number,
  axis?: Vec3,
): Shape {
  return shape.circularPattern(count, angle, axis);
}