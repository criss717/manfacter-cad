/**
 * Primitive shape constructors.
 *
 * Every function returns an immutable Shape wrapping a manifold-3d solid.
 * The engine must be initialized via `initEngine()` before calling these.
 */

import type { Shape, ShapeMaterialProps, ParamDef } from './types';
import { getManifold, buildShapeFromManifold } from './engine';

/**
 * Create a rectangular box (cuboid).
 *
 * @param width  X dimension (mm)
 * @param height Y dimension (mm)
 * @param depth  Z dimension (mm)
 * @param center If true the box is centered at the origin; otherwise it sits
 *               in the first octant touching the origin.
 */
export function box(
  width: number,
  height: number,
  depth: number,
  center: boolean = false,
  color?: string,
  material?: ShapeMaterialProps,
  params?: ParamDef[]
): Shape {
  validatePositive(width, 'width');
  validatePositive(height, 'height');
  validatePositive(depth, 'depth');

  const m = getManifold();
  const manifold = m.Manifold.cube([width, height, depth], center);
  return buildShapeFromManifold(manifold, color, material, params);
}

/**
 * Create a cylinder (or cone if radiusHigh is 0).
 *
 * @param height         Z extent (mm)
 * @param radius         Bottom radius (mm)
 * @param segments       Circular segments (default: auto from radius)
 * @param center         Center on Z-axis
 * @param radiusHigh     Top radius — 0 makes a cone (default: same as radius)
 */
export function cylinder(
  height: number,
  radius: number,
  segments?: number,
  center: boolean = false,
  radiusHigh?: number,
  color?: string,
  material?: ShapeMaterialProps,
  params?: ParamDef[]
): Shape {
  validatePositive(height, 'height');
  validatePositive(radius, 'radius');

  const m = getManifold();
  const manifold = m.Manifold.cylinder(
    height,
    radius,
    radiusHigh ?? radius,
    segments,
    center
  );
  return buildShapeFromManifold(manifold, color, material, params);
}

/**
 * Create a geodesic sphere.
 *
 * @param radius   Sphere radius (mm) — must be positive
 * @param segments Circular segments (default: auto)
 */
export function sphere(
  radius: number,
  segments?: number,
  color?: string,
  material?: ShapeMaterialProps,
  params?: ParamDef[]
): Shape {
  validatePositive(radius, 'radius');

  const m = getManifold();
  const manifold = m.Manifold.sphere(radius, segments);
  return buildShapeFromManifold(manifold, color, material, params);
}

/**
 * Create a torus by revolving a circle.
 *
 * @param majorRadius  Distance from the center of the torus to the center of
 *                     the tube (mm)
 * @param minorRadius  Radius of the tube (mm)
 * @param majorSegments Segments around the major circle (default: auto)
 * @param minorSegments Segments around the minor circle (default: auto)
 */
export function torus(
  majorRadius: number,
  minorRadius: number,
  majorSegments?: number,
  minorSegments?: number,
  color?: string,
  material?: ShapeMaterialProps,
  params?: ParamDef[]
): Shape {
  validatePositive(majorRadius, 'majorRadius');
  validatePositive(minorRadius, 'minorRadius');

  const m = getManifold();

  // manifold-3d doesn't have a built-in torus constructor.
  // Build one by revolving a circle cross-section.
  const cs = m.CrossSection.circle(minorRadius, minorSegments);
  const manifold = cs.revolve(majorSegments);

  // The revolve creates a torus centered at origin with majorRadius.
  // Translate so the center of the tube ring sits at z = 0.
  // Actually revolve around Y-axis, so we need to rotate to Z-up and position.
  // CrossSection is in XY plane, revolve around Y → result is in XZ plane.
  // Rotate -90° around X to make it Z-up (standard CAD orientation).
  const oriented = manifold.rotate([-90, 0, 0]);

  return buildShapeFromManifold(oriented, color, material, params);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePositive(value: number, name: string): void {
  if (value <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
}
