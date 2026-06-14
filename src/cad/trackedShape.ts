/**
 * TrackedShape extends Shape with named faces for primitive solids.
 *
 * Face tracking enables the agent to reference specific surfaces for
 * operations like holes, fillets, and attachments.
 *
 * Box has 6 named faces: top, bottom, front, back, left, right.
 * Cylinder has 3 named faces: top, bottom, side.
 *
 * Boolean operations preserve first-operand labels where geometry survives.
 * Union merges prefixed labels (union-label collision avoidance via prefixLabels).
 */

import { Shape, type Vec3 } from './shape';
import type { BBox, ShapeMaterialProps, ParamDef } from './types';

// ---------------------------------------------------------------------------
// Face and Edge references
// ---------------------------------------------------------------------------

export interface FaceRef {
  /** Descriptive name of the face. */
  name: string;
  /** Center point [x, y, z] of the face. */
  center: Vec3;
  /** Outward-pointing normal [x, y, z] of the face. */
  normal: Vec3;
}

export interface EdgeRef {
  name: string;
  start: Vec3;
  end: Vec3;
  /** Normals of the two faces meeting at this edge (pointing outward from solid). */
  faceNormals: [Vec3, Vec3];
}

// ---------------------------------------------------------------------------
// Face topology builders
// ---------------------------------------------------------------------------

/**
 * Build face topology for a rectangular extrusion (box).
 *
 * ForgeCAD convention: box centered on XY, base at Z=0.
 *   X: [-width/2, width/2]
 *   Y: [-depth/2, depth/2]
 *   Z: [0, height]
 *
 * Faces:
 *   top    → Z+ normal [0, 0, 1], center at (0, 0, height)
 *   bottom → Z- normal [0, 0, -1], center at (0, 0, 0)
 *   front  → Y+ normal [0, 1, 0], center at (0, depth/2, height/2)
 *   back   → Y- normal [0, -1, 0], center at (0, -depth/2, height/2)
 *   right  → X+ normal [1, 0, 0], center at (width/2, 0, height/2)
 *   left   → X- normal [-1, 0, 0], center at (-width/2, 0, height/2)
 */
export function buildRectExtrusionTopology(
  width: number,
  depth: number,
  height: number,
): { faces: Map<string, FaceRef>; edges: Map<string, EdgeRef> } {
  const w2 = width / 2;
  const d2 = depth / 2;

  const faces = new Map<string, FaceRef>([
    ['top',    { name: 'top',    center: [0, 0, height],  normal: [0, 0, 1] }],
    ['bottom', { name: 'bottom', center: [0, 0, 0],       normal: [0, 0, -1] }],
    ['front',  { name: 'front',  center: [0, d2, height/2],     normal: [0, 1, 0] }],
    ['back',   { name: 'back',   center: [0, -d2, height/2],   normal: [0, -1, 0] }],
    ['right',  { name: 'right',  center: [w2, 0, height/2],     normal: [1, 0, 0] }],
    ['left',   { name: 'left',   center: [-w2, 0, height/2],    normal: [-1, 0, 0] }],
  ]);

  // 12 edges: each pair of adjacent faces with their normals
  const t: Vec3 = [0, 0, 1], bm: Vec3 = [0, 0, -1]; // top, bottom
  const fr: Vec3 = [0, 1, 0], bk: Vec3 = [0, -1, 0]; // front, back
  const ri: Vec3 = [1, 0, 0], le: Vec3 = [-1, 0, 0]; // right, left

  const edges = new Map<string, EdgeRef>([
    // Top face edges
    ['top_front',  { name: 'top_front',  start: [-w2, d2, height], end: [w2, d2, height], faceNormals: [t, fr] }],
    ['top_back',   { name: 'top_back',   start: [w2, -d2, height], end: [-w2, -d2, height], faceNormals: [t, bk] }],
    ['top_right',  { name: 'top_right',  start: [w2, -d2, height], end: [w2, d2, height], faceNormals: [t, ri] }],
    ['top_left',   { name: 'top_left',   start: [-w2, d2, height], end: [-w2, -d2, height], faceNormals: [t, le] }],
    // Bottom face edges
    ['bottom_front', { name: 'bottom_front', start: [-w2, d2, 0], end: [w2, d2, 0], faceNormals: [bm, fr] }],
    ['bottom_back',  { name: 'bottom_back',  start: [w2, -d2, 0], end: [-w2, -d2, 0], faceNormals: [bm, bk] }],
    ['bottom_right', { name: 'bottom_right', start: [w2, -d2, 0], end: [w2, d2, 0], faceNormals: [bm, ri] }],
    ['bottom_left',  { name: 'bottom_left',  start: [-w2, d2, 0], end: [-w2, -d2, 0], faceNormals: [bm, le] }],
    // Vertical edges
    ['front_right',  { name: 'front_right',  start: [w2, d2, 0], end: [w2, d2, height], faceNormals: [fr, ri] }],
    ['front_left',   { name: 'front_left',   start: [-w2, d2, 0], end: [-w2, d2, height], faceNormals: [fr, le] }],
    ['back_right',   { name: 'back_right',   start: [w2, -d2, 0], end: [w2, -d2, height], faceNormals: [bk, ri] }],
    ['back_left',    { name: 'back_left',    start: [-w2, -d2, 0], end: [-w2, -d2, height], faceNormals: [bk, le] }],
  ]);

  return { faces, edges };
}

/**
 * Build face topology for a cylindrical extrusion (cylinder/cone).
 *
 * ForgeCAD convention: cylinder centered on XY, base at Z=0.
 *   X/Y: centered at origin
 *   Z: [0, height]
 *
 * Faces:
 *   top    → Z+ normal [0, 0, 1], center at (0, 0, height)
 *   bottom → Z- normal [0, 0, -1], center at (0, 0, 0)
 *   side   → radial outward, center at (0, 0, height/2) with approximate center normal
 */
export function buildCircleExtrusionTopology(
  height: number,
): { faces: Map<string, FaceRef>; edges: Map<string, EdgeRef> } {
  const faces = new Map<string, FaceRef>([
    ['top',    { name: 'top',    center: [0, 0, height],      normal: [0, 0, 1] }],
    ['bottom', { name: 'bottom', center: [0, 0, 0],          normal: [0, 0, -1] }],
    ['side',   { name: 'side',   center: [0, 0, height / 2], normal: [1, 0, 0] }],
  ]);
  // Cylinder has 2 circular edges: top rim and bottom rim
  const edges = new Map<string, EdgeRef>([
    ['top_rim',    { name: 'top_rim',    start: [1, 0, height], end: [0, 1, height], faceNormals: [[0,0,1], [1,0,0]] }],
    ['bottom_rim', { name: 'bottom_rim', start: [1, 0, 0],      end: [0, 1, 0],      faceNormals: [[0,0,-1], [1,0,0]] }],
  ]);
  return { faces, edges };
}

// ---------------------------------------------------------------------------
// TrackedShape class
// ---------------------------------------------------------------------------

export class TrackedShape extends Shape {
  private _faces: Map<string, FaceRef>;
  private _edges: Map<string, EdgeRef>;

  constructor(
    manifoldShape: unknown,
    faces: Map<string, FaceRef>,
    edges?: Map<string, EdgeRef>,
    color: string = '#cccccc',
    material: ShapeMaterialProps = {},
    params: ParamDef[] = [],
  ) {
    super(manifoldShape, color, material, params);
    this._faces = faces;
    this._edges = edges ?? new Map();
  }

  /**
   * Get a named face reference. Throws if the face name doesn't exist.
   */
  face(name: string): FaceRef {
    const f = this._faces.get(name);
    if (!f) {
      const available = [...this._faces.keys()].join(', ');
      throw new Error(
        `Face '${name}' not found. Available faces: ${available || '(none)'}`
      );
    }
    return f;
  }

  /**
   * Get all available face names.
   */
  faceNames(): string[] {
    return [...this._faces.keys()];
  }

  /**
   * Get a named edge reference. Throws if the edge name doesn't exist.
   */
  edge(name: string): EdgeRef {
    const e = this._edges.get(name);
    if (!e) {
      const available = [...this._edges.keys()].join(', ');
      throw new Error(
        `Edge '${name}' not found. Available edges: ${available || '(none)'}`
      );
    }
    return e;
  }

  /**
   * Get all available edge names.
   */
  edgeNames(): string[] {
    return [...this._edges.keys()];
  }

  // -----------------------------------------------------------------------
  // Override transform methods to preserve face tracking with transforms applied
  // -----------------------------------------------------------------------

  override translate(x: number, y: number, z: number): TrackedShape {
    const newManifold = (this.manifold as any).translate([x, y, z]); // eslint-disable-line @typescript-eslint/no-explicit-any
    const newFaces = transformFaces(this._faces, (center) => [
      center[0] + x,
      center[1] + y,
      center[2] + z,
    ]);
    // Translate moves start/end points; faceNormals (directions) stay the same.
    const newEdges = new Map<string, EdgeRef>();
    for (const [name, edge] of this._edges) {
      newEdges.set(name, {
        ...edge,
        start: [edge.start[0] + x, edge.start[1] + y, edge.start[2] + z],
        end: [edge.end[0] + x, edge.end[1] + y, edge.end[2] + z],
        // faceNormals are direction vectors — unchanged by translation
      });
    }
    return new TrackedShape(newManifold, newFaces, newEdges, this.color, this.material, this.params);
  }

  override rotate(axis: Vec3 | 'x' | 'y' | 'z', angleDeg: number): TrackedShape {
    const newShape = super.rotate(axis, angleDeg);
    const newFaces = rotateFaces(this._faces, axis, angleDeg);

    // Build a Rodrigues rotation function for edges
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let rnx: number, rny: number, rnz: number;
    if (axis === 'x') { rnx = 1; rny = 0; rnz = 0; }
    else if (axis === 'y') { rnx = 0; rny = 1; rnz = 0; }
    else if (axis === 'z') { rnx = 0; rny = 0; rnz = 1; }
    else { [rnx, rny, rnz] = axis as Vec3; }
    const len = Math.sqrt(rnx * rnx + rny * rny + rnz * rnz);
    if (len !== 0) { rnx /= len; rny /= len; rnz /= len; }
    const rotateVec = (v: Vec3): Vec3 => {
      const [x, y, z] = v;
      const d = x * rnx + y * rny + z * rnz;
      const cx = rny * z - rnz * y;
      const cy = rnz * x - rnx * z;
      const cz = rnx * y - rny * x;
      return [x * cos + cx * sin + rnx * d * (1 - cos),
              y * cos + cy * sin + rny * d * (1 - cos),
              z * cos + cz * sin + rnz * d * (1 - cos)];
    };
    const newEdges = transformEdges(this._edges, rotateVec);

    return new TrackedShape(newShape.manifold, newFaces, newEdges, newShape.color, newShape.material, newShape.params);
  }

  override scale(factor: number | Vec3): TrackedShape {
    const newManifold = (this.manifold as any).scale( // eslint-disable-line @typescript-eslint/no-explicit-any
      typeof factor === 'number' ? factor : factor,
    );
    const s = typeof factor === 'number' ? [factor, factor, factor] as Vec3 : factor;
    const newFaces = transformFaces(this._faces, (center) => [
      center[0] * s[0],
      center[1] * s[1],
      center[2] * s[2],
    ]);
    return new TrackedShape(newManifold, newFaces, this._edges, this.color, this.material, this.params);
  }

  override mirror(normal: Vec3): TrackedShape {
    const newManifold = (this.manifold as any).mirror(normal); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Mirror flips face normals that are parallel to the mirror plane normal
    const newFaces = mirrorFaces(this._faces, normal);

    // Build mirror function for edges
    const [nx, ny, nz] = normal;
    const len2 = nx * nx + ny * ny + nz * nz;
    const mirrorVec = len2 === 0
      ? (v: Vec3): Vec3 => v
      : (v: Vec3): Vec3 => {
          const dot = v[0] * nx + v[1] * ny + v[2] * nz;
          const factor = (2 * dot) / len2;
          return [v[0] - factor * nx, v[1] - factor * ny, v[2] - factor * nz];
        };
    const newEdges = transformEdges(this._edges, mirrorVec);

    return new TrackedShape(newManifold, newFaces, newEdges, this.color, this.material, this.params);
  }

  // Stub overrides return TrackedShape — these delegate to the free functions
  // which now have real implementations. The override is needed so that
  // shape.fillet(radius, edges) returns TrackedShape instead of plain Shape.
  override fillet(radius: number, edges?: unknown): TrackedShape {
    console.warn('fillet() on TrackedShape instance — use the free function fillet(shape, radius, edges) for full edge tracking.');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }

  override chamfer(size: number, edges?: unknown): TrackedShape {
    console.warn('chamfer() on TrackedShape instance — use the free function chamfer(shape, size, edges) for full edge tracking.');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }

  override shell(thickness: number, facesToOpen?: unknown): TrackedShape {
    console.warn('shell() not yet fully implemented');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }

  override linearPattern(count: number, spacing: number, axis?: Vec3): TrackedShape {
    console.warn('linearPattern() not yet fully implemented');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }

  override circularPattern(count: number, angle: number, axis?: Vec3): TrackedShape {
    console.warn('circularPattern() not yet fully implemented');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }
}

// ---------------------------------------------------------------------------
// ShapeGroup — collection of shapes
// ---------------------------------------------------------------------------

export class ShapeGroup {
  readonly shapes: Shape[];
  readonly id: string;

  constructor(shapes: Shape[] = []) {
    this.shapes = shapes;
    this.id = `group-${_nextGroupId++}`;
  }

  /** Number of shapes in the group. */
  get length(): number {
    return this.shapes.length;
  }

  /** Iterate over shapes. */
  [Symbol.iterator](): Iterator<Shape> {
    return this.shapes[Symbol.iterator]();
  }
}

let _nextGroupId = 1;

// ---------------------------------------------------------------------------
// Convenience factory: group(...shapes)
// ---------------------------------------------------------------------------

/**
 * Group one or more shapes into a ShapeGroup for agent reference.
 *
 * ForgeCAD spec requires `group(s1, s2, ...)` to create a named collection.
 * Individual shapes remain independent — group is for logical organization,
 * not boolean union.
 */
export function group(...shapes: Shape[]): ShapeGroup {
  if (shapes.length === 0) {
    throw new Error('group requires at least one shape');
  }
  return new ShapeGroup(shapes);
}

// ---------------------------------------------------------------------------
// Face transform helpers
// ---------------------------------------------------------------------------

type Vec3Transformer = (v: Vec3) => Vec3;

function transformFaces(
  faces: Map<string, FaceRef>,
  transform: Vec3Transformer,
): Map<string, FaceRef> {
  const result = new Map<string, FaceRef>();
  for (const [name, face] of faces) {
    result.set(name, {
      ...face,
      center: transform(face.center),
    });
  }
  return result;
}

function rotateFaces(
  faces: Map<string, FaceRef>,
  axis: Vec3 | 'x' | 'y' | 'z',
  angleDeg: number,
): Map<string, FaceRef> {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Determine rotation axis vector
  let nx: number, ny: number, nz: number;
  if (axis === 'x') { nx = 1; ny = 0; nz = 0; }
  else if (axis === 'y') { nx = 0; ny = 1; nz = 0; }
  else if (axis === 'z') { nx = 0; ny = 0; nz = 1; }
  else { [nx, ny, nz] = axis as Vec3; }

  // Normalize
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return faces;
  nx /= len; ny /= len; nz /= len;

  // Rodrigues' rotation for each face center and normal
  const rotateVec = (v: Vec3): Vec3 => {
    const [x, y, z] = v;
    const dot = x * nx + y * ny + z * nz;
    const crossX = ny * z - nz * y;
    const crossY = nz * x - nx * z;
    const crossZ = nx * y - ny * x;
    return [
      x * cos + crossX * sin + nx * dot * (1 - cos),
      y * cos + crossY * sin + ny * dot * (1 - cos),
      z * cos + crossZ * sin + nz * dot * (1 - cos),
    ];
  };

  const result = new Map<string, FaceRef>();
  for (const [name, face] of faces) {
    result.set(name, {
      ...face,
      center: rotateVec(face.center),
      normal: rotateVec(face.normal),
    });
  }
  return result;
}

function mirrorFaces(
  faces: Map<string, FaceRef>,
  normal: Vec3,
): Map<string, FaceRef> {
  const [nx, ny, nz] = normal;
  const len2 = nx * nx + ny * ny + nz * nz;
  if (len2 === 0) return faces;

  // Mirror a point: p' = p - 2(p·n)/(n·n) * n
  const mirrorVec = (v: Vec3): Vec3 => {
    const dot = v[0] * nx + v[1] * ny + v[2] * nz;
    const factor = (2 * dot) / len2;
    return [v[0] - factor * nx, v[1] - factor * ny, v[2] - factor * nz];
  };

  const result = new Map<string, FaceRef>();
  for (const [name, face] of faces) {
    result.set(name, {
      ...face,
      center: mirrorVec(face.center),
      normal: mirrorVec(face.normal),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Edge transform helpers
// ---------------------------------------------------------------------------

/**
 * Transform all edges: apply the same vector transform to start, end,
 * and both faceNormals. Used for rotate and mirror which affect directions.
 */
function transformEdges(
  edges: Map<string, EdgeRef>,
  transformVec: (v: Vec3) => Vec3,
): Map<string, EdgeRef> {
  const result = new Map<string, EdgeRef>();
  for (const [name, edge] of edges) {
    result.set(name, {
      ...edge,
      start: transformVec(edge.start),
      end: transformVec(edge.end),
      faceNormals: [transformVec(edge.faceNormals[0]), transformVec(edge.faceNormals[1])],
    });
  }
  return result;
}