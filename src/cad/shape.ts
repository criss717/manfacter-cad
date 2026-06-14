/**
 * Immutable Shape class wrapping a manifold-3d solid.
 *
 * Every operation returns a new Shape instance — never mutates in place.
 * This matches the ForgeCAD API contract and manifold-3d's immutability.
 */

import type { BBox, ShapeMaterialProps, ParamDef } from './types';

// ---------------------------------------------------------------------------
// Vec3 type
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Shape ID counter
// ---------------------------------------------------------------------------

let _nextShapeId = 1;

export function resetShapeIdCounter(): void {
  _nextShapeId = 1;
}

function newShapeId(): string {
  return `shape-${_nextShapeId++}`;
}

// ---------------------------------------------------------------------------
// Shape class
// ---------------------------------------------------------------------------

export class Shape {
  /** Unique identifier for this shape. */
  readonly id: string;
  /** Underlying manifold-3d solid (opaque). */
  readonly manifold: unknown;
  /** Display color as CSS hex string (#rrggbb). */
  readonly color: string;
  /** Material properties for the renderer. */
  readonly material: ShapeMaterialProps;
  /** Original construction parameters (for parametric editing). */
  readonly params: ParamDef[];

  constructor(
    manifoldShape: unknown,
    color: string = '#cccccc',
    material: ShapeMaterialProps = {},
    params: ParamDef[] = [],
  ) {
    this.id = newShapeId();
    this.manifold = manifoldShape;
    this.color = color;
    this.material = material;
    this.params = params;
  }

  // -----------------------------------------------------------------------
  // Transforms (all return new Shape — immutable)
  // -----------------------------------------------------------------------

  /**
   * Translate (move) the shape by (x, y, z) millimetres.
   */
  translate(x: number, y: number, z: number): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (this.manifold as any).translate([x, y, z]);
    return new Shape(m, this.color, this.material, this.params);
  }

  /**
   * Rotate around an axis by angleDeg degrees.
   * ForgeCAD signature: rotate(axis, angleDeg) where axis is [x,y,z].
   *
   * axis can be a Vec3 [x,y,z] or one of 'x', 'y', 'z' shorthand.
   */
  rotate(axis: Vec3 | 'x' | 'y' | 'z', angleDeg: number): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifold = this.manifold as any;

    if (axis === 'x') {
      return new Shape(manifold.rotate([angleDeg, 0, 0]), this.color, this.material, this.params);
    }
    if (axis === 'y') {
      return new Shape(manifold.rotate([0, angleDeg, 0]), this.color, this.material, this.params);
    }
    if (axis === 'z') {
      return new Shape(manifold.rotate([0, 0, angleDeg]), this.color, this.material, this.params);
    }

    // Vec3 axis — manifold-3d v3.x does not provide a direct axis-angle rotate
    // on the instance. We use Euler decomposition for simple axes and
    // a quaternion rotation matrix for arbitrary axes.
    const [ax, ay, az] = axis as Vec3;
    const len = Math.sqrt(ax * ax + ay * ay + az * az);
    if (len === 0) {
      throw new Error('rotate: axis vector cannot be zero');
    }

    // Normalize
    const nx = ax / len;
    const ny = ay / len;
    const nz = az / len;

    // Build rotation matrix from axis-angle (Rodrigues' formula)
    const rad = (angleDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const t = 1 - c;

    // Column-major 3x3 rotation matrix followed by [0,0,0,1] row for 4x4 homogeneous
    // manifold-3d uses column-major for transform()
    const m00 = t * nx * nx + c;
    const m01 = t * nx * ny - s * nz;
    const m02 = t * nx * nz + s * ny;
    const m10 = t * nx * ny + s * nz;
    const m11 = t * ny * ny + c;
    const m12 = t * ny * nz - s * nx;
    const m20 = t * nx * nz - s * ny;
    const m21 = t * ny * nz + s * nx;
    const m22 = t * nz * nz + c;

    // manifold-3d transform takes a flat array of 16 numbers (4x4 column-major)
    // Translation is identity (0,0,0)
    const transform = [
      m00, m10, m20, 0,
      m01, m11, m21, 0,
      m02, m12, m22, 0,
      0,   0,   0,   1,
    ];

    const result = manifold.transform(transform);
    return new Shape(result, this.color, this.material, this.params);
  }

  /**
   * Rotate around the X axis by angleDeg degrees.
   */
  rotateX(angleDeg: number): Shape {
    return this.rotate('x', angleDeg);
  }

  /**
   * Rotate around the Y axis by angleDeg degrees.
   */
  rotateY(angleDeg: number): Shape {
    return this.rotate('y', angleDeg);
  }

  /**
   * Rotate around the Z axis by angleDeg degrees.
   */
  rotateZ(angleDeg: number): Shape {
    return this.rotate('z', angleDeg);
  }

  /**
   * Scale the shape. Uniform if a single number; per-axis if Vec3.
   */
  scale(factor: number | Vec3): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifold = this.manifold as any;
    const scaled =
      typeof factor === 'number'
        ? manifold.scale(factor)
        : manifold.scale(factor);
    return new Shape(scaled, this.color, this.material, this.params);
  }

  /**
   * Mirror the shape over a plane defined by its normal vector.
   * Example: mirror([1, 0, 0]) mirrors over the YZ plane.
   */
  mirror(normal: Vec3): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (this.manifold as any).mirror(normal);
    return new Shape(m, this.color, this.material, this.params);
  }

  /**
   * Move the shape so its bounding-box center is at (x, y, z).
   */
  moveTo(x: number, y: number, z: number): Shape {
    const bbox = this.boundingBox();
    const cx = (bbox.min[0] + bbox.max[0]) / 2;
    const cy = (bbox.min[1] + bbox.max[1]) / 2;
    const cz = (bbox.min[2] + bbox.max[2]) / 2;
    return this.translate(x - cx, y - cy, z - cz);
  }

  // -----------------------------------------------------------------------
  // Inspection
  // -----------------------------------------------------------------------

  /** Get the axis-aligned bounding box. */
  boundingBox(): BBox {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const box = (this.manifold as any).boundingBox() as { min: number[]; max: number[] };
    const min: [number, number, number] = [box.min[0], box.min[1], box.min[2]];
    const max: [number, number, number] = [box.max[0], box.max[1], box.max[2]];
    return {
      min,
      max,
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    };
  }

  /** Get volume in cubic millimetres. */
  volume(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.manifold as any).volume();
  }

  /** Get surface area in square millimetres. */
  surfaceArea(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.manifold as any).surfaceArea();
  }

  /** Check whether this shape is empty (no triangles). */
  isEmpty(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.manifold as any).isEmpty();
  }

  /** Get triangle count. */
  numTri(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.manifold as any).numTri();
  }

  // -----------------------------------------------------------------------
  // Appearance
  // -----------------------------------------------------------------------

  /**
   * Set display color. Returns a new Shape with the color applied.
   * Matches ForgeCAD's `.color(hex)` chainable method.
   */
  setColor(hex: string): Shape {
    return new Shape(this.manifold, hex, this.material, this.params);
  }

  /**
   * Set material properties. Returns a new Shape with the material applied.
   */
  setMaterial(props: ShapeMaterialProps): Shape {
    return new Shape(this.manifold, this.color, { ...this.material, ...props }, this.params);
  }

  // -----------------------------------------------------------------------
  // Stubs (no-op, return new Shape identical to this, with console warning)
  // -----------------------------------------------------------------------

  /**
   * Fillet (round) edges. Delegates to the free function fillet(shape, radius, edges).
   * For full edge tracking, use the standalone fillet() function.
   */
  fillet(_radius: number, _edges?: unknown): Shape {
    console.warn('fillet() on plain Shape — use fillet(shape, radius, edges) for TrackedShape edge operations.');
    return new Shape(this.manifold, this.color, this.material, this.params);
  }

  /**
   * Chamfer (bevel) edges. Delegates to the free function chamfer(shape, distance, edges).
   * For full edge tracking, use the standalone chamfer() function.
   */
  chamfer(_size: number, _edges?: unknown): Shape {
    console.warn('chamfer() on plain Shape — use chamfer(shape, size, edges) for TrackedShape edge operations.');
    return new Shape(this.manifold, this.color, this.material, this.params);
  }

  /**
   * Shell (hollow) the shape. STUB — not yet fully implemented.
   */
  shell(_thickness: number, _facesToOpen?: unknown): Shape {
    console.warn('shell() not yet fully implemented');
    return new Shape(this.manifold, this.color, this.material, this.params);
  }

  /**
   * Linear pattern — create a linear array. STUB.
   */
  linearPattern(_count: number, _spacing: number, _axis?: Vec3): Shape {
    console.warn('linearPattern() not yet fully implemented');
    return new Shape(this.manifold, this.color, this.material, this.params);
  }

  /**
   * Circular pattern — create a circular array. STUB.
   */
  circularPattern(_count: number, _angle: number, _axis?: Vec3): Shape {
    console.warn('circularPattern() not yet fully implemented');
    return new Shape(this.manifold, this.color, this.material, this.params);
  }

  // -----------------------------------------------------------------------
  // Clone
  // -----------------------------------------------------------------------

  /** Create a copy of this shape with a new ID. */
  clone(): Shape {
    return new Shape(this.manifold, this.color, { ...this.material }, [...this.params]);
  }
}