/**
 * ForgeCAD — TypeScript CAD engine built on manifold-3d.
 *
 * All operations are immutable. Call `initEngine()` once before using any
 * shape constructors or boolean operations.
 */

// Engine
export { initEngine, getManifold, buildShapeFromManifold, cloneShape } from './engine';

// Types
export type {
  Shape,
  BBox,
  CollisionResult,
  ParamDef,
  ShapeMaterialProps,
  SnapshotAngle,
  ExportResult,
} from './types';

// Primitives
export { box, cylinder, sphere, torus } from './primitives';

// Booleans
export { union, subtract, intersect } from './booleans';

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
