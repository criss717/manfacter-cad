/**
 * Core TypeScript types for the ForgeCAD engine.
 * All shapes are immutable — operations return new instances.
 */

import type { Vec3 } from './shape';

/** Axis-aligned bounding box. */
export interface BBox {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

/** Result of a collision check between two shapes. */
export interface CollisionResult {
  shapeA: string;
  shapeB: string;
  overlapping: boolean;
  volume?: number;
}

/** Definition of a tunable parameter exposed to the frontend property panel. */
export interface ParamDef {
  name: string;
  type: 'number' | 'bool' | 'choice';
  defaultValue: number | boolean | string;
  options?: {
    min?: number;
    max?: number;
    step?: number;
    values?: string[];
  };
  unit?: string;
}

/** Material properties for rendering. */
export interface ShapeMaterialProps {
  metalness?: number;
  roughness?: number;
  emissive?: string;
  opacity?: number;
  wireframe?: boolean;
}

/** Face reference with center point and outward normal. */
export interface FaceRef {
  name: string;
  center: Vec3;
  normal: Vec3;
}

/** Edge reference with start and end points. */
export interface EdgeRef {
  name: string;
  start: Vec3;
  end: Vec3;
}

/** Query filter for selecting edges by geometric properties. */
export interface EdgeQuery {
  parallel?: Vec3;
  perpendicular?: Vec3;
  convex?: boolean;
  concave?: boolean;
  atZ?: number;
  minLength?: number;
  maxLength?: number;
  within?: { min: Vec3; max: Vec3 };
}

/** Canonical camera angle for snapshot rendering. */
export type SnapshotAngle =
  | 'front'
  | 'back'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'iso';

/** Result of a full model export. */
export interface ExportResult {
  modelId: string;
  bbox: BBox;
  volume: number;
  numTri: number;
  glbBuffer?: Buffer;
  stlBuffer?: Buffer;
  stepBuffer?: Buffer;
  params: ParamDef[];
}