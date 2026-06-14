/**
 * Sketch — Immutable 2D cross-section wrapper over manifold-3d CrossSection.
 *
 * Every operation returns a new Sketch instance (no mutation).
 * Primitives create CrossSections via manifold-3d's native constructors or
 * polygon approximation, then wrap them in a Sketch.
 *
 * 2D booleans delegate to CrossSection.add/subtract/intersect.
 * extrude/revolve delegate to CrossSection instance methods, returning Shape.
 */

import { Shape } from './shape';
import { getManifold } from './engine';

// ---------------------------------------------------------------------------
// Vec2 type
// ---------------------------------------------------------------------------

export type Vec2 = [number, number];

// ---------------------------------------------------------------------------
// Sketch class
// ---------------------------------------------------------------------------

export class Sketch {
  /** Internal manifold-3d CrossSection object. */
  readonly crossSection: unknown;
  /** Display color as CSS hex string. */
  readonly color: string;

  constructor(crossSection: unknown, color: string = '#cccccc') {
    this.crossSection = crossSection;
    this.color = color;
  }

  /** Access the underlying CrossSection for low-level operations. */
  getCrossSection(): unknown {
    return this.crossSection;
  }

  // -----------------------------------------------------------------------
  // Properties (delegate to CrossSection)
  // -----------------------------------------------------------------------

  /** Area of the 2D cross-section. */
  area(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.crossSection as any).area();
  }

  /** Axis-aligned bounding box of the 2D cross-section. */
  bounds(): { min: Vec2; max: Vec2 } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = (this.crossSection as any).bounds();
    return {
      min: [bb.min[0], bb.min[1]] as Vec2,
      max: [bb.max[0], bb.max[1]] as Vec2,
    };
  }

  /** Number of vertices in the cross-section. */
  numVert(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.crossSection as any).numVert();
  }

  /** Check if the cross-section is empty. */
  isEmpty(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.crossSection as any).isEmpty();
  }

  // -----------------------------------------------------------------------
  // 2D Boolean operations (return new Sketch)
  // -----------------------------------------------------------------------

  /** Union this sketch with another. Returns a new Sketch. */
  union2d(other: Sketch): Sketch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (this.crossSection as any).add(other.crossSection);
    return new Sketch(result, this.color);
  }

  /** Subtract another sketch from this one. Returns a new Sketch. */
  difference2d(other: Sketch): Sketch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (this.crossSection as any).subtract(other.crossSection);
    return new Sketch(result, this.color);
  }

  /** Intersect this sketch with another. Returns a new Sketch. */
  intersection2d(other: Sketch): Sketch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (this.crossSection as any).intersect(other.crossSection);
    return new Sketch(result, this.color);
  }

  /** Convex hull of this sketch and another. Returns a new Sketch. */
  hull2d(other: Sketch): Sketch {
    // CrossSection.hull() is available in manifold-3d v3.x
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = this.crossSection as any;
    if (typeof cs.hull === 'function') {
      const result = cs.add(other.crossSection).hull();
      return new Sketch(result, this.color);
    }
    // Fallback: union is not a convex hull but is the closest approximation
    const result = cs.add(other.crossSection);
    return new Sketch(result, this.color);
  }

  /** Offset (expand or shrink) the cross-section by delta. */
  offset(delta: number): Sketch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (this.crossSection as any).offset(delta);
    return new Sketch(result, this.color);
  }

  /** Fillet (round) all sharp corners with the given radius. */
  filletCorners(radius: number): Sketch {
    // manifold-3d CrossSection doesn't have a direct fillet method.
    // Approximate: offset out then offset in, which rounds sharp corners.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = this.crossSection as any;
    if (typeof cs.fillet === 'function') {
      return new Sketch(cs.fillet(radius), this.color);
    }
    // Fallback: use offset out + offset in to approximate filleting
    const expanded = cs.offset(radius);
    const shrunk = expanded.offset(-radius);
    return new Sketch(shrunk, this.color);
  }

  // -----------------------------------------------------------------------
  // 2D → 3D operations (return Shape)
  // -----------------------------------------------------------------------

  /** Extrude the sketch along the Z axis by height. Returns a Shape. */
  extrude(height: number, divisions?: number): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifold = (this.crossSection as any).extrude(height, divisions);
    return new Shape(manifold, this.color);
  }

  /** Revolve the sketch around the Z axis. Returns a Shape. */
  revolve(segments?: number): Shape {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = this.crossSection as any;
    const segs = segments ?? 64;
    // manifold-3d v3.x CrossSection.revolve(circularSegments, revolveSegments)
    // defaults to revolving around Z axis
    const manifold = cs.revolve(segs);
    return new Shape(manifold, this.color);
  }

  // -----------------------------------------------------------------------
  // Appearance
  // -----------------------------------------------------------------------

  /** Set display color. Returns a new Sketch with the color applied. */
  setColor(hex: string): Sketch {
    return new Sketch(this.crossSection, hex);
  }
}



// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Create a rectangular sketch. Center=true centers at origin. */
export function rect(width: number, height: number, center: boolean = true): Sketch {
  const m = getManifold();
  const cs = m.CrossSection.square([width, height], center);
  return new Sketch(cs);
}

/** Create a circular sketch. */
export function circle2d(radius: number, center?: boolean, segments?: number): Sketch {
  const m = getManifold();
  // CrossSection.circle(radius, circularSegments?) in manifold-3d v3.x
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cs = segments !== undefined
    ? m.CrossSection.circle(radius, segments)
    : m.CrossSection.circle(radius);
  if (center === false) {
    // Translate the cross-section so bottom-left is at origin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Sketch(cs.translate([radius, radius]), '#cccccc');
  }
  return new Sketch(cs);
}

/** Create a rounded rectangle sketch. */
export function roundedRect(
  width: number,
  height: number,
  radius: number,
  center: boolean = true,
): Sketch {
  // Clamp corner radius to half the smallest dimension
  const maxR = Math.min(width, height) / 2;
  const r = Math.min(radius, maxR);

  // Build rounded rect via polygon approximation of corners
  // Strategy: draw using manifold's CrossSection built-in if available,
  // otherwise approximate with polygon vertices.
  const m = getManifold();
  // Try native rounded rect first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof m.CrossSection.square === 'function') {
    // manifold-3d doesn't have a native rounded rect, so we build one
    // using offset-based approach: create a smaller rect, offset outward
    const innerW = Math.max(0, width - 2 * r);
    const innerH = Math.max(0, height - 2 * r);
    if (innerW === 0 && innerH === 0) {
      // It's essentially a circle
      return circle2d(r, center !== false);
    }
    const inner: unknown = m.CrossSection.square([innerW, innerH], true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rounded = (inner as any).offset(r);
    if (center === false) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Sketch((rounded as any).translate([width / 2, height / 2]));
    }
    return new Sketch(rounded);
  }

  // Polygon fallback
  const pts = generateRoundedRectPoints(width, height, r);
  return polygon(pts);
}

/** Generate vertex points for a rounded rectangle. */
function generateRoundedRectPoints(
  width: number,
  height: number,
  radius: number,
  segments: number = 8,
): Vec2[] {
  const hw = width / 2;
  const hh = height / 2;
  const r = radius;
  const points: Vec2[] = [];

  // Start at top-right corner, go clockwise
  // Top-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / segments);
    points.push([hw - r + r * Math.cos(angle), hh - r + r * Math.sin(angle)]);
  }
  // Top-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI + (Math.PI / 2) * (i / segments);
    points.push([-hw + r + r * Math.cos(angle), hh - r + r * Math.sin(angle)]);
  }
  // Bottom-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / segments);
    points.push([-hw + r + r * Math.cos(angle), -hh + r + r * Math.sin(angle)]);
  }
  // Bottom-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = 0 + (Math.PI / 2) * (i / segments);
    points.push([hw - r + r * Math.cos(angle), -hh + r + r * Math.sin(angle)]);
  }

  return points;
}

/** Create a polygon sketch from an array of 2D points. */
export function polygon(points: Vec2[]): Sketch {
  const m = getManifold();
  // CrossSection.ofPolygons expects an array of polygon arrays
  const cs = m.CrossSection.ofPolygons([points.map(p => [p[0], p[1]])]);
  return new Sketch(cs);
}

/** Create a regular polygon (ngon) sketch. */
export function ngon(sides: number, radius: number, center: boolean = true): Sketch {
  if (sides < 3) throw new Error('ngon requires at least 3 sides');
  const points: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  const sketch = polygon(points);
  if (!center) {
    // Translate so bottom-left corner is near origin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Sketch((sketch.crossSection as any).translate([radius, radius]));
  }
  return sketch;
}

/** Create an ellipse sketch. */
export function ellipse(rx: number, ry: number, center: boolean = true): Sketch {
  const segments = 64;
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push([rx * Math.cos(angle), ry * Math.sin(angle)]);
  }
  const sketch = polygon(points);
  if (!center) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Sketch((sketch.crossSection as any).translate([rx, ry]));
  }
  return sketch;
}

/** Create a slot (stadium/racetrack) sketch — rectangle with semicircle ends. */
export function slot(length: number, radius: number, center: boolean = true): Sketch {
  // A slot is: rect(length - 2*radius, 2*radius) union circle2d(radius) at each end
  const straightLength = length - 2 * radius;
  if (straightLength <= 0) {
    // Slot degenerates to a circle
    return circle2d(radius, center);
  }

  const m = getManifold();
  const rectCs = m.CrossSection.square([straightLength, 2 * radius], true);
  const circLeft = m.CrossSection.circle(radius).translate([-straightLength / 2, 0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circRight = m.CrossSection.circle(radius).translate([straightLength / 2, 0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = rectCs.add(circLeft).add(circRight);

  if (!center) {
    const halfLen = length / 2;
    const halfH = radius;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Sketch((result as any).translate([halfLen, halfH]));
  }
  return new Sketch(result);
}

/** Create a star sketch. */
export function star(
  outerRadius: number,
  innerRadius: number,
  points: number,
  center: boolean = true,
): Sketch {
  if (points < 2) throw new Error('star requires at least 2 points');
  const pts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  const sketch = polygon(pts);
  if (!center) {
    // Translate so bottom-left corner is near origin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Sketch((sketch.crossSection as any).translate([outerRadius, outerRadius]));
  }
  return sketch;
}

// ---------------------------------------------------------------------------
// Standalone 2D boolean free functions
// ---------------------------------------------------------------------------

/** Union two sketches. Standalone free function for convenience. */
export function union2d(a: Sketch, b: Sketch): Sketch {
  return a.union2d(b);
}

/** Subtract sketch b from sketch a. */
export function difference2d(a: Sketch, b: Sketch): Sketch {
  return a.difference2d(b);
}

/** Intersect two sketches. */
export function intersection2d(a: Sketch, b: Sketch): Sketch {
  return a.intersection2d(b);
}

/** Convex hull of two sketches. */
export function hull2d(a: Sketch, b: Sketch): Sketch {
  return a.hull2d(b);
}

/** Offset a sketch by delta. Standalone free function. */
export function offset(sketch: Sketch, delta: number): Sketch {
  return sketch.offset(delta);
}

/** Fillet corners of a sketch. Standalone free function. */
export function filletCorners(sketch: Sketch, radius: number): Sketch {
  return sketch.filletCorners(radius);
}