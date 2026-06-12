/**
 * Primitive shape constructors — ForgeCAD-aligned signatures.
 *
 * Every function returns an immutable Shape (or TrackedShape for box/cylinder)
 * wrapping a manifold-3d solid.
 * The engine must be initialized via `initEngine()` before calling these.
 *
 * ForgeCAD conventions:
 *   box(x, y, z)     — centered on XY, base at Z=0
 *   cylinder(h, r)   — centered on XY, base at Z=0
 *   sphere(r)         — centered at origin
 *   torus(major, minor) — ring in XY plane, centered at origin
 */

import { Shape } from './shape';
import { TrackedShape, buildRectExtrusionTopology, buildCircleExtrusionTopology } from './trackedShape';
import { getManifold } from './engine';
import type { ShapeMaterialProps, ParamDef } from './types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePositive(value: number, name: string): void {
  if (value <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Create a rectangular box (cuboid).
 *
 * ForgeCAD signature: box(width, depth, height)
 * Centered on XY, base at Z=0.
 *   X: [-width/2, width/2]
 *   Y: [-depth/2, depth/2]
 *   Z: [0, height]
 *
 * @param width   X dimension (mm)
 * @param depth   Y dimension (mm)
 * @param height  Z dimension (mm)
 * @returns TrackedShape with faces: top, bottom, front, back, left, right
 */
export function box(
  width: number,
  depth: number,
  height: number,
): TrackedShape {
  validatePositive(width, 'width');
  validatePositive(depth, 'depth');
  validatePositive(height, 'height');

  const m = getManifold();
  // Manifold-3d cube with center=true: centered at origin in all axes.
  // Then translate up by height/2 so base is at Z=0.
  const manifold = m.Manifold.cube([width, depth, height], true)
    .translate([0, 0, height / 2]);

  const faces = buildRectExtrusionTopology(width, depth, height);
  return new TrackedShape(manifold, faces);
}

/**
 * Create a cylinder (or cone if radiusTop differs from radius).
 *
 * ForgeCAD signature: cylinder(height, radius, radiusTop?, segments?)
 * Centered on XY, base at Z=0.
 *
 * @param height      Z extent (mm)
 * @param radius      Bottom radius (mm)
 * @param radiusTop   Top radius (default: same as radius; 0 = cone)
 * @param segments    Circular segments (default: auto from radius)
 * @returns TrackedShape with faces: top, bottom, side
 */
export function cylinder(
  height: number,
  radius: number,
  radiusTop?: number,
  segments?: number,
): TrackedShape {
  validatePositive(height, 'height');
  validatePositive(radius, 'radius');

  const m = getManifold();
  const rTop = radiusTop ?? radius;
  // Manifold.cylinder(height, radiusLow, radiusHigh, circularSegments, center)
  // center=false means base at Z=0 in manifold-3d's coordinate system
  const manifold = m.Manifold.cylinder(height, radius, rTop, segments, false);

  // manifold cylinder with center=false is already at Z=0 base
  const faces = buildCircleExtrusionTopology(height);
  return new TrackedShape(manifold, faces);
}

/**
 * Create a geodesic sphere.
 *
 * ForgeCAD signature: sphere(radius, segments?)
 * Centered at origin.
 *
 * @param radius   Sphere radius (mm) — must be positive
 * @param segments Circular segments (default: auto)
 */
export function sphere(
  radius: number,
  segments?: number,
): Shape {
  validatePositive(radius, 'radius');

  const m = getManifold();
  const manifold = m.Manifold.sphere(radius, segments);
  return new Shape(manifold);
}

/**
 * Create a torus by revolving a circle.
 *
 * ForgeCAD signature: torus(majorRadius, minorRadius, segments?)
 * Centered at origin, ring in XY plane.
 *
 * @param majorRadius  Distance from center to tube center (mm)
 * @param minorRadius  Tube radius (mm)
 * @param segments     Segments around the major circle (default: auto)
 */
export function torus(
  majorRadius: number,
  minorRadius: number,
  segments?: number,
): Shape {
  validatePositive(majorRadius, 'majorRadius');
  validatePositive(minorRadius, 'minorRadius');

  const m = getManifold();

  // manifold-3d doesn't have a built-in torus constructor.
  // Build by revolving a circle cross-section.
  const cs = m.CrossSection.circle(minorRadius);
  const manifold = cs.revolve(majorRadius, segments);

  return new Shape(manifold);
}