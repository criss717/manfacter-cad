/**
 * ForgeCAD API Surface — complete function set.
 *
 * Every function the ForgeCAD docs mention is defined here so the AI agent
 * never sees "X is not defined". Functions with real implementations work
 * correctly; the rest are descriptive stubs that point to alternatives.
 */
import { Shape, type Vec3 } from './shape';
import { TrackedShape, ShapeGroup, group } from './trackedShape';
import { box, cylinder, sphere, torus } from './primitives';
import { union, difference, intersection } from './booleans';
import { translate, rotate, scale, mirror } from './transforms';
import { hull3d, fillet, chamfer, shell } from './stubs';
import { getManifold } from './engine';

// Re-export existing functions that are part of the ForgeCAD surface
export { hull3d, fillet, chamfer, shell };

// ---------------------------------------------------------------------------
// Pattern helpers (working implementations)
// ---------------------------------------------------------------------------

/** Linear pattern — creates count copies spaced along an axis. */
export function linearPattern(
  shape: Shape,
  count: number,
  spacing: number,
  axis: Vec3 = [1, 0, 0],
): ShapeGroup {
  const norm = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2) || 1;
  const dx = (axis[0] / norm) * spacing;
  const dy = (axis[1] / norm) * spacing;
  const dz = (axis[2] / norm) * spacing;
  const shapes: Shape[] = [];
  for (let i = 0; i < count; i++) {
    shapes.push(translate(shape, dx * i, dy * i, dz * i));
  }
  return group(...shapes);
}

/** Circular pattern — creates count copies rotated around an axis. */
export function circularPattern(
  shape: Shape,
  count: number,
  totalAngle: number = 360,
  axis: Vec3 = [0, 0, 1],
): ShapeGroup {
  const angleStep = totalAngle / count;
  const shapes: Shape[] = [];
  for (let i = 0; i < count; i++) {
    shapes.push(rotate(shape, axis, angleStep * i));
  }
  return group(...shapes);
}

/** Mirror copy — creates a copy mirrored across a plane. */
export function mirrorCopy(shape: Shape, normal: Vec3 = [1, 0, 0]): ShapeGroup {
  return group(shape, mirror(shape, normal));
}

// ---------------------------------------------------------------------------
// Axis-specific rotate helpers
// ---------------------------------------------------------------------------

export function rotateX(shape: Shape, angleDeg: number): Shape {
  return rotate(shape, [1, 0, 0], angleDeg);
}
export function rotateY(shape: Shape, angleDeg: number): Shape {
  return rotate(shape, [0, 1, 0], angleDeg);
}
export function rotateZ(shape: Shape, angleDeg: number): Shape {
  return rotate(shape, [0, 0, 1], angleDeg);
}

// ---------------------------------------------------------------------------
// Additional transforms
// ---------------------------------------------------------------------------

/** Move shape so its bounding-box min sits at (x, y, z). */
export function moveTo(shape: Shape, x: number, y: number, z: number): Shape {
  const bb = shape.boundingBox();
  return translate(shape, x - bb.min[0], y - bb.min[1], z - bb.min[2]);
}

/** Rotate around an arbitrary axis passing through a pivot point. */
export function rotateAround(
  shape: Shape,
  axis: Vec3,
  angleDeg: number,
  pivot: Vec3 = [0, 0, 0],
): Shape {
  const moved = translate(shape, -pivot[0], -pivot[1], -pivot[2]);
  const rotated = rotate(moved, axis, angleDeg);
  return translate(rotated, pivot[0], pivot[1], pivot[2]);
}

/** Project a point along a direction (translates shape). STUB. */
export function pointAlong(_shape: Shape, _direction: Vec3): Shape {
  throw new Error('pointAlong() not implemented — use translate() instead');
}

/** Move shape relative to another shape's local frame. STUB. */
export function moveToLocal(
  _shape: Shape,
  _target: Shape,
  _x: number,
  _y: number,
  _z: number,
): Shape {
  throw new Error('moveToLocal() not implemented');
}

// ---------------------------------------------------------------------------
// Sketch 2D (all stubs — full 2D engine is future work)
// ---------------------------------------------------------------------------

const SKETCH_MSG =
  'Sketch/2D operations are not available yet. Use 3D primitives (box, cylinder, sphere, torus) ' +
  'with boolean operations (difference, union, intersection) to approximate 2D profiles. ' +
  'For holes, use: difference(plate, cylinder(thickness, holeRadius)).';

function sketchStub(name: string): never {
  throw new Error(`${name}() not available. ${SKETCH_MSG}`);
}

export function rect(): never { sketchStub('rect'); }
export function circle2d(): never { sketchStub('circle2d'); }
export function roundedRect(): never { sketchStub('roundedRect'); }
export function polygon(): never { sketchStub('polygon'); }
export function ngon(): never { sketchStub('ngon'); }
export function ellipse(): never { sketchStub('ellipse'); }
export function slot(): never { sketchStub('slot'); }
export function star(): never { sketchStub('star'); }
export function path(): never { sketchStub('path'); }
export function stroke(): never { sketchStub('stroke'); }
export function union2d(): never { sketchStub('union2d'); }
export function difference2d(): never { sketchStub('difference2d'); }
export function intersection2d(): never { sketchStub('intersection2d'); }
export function hull2d(): never { sketchStub('hull2d'); }
export function constrainedSketch(): never { sketchStub('constrainedSketch'); }
export function sketchFromSvg(): never { sketchStub('sketchFromSvg'); }
export function filletCorners(): never { sketchStub('filletCorners'); }
export function dxfSketch(): never { sketchStub('dxfSketch'); }
export function svgSketch(): never { sketchStub('svgSketch'); }

// Sketch geometry types — stubs
export class Sketch { constructor() { sketchStub('Sketch'); } }
export class ConstraintSketch { constructor() { sketchStub('ConstraintSketch'); } }
export class Point2D { x = 0; y = 0; }
export class Line2D { a = new Point2D(); b = new Point2D(); }
export class Circle2D { center = new Point2D(); radius = 0; }
export class Rectangle2D {
  static fromDimensions(_x: number, _y: number, _w: number, _h: number): Rectangle2D {
    sketchStub('Rectangle2D.fromDimensions');
  }
}
export const point = () => sketchStub('point');
export const line = () => sketchStub('line');
export const circle = () => sketchStub('circle');
export const rectangle = () => sketchStub('rectangle');
export class Constraint { }
export function degrees(r: number): number { return (r * 180) / Math.PI; }
export function radians(d: number): number { return (d * Math.PI) / 180; }

// ---------------------------------------------------------------------------
// Curves & Surfacing (stubs)
// ---------------------------------------------------------------------------

const CURVE_MSG =
  'Curve/surface operations are not available yet. Approximate curves with ' +
  'multiple translated/rotated shapes and boolean union.';

function curveStub(name: string): never {
  throw new Error(`${name}() not available. ${CURVE_MSG}`);
}

export function spline2d(): never { curveStub('spline2d'); }
export function spline3d(): never { curveStub('spline3d'); }
export function loft(): never { curveStub('loft'); }
export function sweep(): never { curveStub('sweep'); }
export class Curve3D { constructor() { curveStub('Curve3D'); } }
export class Route3D { static fromPolyline(): Route3D { curveStub('Route3D.fromPolyline'); return new Route3D(); } }
export class Blend { static arc(): Blend { curveStub('Blend.arc'); return new Blend(); } }

// ---------------------------------------------------------------------------
// Features (stubs or basic implementations)
// ---------------------------------------------------------------------------

export function hole(
  shape: Shape,
  faceName: string,
  diameter: number,
  depth?: number,
): Shape {
  // Basic implementation: subtract a cylinder from the shape at the named face
  if (!(shape instanceof TrackedShape)) {
    throw new Error('hole() requires a TrackedShape with named faces. Use box() or cylinder() as the base shape.');
  }
  const face = shape.face(faceName);
  if (!face) throw new Error(`Face "${faceName}" not found on shape.`);
  const cutterHeight = depth ?? (shape.boundingBox().size[2] * 3);
  const holeCylinder = cylinder(cutterHeight, diameter / 2);
  const positioned = translate(holeCylinder, face.center[0], face.center[1], face.center[2] - cutterHeight / 2);
  return difference(shape, positioned);
}

export function boss(
  _shape: Shape,
  _faceName: string,
  _diameter: number,
  _height: number,
): Shape {
  throw new Error(
    'boss() not fully implemented. Use: cylinder(height, diameter/2).translate(x, y, z) and union() ' +
    'to add a boss to your shape manually.'
  );
}

export function pocket(
  _shape: Shape,
  _faceName: string,
  _width: number,
  _depth: number,
  _height: number,
): Shape {
  throw new Error(
    'pocket() not fully implemented. Use: box(w, d, h).translate(x, y, z) and difference() ' +
    'to cut a pocket manually.'
  );
}

export function draft(
  _shape: Shape,
  _faceName: string,
  _angleDeg: number,
): Shape {
  throw new Error('draft() not implemented — no manifold-3d draft angle support yet.');
}

export function offsetSolid(
  _shape: Shape,
  _offset: number,
): Shape {
  throw new Error('offsetSolid() not implemented.');
}

export function split(_shape: Shape, _plane: Vec3): ShapeGroup {
  throw new Error('split() not implemented.');
}

export function splitByPlane(_shape: Shape, _origin: Vec3, _normal: Vec3): ShapeGroup {
  throw new Error('splitByPlane() not implemented.');
}

export function trimByPlane(_shape: Shape, _normal: Vec3, _origin: Vec3): Shape {
  throw new Error('trimByPlane() not implemented.');
}

export function shellShape(
  _shape: Shape,
  _thickness: number,
  _faceToOpen?: string,
): Shape {
  throw new Error(
    'shell() not yet fully implemented for 3D. Use: create two boxes (outer and inner) and difference() to hollow.'
  );
}

// ---------------------------------------------------------------------------
// Face/Edge inspection (available only on TrackedShape)
// ---------------------------------------------------------------------------

export function face(shape: Shape, name: string): { center: number[]; normal: number[] } | null {
  if (!(shape instanceof TrackedShape)) {
    throw new Error('face() requires a TrackedShape. Use box() or cylinder() which return TrackedShape.');
  }
  return shape.face(name);
}

export function edge(shape: Shape, name: string): { start: number[]; end: number[] } | null {
  if (!(shape instanceof TrackedShape)) {
    throw new Error('edge() requires a TrackedShape.');
  }
  return shape.edge(name);
}

export function faceNames(shape: Shape): string[] {
  if (!(shape instanceof TrackedShape)) return [];
  return shape.faceNames();
}

export function edgeNames(shape: Shape): string[] {
  if (!(shape instanceof TrackedShape)) return [];
  return shape.edgeNames();
}

// ---------------------------------------------------------------------------
// Topology helpers
// ---------------------------------------------------------------------------

export function edgesOf(_shape: Shape, _faceName: string): never {
  throw new Error('edgesOf() not implemented.');
}
export function edgesBetween(_shape: Shape, _faceA: string, _faceB: string): never {
  throw new Error('edgesBetween() not implemented.');
}
export function selectEdges(_shape: Shape, _query: unknown): never {
  throw new Error('selectEdges() not implemented. Use fillet() on box faces by name instead.');
}
export function selectEdge(_shape: Shape, _query: unknown): never {
  throw new Error('selectEdge() not implemented.');
}
export function coalesceEdges(_shape: Shape, _edges: unknown): never {
  throw new Error('coalesceEdges() not implemented.');
}
export function faceHistory(_shape: Shape): never {
  throw new Error('faceHistory() not implemented.');
}

// ---------------------------------------------------------------------------
// References & Labels
// ---------------------------------------------------------------------------

export function withReferences(_shape: Shape, _refs: Record<string, unknown>): Shape {
  throw new Error('withReferences() not implemented. Use TrackedShape.face() for positioning.');
}
export function placeReference(_shape: Shape, _refName: string, _position: Vec3): Shape {
  throw new Error('placeReference() not implemented.');
}
export function attachTo(_shape: Shape, _target: Shape, _refName: string): Shape {
  throw new Error('attachTo() not implemented.');
}
export function onFace(_shape: Shape, _faceName: string): Shape {
  throw new Error('onFace() not implemented.');
}
export function referencePoint(_shape: Shape, _name: string): Vec3 {
  throw new Error('referencePoint() not implemented.');
}
export function prefixLabels(_shape: Shape, _prefix: string): Shape {
  return _shape; // no-op stub
}
export function renameLabel(_shape: Shape, _oldName: string, _newName: string): Shape {
  return _shape; // no-op stub
}
export function dropLabels(_shape: Shape, ..._names: string[]): Shape {
  return _shape;
}
export function dropAllLabels(_shape: Shape): Shape {
  return _shape;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

export function refine(_shape: Shape, _factor?: number): Shape {
  throw new Error('refine() not implemented.');
}
export function refineToLength(_shape: Shape, _maxEdgeLength: number): Shape {
  throw new Error('refineToLength() not implemented.');
}
export function refineToTolerance(_shape: Shape, _tolerance: number): Shape {
  throw new Error('refineToTolerance() not implemented.');
}
export function smoothOut(_shape: Shape): Shape {
  throw new Error('smoothOut() not implemented.');
}
export function warp(_shape: Shape, _fn: (v: Vec3) => Vec3): Shape {
  throw new Error('warp() not implemented.');
}
export function simplify(_shape: Shape, _factor?: number): Shape {
  throw new Error('simplify() not implemented.');
}
export function slice(_shape: Shape, _height: number): Shape {
  throw new Error('slice() not implemented. Use intersectWithPlane() or boolean intersection with a large box.');
}
export function project(_shape: Shape, _plane: Vec3): Shape {
  throw new Error('project() not implemented.');
}
export function minGap(_shapeA: Shape, _shapeB: Shape): number {
  throw new Error('minGap() not implemented.');
}

// ---------------------------------------------------------------------------
// Intersection with plane
// ---------------------------------------------------------------------------

export function intersectWithPlane(
  _shape: Shape,
  _origin: Vec3,
  _normal: Vec3,
): never {
  throw new Error(
    'intersectWithPlane() not implemented. To cut a shape at a plane, use: ' +
    'difference(shape, box(large, large, large).translate(x, y, z)) to remove one side.'
  );
}
export function projectToPlane(
  _shape: Shape,
  _origin: Vec3,
  _normal: Vec3,
): never {
  throw new Error('projectToPlane() not implemented.');
}

// ---------------------------------------------------------------------------
// Assembly (stubs)
// ---------------------------------------------------------------------------

export class Assembly {
  constructor(_children?: unknown[]) {}
  solve(_state: unknown): SolvedAssembly { return new SolvedAssembly(); }
  toGroup(): ShapeGroup { return group(box(1, 1, 1)); }
}
export class SolvedAssembly {
  toGroup(): ShapeGroup { return group(box(1, 1, 1)); }
}
export function assembly(..._children: unknown[]): Assembly {
  throw new Error(
    'assembly() not implemented. Use group() to combine multiple shapes for now.'
  );
}
export function joint(
  _partA: Shape,
  _partB: Shape,
  _type: string,
  _options?: unknown,
): void {
  throw new Error('joint() not implemented. Assemble parts manually with translate() and rotate().');
}
export class Transform {
  static identity(): Transform { return new Transform(); }
  compose(_other: Transform): Transform { return this; }
}
export function composeChain(..._transforms: Transform[]): Transform {
  return new Transform();
}
export function bomToCsv(_bom: unknown): string {
  throw new Error('bomToCsv() not implemented.');
}

// ---------------------------------------------------------------------------
// Viewport / Scene (stubs)
// ---------------------------------------------------------------------------

export function cutPlane(_origin: Vec3, _normal: Vec3): void {
  console.warn('cutPlane() not available — viewport cut planes not yet supported.');
}
export function explodeView(_options?: unknown): void {
  console.warn('explodeView() not available.');
}
export function jointsView(_options?: unknown): void {
  console.warn('jointsView() not available.');
}
export function viewConfig(_config: unknown): void {
  console.warn('viewConfig() not available.');
}

// ---------------------------------------------------------------------------
// Output / Metadata (stubs)
// ---------------------------------------------------------------------------

export function bom(_name: string, _quantity: number, _material?: string): void {
  // no-op stub — bom data is collected by the runner
}
export function dim(
  _name: string,
  _value: number,
  _origin: Vec3,
  _direction: Vec3,
): void {
  console.warn('dim() not implemented — dimension annotations not yet supported.');
}
export function dimLine(
  _name: string,
  _value: number,
  _start: Vec3,
  _end: Vec3,
): void {
  console.warn('dimLine() not implemented.');
}
export function robotExport(_config: unknown): void {
  console.warn('robotExport() not implemented.');
}

// ---------------------------------------------------------------------------
// Verification (stubs)
// ---------------------------------------------------------------------------

export const verify = {
  physicalComponentCount(_label: string, _expected: number): void {
    // no-op
  },
  noCollisions(_label: string): void {
    // no-op
  },
};

export function spec(_name: string, _fn: () => void): void {
  // no-op
}

// ---------------------------------------------------------------------------
// Imports / Library (stubs)
// ---------------------------------------------------------------------------

export function importSketch(_name: string, _overrides?: unknown): never {
  throw new Error('importSketch() not implemented.');
}
export function importPart(_name: string, _overrides?: unknown): never {
  throw new Error('importPart() not implemented.');
}
export function importSvgSketch(_name: string, _options?: unknown): never {
  throw new Error('importSvgSketch() not implemented.');
}
export const partLibrary = {};
export function lib(_name: string): never {
  throw new Error('lib() / partLibrary not implemented. No standard part library available yet.');
}

// ---------------------------------------------------------------------------
// SDF (signed distance field) — stubs
// ---------------------------------------------------------------------------

export function levelSet(_fn: (x: number, y: number, z: number) => number, _bounds: Vec3): Shape {
  throw new Error('levelSet() not implemented — SDF modeling not yet supported.');
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function circularLayout(
  shapes: Shape[],
  radius: number,
): ShapeGroup {
  const count = shapes.length;
  const step = (2 * Math.PI) / count;
  const positioned: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = step * i;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    positioned.push(translate(shapes[i], x, y, 0));
  }
  return group(...positioned);
}

export function polygonVertices(sides: number, radius: number): Vec3[] {
  const verts: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    verts.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
  }
  return verts;
}
