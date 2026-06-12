/**
 * Core TypeScript interfaces for the ForgeCAD engine.
 * All shapes are immutable — operations return new instances.
 */

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
  type: 'number' | 'bool' | 'select';
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

/**
 * Immutable CAD shape wrapping a Manifold solid with metadata.
 * All operations return new Shape instances — never mutate in place.
 */
export interface Shape {
  /** Unique identifier for this shape. */
  readonly id: string;
  /** Underlying manifold-3d solid (opaque — access via engine helpers). */
  readonly manifold: unknown;
  /** Display color as CSS hex string (#rrggbb). */
  readonly color: string;
  /** Material properties for the renderer. */
  readonly material: ShapeMaterialProps;
  /** Original construction parameters (for parametric editing). */
  readonly params: ParamDef[];
  /** Cached bounding box (lazily computed, immutable). */
  readonly dimensions: BBox | null;
}
