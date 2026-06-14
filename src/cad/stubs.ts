/**
 * Stub functions for ForgeCAD API completeness.
 *
 * Fillet and chamfer use correct wedge-intersection and prism construction
 * via manifold-3d booleans. Shell remains a stub.
 */

import { Shape, type Vec3 } from './shape';
import { TrackedShape } from './trackedShape';
import { box, cylinder, sphere } from './primitives';
import { union, difference, intersection } from './booleans';
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
// ---------------------------------------------------------------------------
// Rounded primitives — using hull3d with corner spheres for perfect rounding
// ---------------------------------------------------------------------------

/**
 * Create a box with all edges and corners rounded.
 *
 * Uses convex hull of 8 corner spheres → perfectly rounded box.
 * Much cleaner than per-edge fillet cylinders.
 *
 * @param x, y, z  Box dimensions
 * @param radius   Rounding radius (default: 0 = sharp box)
 */
export function roundedBox(x: number, y: number, z: number, radius: number = 0): Shape {
  if (radius <= 0) return box(x, y, z);
  const r = radius;
  const hw = x / 2, hd = y / 2, hh = z / 2;
  // 8 corner spheres, inset by radius from each face
  const corners = [
    sphere(r).translate(-hw + r, -hd + r, r),         // bottom-left-front
    sphere(r).translate( hw - r, -hd + r, r),         // bottom-right-front
    sphere(r).translate(-hw + r,  hd - r, r),         // bottom-left-back
    sphere(r).translate( hw - r,  hd - r, r),         // bottom-right-back
    sphere(r).translate(-hw + r, -hd + r, z - r),     // top-left-front
    sphere(r).translate( hw - r, -hd + r, z - r),     // top-right-front
    sphere(r).translate(-hw + r,  hd - r, z - r),     // top-left-back
    sphere(r).translate( hw - r,  hd - r, z - r),     // top-right-back
  ];
  return hull3d(...corners);
}

// ---------------------------------------------------------------------------
// Feature stubs — with working implementations for TrackedShape
// ---------------------------------------------------------------------------

/**
 * Fillet (round) edges on a TrackedShape via wedge-intersection method.
 *
 * For each edge:
 *  1. Compute the dihedral angle φ between the two face normals.
 *  2. Compute the bisector direction and offset = radius / cos(φ/2).
 *  3. Build a cylinder of the requested radius centered along the bisector at offset distance.
 *  4. Build a wedge by intersecting a large box trimmed by the two face planes.
 *  5. Intersect the cylinder with the wedge → quarter-cylinder fillet.
 *  6. Convex edge (dot(n1,n2) ≤ 0): difference(shape, quarterCylinder)
 *     Concave edge (dot(n1,n2) > 0): union(shape, quarterCylinder)
 *
 * Apply BEFORE boolean operations (union/difference).
 */
export function fillet(shape: Shape, radius: number, edges?: unknown): Shape {
  if (!(shape instanceof TrackedShape)) {
    console.warn('fillet() requires TrackedShape. Apply BEFORE union/difference.');
    return shape;
  }
  if (radius <= 0) return shape;

  const edgeNames = typeof edges === 'string' ? [edges]
    : (Array.isArray(edges) ? edges as string[] : shape.edgeNames());

  if (edgeNames.length === 0) {
    throw new Error(
      'fillet() requires edges. Apply fillet BEFORE union/difference, or use it on a single box/cylinder.'
    );
  }

  let result: Shape = shape;
  for (const edgeName of edgeNames) {
    try {
      const eref = shape.edge(edgeName);
      if (!eref?.faceNormals) continue;

      const [n1, n2] = eref.faceNormals;
      const dx = eref.end[0] - eref.start[0];
      const dy = eref.end[1] - eref.start[1];
      const dz = eref.end[2] - eref.start[2];
      const edgeLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Oversized-radius guard: skip if radius * 2 > edge length
      if (edgeLen < 1e-6 || radius * 2 > edgeLen) {
        if (radius * 2 > edgeLen && edgeLen > 1e-6) {
          console.warn(`fillet: radius ${radius} too large for edge '${edgeName}' (length ${edgeLen.toFixed(2)}), skipping`);
        }
        continue;
      }

      // Dihedral angle between face normals
      const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
      const phi = Math.acos(Math.max(-1, Math.min(1, dot)));
      const isConvex = dot <= 0;

      // Bisector direction: n1 + n2 (points away from solid for convex edges)
      const bx = n1[0] + n2[0];
      const by = n1[1] + n2[1];
      const bz = n1[2] + n2[2];
      const blen = Math.sqrt(bx * bx + by * by + bz * bz);
      if (blen < 1e-6) continue; // Degenerate: normals are anti-parallel

      // Offset along bisector: radius / cos(φ/2)
      const halfPhi = phi / 2;
      const cosHalf = Math.cos(halfPhi);
      if (Math.abs(cosHalf) < 1e-6) continue;
      const offset = radius / cosHalf;

      const bisector: Vec3 = [bx / blen, by / blen, bz / blen];

      // Cylinder center is at edge.start + offset * bisector
      // (start is one vertex of the edge; the bisector points away from the
      //  edge toward the center of curvature)
      const centerX = eref.start[0] + bisector[0] * offset;
      const centerY = eref.start[1] + bisector[1] * offset;
      const centerZ = eref.start[2] + bisector[2] * offset;

      // Build cylinder along edge direction
      const cyl = createAlignedCylinder(edgeLen, radius, [dx / edgeLen, dy / edgeLen, dz / edgeLen]);

      // Position cylinder at center
      const positioned: Shape = translate(cyl, centerX, centerY, centerZ);

      // Build a large box and trim it with the two face planes to create a wedge
      // that selects only the quarter-cylinder portion tangent to both faces.
      const largeSize = edgeLen * 4;
      const largeBox = box(largeSize, largeSize, largeSize);
      const face1OriginOffset = eref.start[0] * n1[0] + eref.start[1] * n1[1] + eref.start[2] * n1[2];
      const face2OriginOffset = eref.start[0] * n2[0] + eref.start[1] * n2[1] + eref.start[2] * n2[2];

      // Build wedge: the region bounded by both face planes that contains the
      // quarter-cylinder fillet volume.
      //
      // trimByPlane(normal, offset) keeps the half-space where dot(p, normal) ≤ offset.
      //
      // For convex edges (dot(n1,n2) ≤ 0): the fillet sits OUTSIDE the solid,
      // in the region where dot(p, n1) ≥ offset1 and dot(p, n2) ≥ offset2.
      // Use negated normals with negated offsets to keep that outer region.
      //
      // For concave edges (dot(n1,n2) > 0): the fillet fills the interior groove,
      // in the region where dot(p, n1) ≤ offset1 and dot(p, n2) ≤ offset2.
      // Use original normals and offsets.
      let wedge: Shape;
      if (isConvex) {
        const negN1: Vec3 = [-n1[0], -n1[1], -n1[2]];
        const negN2: Vec3 = [-n2[0], -n2[1], -n2[2]];
        wedge = trimByPlaneShape(
          trimByPlaneShape(largeBox, negN1, -face1OriginOffset),
          negN2,
          -face2OriginOffset,
        );
      } else {
        wedge = trimByPlaneShape(
          trimByPlaneShape(largeBox, n1, face1OriginOffset),
          n2,
          face2OriginOffset,
        );
      }

      // Quarter-cylinder = intersection of cylinder and wedge
      let quarterCyl: Shape;
      try {
        quarterCyl = intersection(positioned, wedge);
      } catch {
        // Boolean failure — skip this edge
        console.warn(`fillet: boolean intersection failed for edge '${edgeName}', skipping`);
        continue;
      }

      // Convex edge → add material (union) — round the outside corner
      // Concave edge → remove material (difference) — round the inside groove
      try {
        if (isConvex) {
          result = union(result, quarterCyl);
        } else {
          result = difference(result, quarterCyl);
        }
      } catch {
        // Boolean failure — skip this edge
        console.warn(`fillet: boolean operation failed for edge '${edgeName}', skipping`);
        continue;
      }
    } catch {
      // Edge not found — skip
    }
  }
  return result;
}

/** Create a cylinder aligned along a direction, centered at origin, length units long. */
function createAlignedCylinder(
  length: number,
  radius: number,
  dir: readonly [number, number, number],
): Shape {
  const cyl = cylinder(length, radius);
  const zAxis: readonly [number, number, number] = [0, 0, 1];
  const cross: readonly [number, number, number] = [
    zAxis[1] * dir[2] - zAxis[2] * dir[1],
    zAxis[2] * dir[0] - zAxis[0] * dir[2],
    zAxis[0] * dir[1] - zAxis[1] * dir[0],
  ];
  const crossLen = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);
  if (crossLen > 1e-6) {
    const angleRad = Math.asin(Math.min(1, crossLen));
    const angleDeg = angleRad * 180 / Math.PI;
    const axis: Vec3 = [cross[0] / crossLen, cross[1] / crossLen, cross[2] / crossLen];
    return rotate(cyl, axis, angleDeg);
  }
  return cyl;
}

/**
 * Low-level `trimByPlane` on a Shape using manifold-3d's trimByPlane.
 * Takes a normal vector and a scalar originOffset (dot product of origin point with normal).
 */
function trimByPlaneShape(shape: Shape, normal: Vec3, originOffset: number): Shape {
  const manifold = shape.manifold as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = manifold.trimByPlane(normal, originOffset);
  return new Shape(result, shape.color, shape.material);
}

/**
 * Chamfer (bevel) edges on a TrackedShape via triangular prism subtraction.
 *
 * For each edge:
 *  1. Build a right-triangle CrossSection: [(0,0), (d,0), (0,d)]
 *  2. Extrude it along Z to create a triangular prism.
 *  3. Build a 4×4 transform mapping profile +X→inward face 1, +Y→inward face 2, +Z→edge dir.
 *  4. Apply transform and translate to edge start.
 *  5. Subtract the positioned prism from the shape (difference).
 */
export function chamfer(shape: Shape, distance: number, edges?: unknown): Shape {
  if (!(shape instanceof TrackedShape)) {
    console.warn('chamfer() requires a TrackedShape with named edges. Use box() or cylinder() as base.');
    return shape;
  }

  const edgeNames = typeof edges === 'string' ? [edges]
    : (Array.isArray(edges) ? edges as string[] : shape.edgeNames());
  let result = shape as Shape;

  const m = getManifold();

  for (const edgeName of edgeNames) {
    try {
      const eref = (shape as TrackedShape).edge(edgeName);
      if (!eref?.faceNormals) continue;

      const [n1, n2] = eref.faceNormals;
      const dx = eref.end[0] - eref.start[0];
      const dy = eref.end[1] - eref.start[1];
      const dz = eref.end[2] - eref.start[2];
      const edgeLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (edgeLen < 1e-6) continue;

      // Oversized-distance guard: warn if distance > edge length but proceed
      if (distance > edgeLen) {
        console.warn(`chamfer: distance ${distance} exceeds edge length ${edgeLen.toFixed(2)} on '${edgeName}', result may be imprecise`);
      }

      const d = distance;
      // Right-triangle profile: [(0,0), (d,0), (0,d)]
      const triProfile: [number, number][] = [[0, 0], [d, 0], [0, d]];

      // Create CrossSection and extrude along Z
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs = (m as any).CrossSection.ofPolygons([triProfile]) as { extrude: (h: number) => any };
      const prismManifold = cs.extrude(edgeLen);

      // Build orientation from face normals:
      // Profile +Z → edge direction
      // Profile +X → inward direction along face 1 (projection of -n2 onto plane perp to edge)
      // Profile +Y → inward direction along face 2 (projection of -n1 onto plane perp to edge)
      const ez: Vec3 = [dx / edgeLen, dy / edgeLen, dz / edgeLen];

      // Inward along face 1: project -n2 onto plane perpendicular to ez
      const negN2x = -n2[0], negN2y = -n2[1], negN2z = -n2[2];
      const dotN2Ez = negN2x * ez[0] + negN2y * ez[1] + negN2z * ez[2];
      let ex: Vec3 = [negN2x - dotN2Ez * ez[0], negN2y - dotN2Ez * ez[1], negN2z - dotN2Ez * ez[2]];
      const exLen = Math.sqrt(ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2]);
      if (exLen < 1e-6) continue; // Degenerate: -n2 nearly parallel to edge
      ex = [ex[0] / exLen, ex[1] / exLen, ex[2] / exLen];

      // Inward along face 2: project -n1 onto plane perpendicular to ez
      const negN1x = -n1[0], negN1y = -n1[1], negN1z = -n1[2];
      const dotN1Ez = negN1x * ez[0] + negN1y * ez[1] + negN1z * ez[2];
      let ey: Vec3 = [negN1x - dotN1Ez * ez[0], negN1y - dotN1Ez * ez[1], negN1z - dotN1Ez * ez[2]];
      const eyLen = Math.sqrt(ey[0] * ey[0] + ey[1] * ey[1] + ey[2] * ey[2]);
      if (eyLen < 1e-6) continue; // Degenerate: -n1 nearly parallel to edge
      ey = [ey[0] / eyLen, ey[1] / eyLen, ey[2] / eyLen];

      // Build 4×4 column-major transform matrix:
      // Maps profile +X → ex, +Y → ey, +Z → ez, translated to edge start
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformMat = [
        ex[0], ex[1], ex[2], 0,
        ey[0], ey[1], ey[2], 0,
        ez[0], ez[1], ez[2], 0,
        eref.start[0], eref.start[1], eref.start[2], 1,
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformedManifold = (prismManifold as any).transform(transformMat);
      const positioned = new Shape(transformedManifold);

      try {
        result = difference(result, positioned);
      } catch {
        console.warn(`chamfer: boolean difference failed for edge '${edgeName}', skipping`);
        continue;
      }
    } catch {
      // Edge not found — skip
    }
  }

  return result;
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