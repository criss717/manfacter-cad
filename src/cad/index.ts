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
} from './types';

// Primitives
export { box, cylinder, sphere, torus } from './primitives';

// Booleans (variadic, ForgeCAD naming)
export { union, difference, intersection } from './booleans';

// Core stubs with real implementation or delegation
export { hull3d, fillet, chamfer, shell } from './stubs';

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

// ── Full ForgeCAD API surface ──────────────────────────────────────────
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
  // Sketch 2D
  rect,
  circle2d,
  roundedRect,
  polygon,
  ngon,
  ellipse,
  slot,
  star,
  path,
  stroke,
  union2d,
  difference2d,
  intersection2d,
  hull2d,
  constrainedSketch,
  sketchFromSvg,
  filletCorners,
  dxfSketch,
  svgSketch,
  Sketch,
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
  // Curves
  spline2d,
  spline3d,
  loft,
  sweep,
  Curve3D,
  Route3D,
  Blend,
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
  // SDF
  levelSet,
} from './forgecad-api';