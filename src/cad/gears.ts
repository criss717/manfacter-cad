/**
 * Gear generation using involute profiles and manifold-3d CrossSection.
 *
 * API matches ForgeCAD conventions:
 *   gear(module, teeth, faceWidth, pressureAngle?) → Shape
 *   internalGear(module, teeth, faceWidth, pressureAngle?) → Shape
 *   helicalGear(module, teeth, faceWidth, helixAngle?) → Shape (stub)
 */

import { Shape } from './shape';
import { cylinder } from './primitives';
import { difference, union } from './booleans';
import { translate, rotate } from './transforms';
import { getManifold } from './engine';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateGearParams(mod: number, teeth: number, faceWidth: number, pressureAngle: number): void {
  if (mod <= 0) throw new Error('module must be > 0');
  if (teeth < 8) throw new Error(`teeth must be ≥ 8, got ${teeth}`);
  if (faceWidth <= 0) throw new Error('faceWidth must be > 0');
  if (pressureAngle < 14.5 || pressureAngle > 30) {
    throw new Error(`pressureAngle must be between 14.5° and 30°, got ${pressureAngle}°`);
  }
}

// ---------------------------------------------------------------------------
// Involute math
// ---------------------------------------------------------------------------

/**
 * Generate involute curve points for one tooth flank.
 *
 * Returns [x, y] points along the involute of the base circle,
 * from the base circle radius to the outer (tip) radius.
 *
 * The involute of a circle at parameter t:
 *   x = r * (cos(t) + t * sin(t))
 *   y = r * (sin(t) - t * cos(t))
 */
function involutePoints(
  baseRadius: number,
  outerRadius: number,
  numPoints: number,
): [number, number][] {
  const tMax = Math.sqrt(Math.max(0, (outerRadius * outerRadius) / (baseRadius * baseRadius) - 1));
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = (tMax * i) / numPoints;
    const x = baseRadius * (Math.cos(t) + t * Math.sin(t));
    const y = baseRadius * (Math.sin(t) - t * Math.cos(t));
    points.push([x, y]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Gear generation
// ---------------------------------------------------------------------------

/**
 * Create a spur gear with involute tooth profile.
 *
 * @param mod            Module in mm (pitchDiameter = module × teeth)
 * @param teeth          Number of teeth (≥ 8)
 * @param faceWidth      Width of the gear face (mm)
 * @param pressureAngle  Pressure angle in degrees (default: 20°, range: 14.5°–30°)
 * @returns Shape representing the complete gear
 */
export function gear(
  mod: number,
  teeth: number,
  faceWidth: number,
  pressureAngle: number = 20,
): Shape {
  validateGearParams(mod, teeth, faceWidth, pressureAngle);

  const pitchRadius = (mod * teeth) / 2;
  const addendum = mod;
  const dedendum = 1.25 * mod;
  const outerRadius = pitchRadius + addendum;
  const rootRadius = pitchRadius - dedendum;

  const paRad = (pressureAngle * Math.PI) / 180;
  const baseRadius = pitchRadius * Math.cos(paRad);
  const flankPoints = 12;

  // Involute angle at pitch circle
  const invAtPitch = Math.sqrt(pitchRadius * pitchRadius - baseRadius * baseRadius) / baseRadius
    - Math.acos(baseRadius / pitchRadius);
  // Involute angle at tip (outer radius)
  const invAtTip = Math.sqrt(outerRadius * outerRadius - baseRadius * baseRadius) / baseRadius
    - Math.acos(baseRadius / outerRadius);

  // Half-tooth thickness angle at pitch circle
  // Standard: tooth thickness at pitch = π * mod / 2
  const halfToothAngle = (Math.PI * mod / 2) / (2 * pitchRadius);
  // rotOffset aligns the involute so the tooth is symmetric about θ=0
  const rotOffset = halfToothAngle - invAtPitch;

  // ---- Build single tooth polygon ----
  const toothPolygon: [number, number][] = [];

  // Root arc from -rotOffset to right flank start angle
  // Start: root point at angle -rotOffset (radial line)
  const rootStartAngle = -rotOffset;
  toothPolygon.push([rootRadius * Math.cos(rootStartAngle), rootRadius * Math.sin(rootStartAngle)]);

  // Right flank: involute from base radius (or root) to outer radius
  for (let i = 0; i <= flankPoints; i++) {
    const r = Math.max(rootRadius, baseRadius) + (outerRadius - Math.max(rootRadius, baseRadius)) * i / flankPoints;
    if (r <= baseRadius) {
      // Below base circle: radial line
      const angle = -rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    } else {
      const invAngle = Math.sqrt(r * r - baseRadius * baseRadius) / baseRadius
        - Math.acos(baseRadius / r);
      const angle = invAngle - rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
  }

  // Tip arc: from right tip to left tip
  // Right tip angle = invAtTip - rotOffset
  // Left tip angle = -(invAtTip - rotOffset)
  const rightTipAngle = invAtTip - rotOffset;
  const leftTipAngle = -(invAtTip - rotOffset);
  const tipArcPts = 3;
  for (let i = 1; i <= tipArcPts; i++) {
    const a = rightTipAngle + (leftTipAngle - rightTipAngle) * i / (tipArcPts + 1);
    toothPolygon.push([outerRadius * Math.cos(a), outerRadius * Math.sin(a)]);
  }

  // Left flank: involute mirrored (from tip back to root)
  for (let i = flankPoints; i >= 0; i--) {
    const r = Math.max(rootRadius, baseRadius) + (outerRadius - Math.max(rootRadius, baseRadius)) * i / flankPoints;
    if (r <= baseRadius) {
      const angle = rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    } else {
      const invAngle = Math.sqrt(r * r - baseRadius * baseRadius) / baseRadius
        - Math.acos(baseRadius / r);
      const angle = -(invAngle - rotOffset);
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
  }

  // Root arc: from left flank bottom back to start angle
  // Left root angle = +rotOffset
  const leftRootAngle = rotOffset;
  const rootArcPts = 3;
  // Arc from leftRootAngle back to rootStartAngle (going clockwise around root)
  for (let i = 1; i <= rootArcPts; i++) {
    const a = leftRootAngle + (rootStartAngle - leftRootAngle) * i / (rootArcPts + 1);
    // Keep angle in [-π, π] range approximately
    toothPolygon.push([rootRadius * Math.cos(a), rootRadius * Math.sin(a)]);
  }

  // Close polygon
  toothPolygon.push(toothPolygon[0]);

  // Create one tooth as CrossSection → extrude
  const m = getManifold();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSection = (m as any).CrossSection.ofPolygons([toothPolygon]) as { extrude: (h: number) => any };
  const toothManifold = crossSection.extrude(faceWidth);
  const toothShape = new Shape(toothManifold);

  // Circular pattern for all teeth
  const angleStep = 360 / teeth;
  const allTeeth: Shape[] = [];
  for (let i = 0; i < teeth; i++) {
    allTeeth.push(rotate(toothShape, [0, 0, 1], angleStep * i));
  }

  // Create root cylinder and union with teeth
  const rootCyl = cylinder(faceWidth, rootRadius + 0.01);
  const gearBody = union(rootCyl, ...allTeeth);

  // Central bore (standard: ~1/3 of pitch diameter)
  const boreRadius = Math.max(0.5, pitchRadius * 0.25);
  const bore = cylinder(faceWidth + 2, boreRadius);
  return difference(gearBody, translate(bore, 0, 0, -1));
}

/**
 * Create an internal (ring) gear with involute tooth profile.
 *
 * Teeth point INWARD toward the center.
 *
 * @param mod            Module in mm
 * @param teeth          Number of teeth (≥ 8)
 * @param faceWidth      Width of the gear face (mm)
 * @param pressureAngle  Pressure angle in degrees (default: 20°)
 * @returns Shape representing the ring gear
 */
export function internalGear(
  mod: number,
  teeth: number,
  faceWidth: number,
  pressureAngle: number = 20,
): Shape {
  validateGearParams(mod, teeth, faceWidth, pressureAngle);

  const pitchRadius = (mod * teeth) / 2;
  const addendum = mod;
  const dedendum = 1.25 * mod;
  const outerRadius = pitchRadius + dedendum + mod * 2;

  const paRad = (pressureAngle * Math.PI) / 180;
  const baseRadius = pitchRadius * Math.cos(paRad);
  const outerR = pitchRadius - addendum;  // tip radius (inward)
  const rootR = pitchRadius + dedendum;   // root radius (outward)
  const flankPoints = 12;

  // Involute angles
  const invAtPitch = Math.sqrt(pitchRadius * pitchRadius - baseRadius * baseRadius) / baseRadius
    - Math.acos(baseRadius / pitchRadius);
  const invAtTip = Math.sqrt(Math.max(0, outerR * outerR - baseRadius * baseRadius)) / baseRadius
    - Math.acos(baseRadius / Math.max(outerR, baseRadius + 0.001));
  const halfToothAngle = (Math.PI * mod / 2) / (2 * pitchRadius);
  const rotOffset = halfToothAngle - invAtPitch;

  // Build inward-pointing tooth profile
  // For internal gear: involute profile mirrored inward
  const toothPolygon: [number, number][] = [];

  // Root point at outer edge (at angle -rotOffset)
  toothPolygon.push([rootR * Math.cos(-rotOffset), rootR * Math.sin(-rotOffset)]);

  // Right flank: involute going inward from root to tip
  for (let i = 0; i <= flankPoints; i++) {
    const r = rootR - (rootR - outerR) * i / flankPoints;
    if (r <= baseRadius) {
      const angle = -rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    } else {
      const invAngle = Math.sqrt(r * r - baseRadius * baseRadius) / baseRadius
        - Math.acos(baseRadius / r);
      // Internal gear: involute goes inward, so we negate the pressure angle effect
      const angle = -(invAngle - rotOffset);
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
  }

  // Tip arc at inner radius (pitch - addendum)
  const tipRightAngle = -(invAtTip - rotOffset);
  const tipLeftAngle = (invAtTip - rotOffset);
  const tipArcPts = 3;
  for (let i = 1; i <= tipArcPts; i++) {
    const a = tipRightAngle + (tipLeftAngle - tipRightAngle) * i / (tipArcPts + 1);
    toothPolygon.push([outerR * Math.cos(a), outerR * Math.sin(a)]);
  }

  // Left flank: going from tip back outward to root
  for (let i = flankPoints; i >= 0; i--) {
    const r = rootR - (rootR - outerR) * i / flankPoints;
    if (r <= baseRadius) {
      const angle = rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    } else {
      const invAngle = Math.sqrt(r * r - baseRadius * baseRadius) / baseRadius
        - Math.acos(baseRadius / r);
      const angle = invAngle - rotOffset;
      toothPolygon.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
  }

  // Root arc closing back to start
  const rootEndAngle = rotOffset;
  for (let i = 1; i <= 3; i++) {
    const a = rootEndAngle + (-rotOffset - rootEndAngle) * i / 4;
    toothPolygon.push([rootR * Math.cos(a), rootR * Math.sin(a)]);
  }

  // Close polygon
  toothPolygon.push(toothPolygon[0]);

  // Create tooth and subtract from ring body
  const m = getManifold();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cs = (m as any).CrossSection.ofPolygons([toothPolygon]) as { extrude: (h: number) => any };
  const toothManifold = cs.extrude(faceWidth + 2);
  const toothShape = new Shape(toothManifold);

  // Create outer ring
  const ring = cylinder(faceWidth, outerRadius);
  const innerBore = cylinder(faceWidth + 2, rootR);
  let ringBody = difference(ring, translate(innerBore, 0, 0, -1));

  // Pattern tooth cutters around the ring and subtract each
  const angleStep = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const angle = angleStep * i;
    const cutter = translate(rotate(toothShape, [0, 0, 1], angle), 0, 0, -1);
    try {
      ringBody = difference(ringBody, cutter);
    } catch {
      console.warn(`internalGear: boolean difference failed for tooth ${i}, skipping`);
    }
  }

  return ringBody;
}

/**
 * Helical gear — NOT YET IMPLEMENTED.
 *
 * Returns a spur gear with a warning. Helical teeth require
 * sweep/loft operations not yet available.
 */
export function helicalGear(
  mod: number,
  teeth: number,
  faceWidth: number,
  _helixAngle: number = 30,
  pressureAngle: number = 20,
): Shape {
  console.warn('helicalGear() is not yet implemented — returning a spur gear as fallback. Helical teeth require sweep/loft operations.');
  return gear(mod, teeth, faceWidth, pressureAngle);
}