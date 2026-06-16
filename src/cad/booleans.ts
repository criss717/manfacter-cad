/**
 * Boolean CSG operations: union, difference, intersection.
 *
 * All operations are immutable — they return new Shapes without modifying
 * the originals. Functions are variadic to match ForgeCAD API:
 *
 *   union(a, b, c)          → merged volume
 *   difference(base, cut1, cut2) → base minus cutters
 *   intersection(a, b, c)   → common volume
 *
 * Single-shape calls return the input shape unchanged (no-op).
 */

import { Shape } from './shape';
import { TrackedShape } from './trackedShape';
import { getManifold } from './engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw Manifold object from a Shape or TrackedShape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getManifoldFromShape(shape: Shape): any {
  return shape.manifold;
}

/**
 * Get the color and material from a shape (for result inheritance).
 */
function getShapeAppearance(shape: Shape): { color: string; material: typeof shape.material } {
  return { color: shape.color, material: shape.material };
}

/**
 * Wrap a manifold result as a Shape (or TrackedShape if first operand is TrackedShape).
 * Boolean operations preserve first-operand labels where geometry survives.
 */
function wrapResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifoldResult: any,
  firstShape: Shape,
  allShapes?: Shape[],
): Shape {
  const { color, material } = getShapeAppearance(firstShape);

  if (firstShape instanceof TrackedShape) {
    // Merge faces and edges from ALL TrackedShape operands
    const mergedFaces = new Map<string, import('./trackedShape').FaceRef>();
    const mergedEdges = new Map<string, import('./trackedShape').EdgeRef>();

    const operands = allShapes ?? [firstShape];
    for (const shape of operands) {
      if (shape instanceof TrackedShape) {
        // Merge faces (first operand's faces take priority on name conflicts)
        for (const name of shape.faceNames()) {
          if (!mergedFaces.has(name)) {
            try {
              mergedFaces.set(name, shape.face(name));
            } catch {
              // Face removed by boolean — skip
            }
          }
        }
        // Merge edges (first operand's edges take priority on name conflicts)
        for (const name of shape.edgeNames()) {
          if (!mergedEdges.has(name)) {
            try {
              mergedEdges.set(name, shape.edge(name));
            } catch {
              // Edge removed by boolean — skip
            }
          }
        }
      }
    }

    return new TrackedShape(manifoldResult, mergedFaces, mergedEdges, color, material);
  }

  return new Shape(manifoldResult, color, material);
}

// ---------------------------------------------------------------------------
// Boolean operations
// ---------------------------------------------------------------------------

/**
 * Boolean union of two or more shapes.
 * Returns a single Shape combining all input volumes.
 * Single shape → returns it unchanged (no-op).
 */
export function union(...shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('union requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  const m = getManifold();
  const manifolds = shapes.map(getManifoldFromShape);
  const result = m.Manifold.union(manifolds);
  return wrapResult(result, shapes[0], shapes);
}

/**
 * Boolean difference: subtract one or more cutter shapes from a base.
 * First shape is the base (kept); all subsequent shapes are subtracted.
 * Single shape → returns it unchanged (no-op).
 */
export function difference(...shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('difference requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  const m = getManifold();
  // manifold-3d difference takes array of cutters
  const [base, ...cutters] = shapes;
  const manifolds = cutters.map(getManifoldFromShape);
  const result = getManifoldFromShape(base).subtract(m.Manifold.union(manifolds));
  return wrapResult(result, base, shapes);
}

/**
 * Boolean intersection of two or more shapes.
 * Returns the volume common to all inputs.
 * Single shape → returns it unchanged (no-op).
 */
export function intersection(...shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('intersection requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  const m = getManifold();
  const manifolds = shapes.map(getManifoldFromShape);
  const result = m.Manifold.intersection(manifolds);
  return wrapResult(result, shapes[0], shapes);
}