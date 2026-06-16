/**
 * ForgeCAD — TypeScript CAD engine built on manifold-3d.
 *
 * All operations are immutable. Call `initEngine()` once before using any
 * shape constructors or boolean operations.
 */

// Engine
export { initEngine, getManifold } from './engine';

// Shape classes
export { Shape, type Vec3 } from './shape';
export { TrackedShape, ShapeGroup, group, type FaceRef, type EdgeRef } from './trackedShape';
export {
  buildRectExtrusionTopology,
  buildCircleExtrusionTopology,
} from './trackedShape';

// Types
export type {
  BBox,
  CollisionResult,
  ParamDef,
  ShapeMaterialProps,
  SnapshotAngle,
  ExportResult,
  EdgeQuery,
} from './types';

// Primitives
export { box, cylinder, sphere, torus } from './primitives';

// Booleans (variadic, ForgeCAD naming)
export { union, difference, intersection } from './booleans';

// Core stubs with real implementation or delegation
export { hull3d, fillet, chamfer, shell, roundedBox } from './stubs';

// Transforms
export { translate, rotate, scale, mirror } from './transforms';

// Inspection
export {
  getBoundingBox,
  getVolume,
  getSurfaceArea,
  getTriangleCount,
  isEmpty,
  checkCollisions,
  renderSnapshot,
} from './inspect';

// Export
export { toSTL, toGLB, toSTEP } from './export';

// Params
export { Param, collectParams, applyParams } from './params';

// Sketch 2D — real implementations (re-exported from sketch.ts)
export {
  Sketch,
  rect,
  circle2d,
  roundedRect,
  polygon,
  ngon,
  ellipse,
  slot,
  star,
  union2d,
  difference2d,
  intersection2d,
  hull2d,
  filletCorners,
} from './sketch';

export type { Vec2 } from './sketch';

// Curves — real implementations (re-exported from curves.ts)
export { Curve3D, spline3d } from './curves';
export type { Frame } from './curves';

// Surfacing — real implementations (re-exported from surfacing.ts)
export { loft, sweep } from './surfacing';

// ── Full ForgeCAD API surface (remaining items) ──────────────────────────
export {
  // Patterns (working)
  linearPattern,
  circularPattern,
  mirrorCopy,
  circularLayout,
  polygonVertices,
  // Axis rotates
  rotateX,
  rotateY,
  rotateZ,
  // Additional transforms
  moveTo,
  rotateAround,
  pointAlong,
  moveToLocal,
  // Features
  hole,
  boss,
  pocket,
  draft,
  offsetSolid,
  split,
  splitByPlane,
  trimByPlane,
  shellShape,
  // Face/Edge inspection
  face,
  edge,
  faceNames,
  edgeNames,
  // Topology
  edgesOf,
  edgesBetween,
  selectEdges,
  selectEdge,
  coalesceEdges,
  faceHistory,
  // References & Labels
  withReferences,
  placeReference,
  attachTo,
  onFace,
  referencePoint,
  prefixLabels,
  renameLabel,
  dropLabels,
  dropAllLabels,
  // Mesh helpers
  refine,
  refineToLength,
  refineToTolerance,
  smoothOut,
  warp,
  simplify,
  slice,
  project,
  minGap,
  // Plane intersection
  intersectWithPlane,
  projectToPlane,
  // Sketch 2D stubs (remaining)
  path,
  stroke,
  constrainedSketch,
  sketchFromSvg,
  dxfSketch,
  svgSketch,
  ConstraintSketch,
  Point2D,
  Line2D,
  Circle2D,
  Rectangle2D,
  point,
  line,
  circle,
  rectangle,
  Constraint,
  degrees,
  radians,
  // Curves remaining stubs
  spline2d,
  Route3D,
  Blend,
  Curve,
  // Assembly
  assembly,
  joint,
  Assembly,
  SolvedAssembly,
  Transform,
  composeChain,
  bomToCsv,
  // Viewport
  cutPlane,
  explodeView,
  jointsView,
  viewConfig,
  // Output
  bom,
  dim,
  dimLine,
  robotExport,
  // Verification
  verify,
  spec,
  // Imports / Library
  importSketch,
  importPart,
  importSvgSketch,
  partLibrary,
  lib,
  // Gears
  gear,
  internalGear,
  helicalGear,
  // SDF
  levelSet,
} from './forgecad-api';