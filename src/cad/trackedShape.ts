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
  /** Descriptive name of the edge. */
  name: string;
  /** Start point [x, y, z] of the edge. */
  start: Vec3;
  /** End point [x, y, z] of the edge. */
  end: Vec3;
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
): Map<string, FaceRef> {
  const w2 = width / 2;
  const d2 = depth / 2;
  const h2 = height / 2;

  return new Map<string, FaceRef>([
    ['top',    { name: 'top',    center: [0, 0, height],  normal: [0, 0, 1] }],
    ['bottom', { name: 'bottom', center: [0, 0, 0],       normal: [0, 0, -1] }],
    ['front',  { name: 'front',  center: [0, d2, h2],     normal: [0, 1, 0] }],
    ['back',   { name: 'back',   center: [0, -d2, h2],   normal: [0, -1, 0] }],
    ['right',  { name: 'right',  center: [w2, 0, h2],     normal: [1, 0, 0] }],
    ['left',   { name: 'left',   center: [-w2, 0, h2],    normal: [-1, 0, 0] }],
  ]);
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
): Map<string, FaceRef> {
  return new Map<string, FaceRef>([
    ['top',    { name: 'top',    center: [0, 0, height],      normal: [0, 0, 1] }],
    ['bottom', { name: 'bottom', center: [0, 0, 0],          normal: [0, 0, -1] }],
    ['side',   { name: 'side',   center: [0, 0, height / 2], normal: [1, 0, 0] }],
  ]);
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
    return new TrackedShape(newManifold, newFaces, this._edges, this.color, this.material, this.params);
  }

  override rotate(axis: Vec3 | 'x' | 'y' | 'z', angleDeg: number): TrackedShape {
    // For simplicity, when rotating a TrackedShape, we rebuild faces with
    // bounding-box approximation rather than exact face center rotation.
    // This is a pragmatic tradeoff: face normals rotate correctly,
    // but face centers are recomputed from the new bounding box.
    const newShape = super.rotate(axis, angleDeg);
    // After rotation, face topology is approximate. For precise tracking,
    // the user would need to re-derive from the primitive. We keep face names
    // but update normals via rotation.
    const newFaces = rotateFaces(this._faces, axis, angleDeg);
    return new TrackedShape(newShape.manifold, newFaces, this._edges, newShape.color, newShape.material, newShape.params);
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
    return new TrackedShape(newManifold, newFaces, this._edges, this.color, this.material, this.params);
  }

  // Stub overrides return TrackedShape
  override fillet(radius: number, edges?: unknown): TrackedShape {
    console.warn('fillet() not yet fully implemented — use chamfer for beveled edges instead');
    return new TrackedShape(this.manifold, this._faces, this._edges, this.color, this.material, this.params);
  }

  override chamfer(size: number, edges?: unknown): TrackedShape {
    console.warn('chamfer() not yet fully implemented — fillet and chamfer are stubs');
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