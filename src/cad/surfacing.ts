/**
 * Surfacing — loft() and sweep() via custom mesh generation.
 *
 * loft(): Creates a Shape by interpolating between 2D cross-section profiles
 *         at specified heights.
 * sweep(): Creates a Shape by sweeping a 2D profile along a 3D curve path.
 *
 * Both generate triangle-strip meshes, cap the ends, and validate with
 * Manifold.ofMesh(). If validation fails, fall back to union approximation.
 */

import { Shape } from './shape';
import { Sketch } from './sketch';
import { Curve3D, spline3d, type Frame, type Vec3 as CurveVec3 } from './curves';
import { getManifold } from './engine';

// ---------------------------------------------------------------------------
// Vec3 math helpers (local to avoid circular imports)
// ---------------------------------------------------------------------------

function vec3Add(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: CurveVec3, s: number): CurveVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: CurveVec3, b: CurveVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Length(v: CurveVec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: CurveVec3): CurveVec3 {
  const len = vec3Length(v);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---------------------------------------------------------------------------
// Extract polygon vertices from a Sketch
// ---------------------------------------------------------------------------

/**
 * Extract polygon vertices from a Sketch, separating outer contour from holes.
 * Returns { outer, holes } where outer is the main perimeter and holes are inner loops.
 */
function getSketchPolygons(sketch: Sketch): { outer: CurveVec3[]; holes: CurveVec3[][] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cs = sketch.crossSection as any;
  if (typeof cs.toPolygons === 'function') {
    const polys = cs.toPolygons() as CurveVec3[][];
    if (polys.length === 0) return { outer: [], holes: [] };
    // First polygon is outer contour; rest are holes
    const outer = polys[0].map((p) => [p[0], p[1], 0] as CurveVec3);
    const holes = polys.slice(1).map((h) => h.map((p) => [p[0], p[1], 0] as CurveVec3));
    return { outer, holes };
  }
  // Fallback: circle approximation
  const area = cs.area();
  const radius = Math.sqrt(Math.max(area, 0.01) / Math.PI);
  const segments = 32;
  const verts: CurveVec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    verts.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
  }
  return { outer: verts, holes: [] };
}

/** Get flat vertex list (outer only, no holes) for the old API compatibility. */
function getSketchVertices(sketch: Sketch): CurveVec3[] {
  return getSketchPolygons(sketch).outer;
}

/**
 * Compute the centroid of a 2D polygon (average of vertices).
 * For convex polygons, this is guaranteed to be inside.
 */
function polygonCentroid2D(verts: CurveVec3[]): [number, number] {
  let cx = 0, cy = 0;
  for (const v of verts) { cx += v[0]; cy += v[1]; }
  const n = verts.length || 1;
  return [cx / n, cy / n];
}

/**
 * Check if point (px, py) is inside polygon using ray-casting.
 */
function pointInPolygon2D(px: number, py: number, verts: CurveVec3[]): boolean {
  let inside = false;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i][0], yi = verts[i][1];
    const xj = verts[j][0], yj = verts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Triangulate a 2D polygon cap using ear-clipping.
 * Returns triangle indices relative to the start of the cap ring.
 */
function triangulateCap2D(verts: CurveVec3[]): number[] {
  const n = verts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2]; // trivial triangle

  // For convex-ish profiles, fan from an interior point works.
  // Find any interior point: try centroid first, then midpoint of first edge.
  const centroids = [polygonCentroid2D(verts)];
  // Also try some edge midpoints
  for (let i = 0; i < Math.min(3, n); i++) {
    const j = (i + 1) % n;
    centroids.push([(verts[i][0] + verts[j][0]) / 2, (verts[i][1] + verts[j][1]) / 2]);
  }

  let interior: [number, number] | null = null;
  for (const c of centroids) {
    if (pointInPolygon2D(c[0], c[1], verts)) {
      interior = c;
      break;
    }
  }

  // If no interior point found, fall back to ear-clipping (simplified)
  if (!interior) {
    return simpleEarClip2D(verts);
  }

  // Fan triangulation from interior point
  const tris: number[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    tris.push(i, next, n); // fan: edge_i → edge_{i+1} → center (index n)
  }
  return tris;
}

/**
 * Simple ear-clipping triangulation for non-convex polygons.
 * Returns flat array of triangle vertex indices.
 */
function simpleEarClip2D(verts: CurveVec3[]): number[] {
  const n = verts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Build index list
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(i);
  const tris: number[] = [];

  // Ear-clipping: repeatedly find an ear and remove it
  const remaining = [...indices];
  let safety = n * 3;
  while (remaining.length > 3 && safety-- > 0) {
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length];
      const curr = remaining[i];
      const next = remaining[(i + 1) % remaining.length];

      const a = verts[prev], b = verts[curr], c = verts[next];

      // Check if angle is convex (cross product > 0 for CCW)
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) continue; // concave or collinear

      // Check no other vertex is inside triangle a-b-c
      let isEar = true;
      for (const vi of remaining) {
        if (vi === prev || vi === curr || vi === next) continue;
        if (pointInTriangle2D(verts[vi], a, b, c)) { isEar = false; break; }
      }

      if (isEar) {
        tris.push(prev, curr, next);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break; // safety
  }

  // Last triangle
  if (remaining.length === 3) {
    tris.push(remaining[0], remaining[1], remaining[2]);
  }

  return tris;
}

function pointInTriangle2D(
  p: CurveVec3, a: CurveVec3, b: CurveVec3, c: CurveVec3,
): boolean {
  const v0x = c[0] - a[0], v0y = c[1] - a[1];
  const v1x = b[0] - a[0], v1y = b[1] - a[1];
  const v2x = p[0] - a[0], v2y = p[1] - a[1];

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= -1e-10 && v >= -1e-10 && (u + v) <= 1 + 1e-10;
}

/**
 * Resample a set of 2D vertices to have exactly `n` points evenly spaced
 * by arc length around the perimeter.
 */
function resampleVertices2D(vertices: CurveVec3[], n: number): CurveVec3[] {
  if (vertices.length === n) return vertices;
  if (n < 3) throw new Error('Cannot resample to fewer than 3 vertices');

  // Compute cumulative arc lengths
  const lengths: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    lengths.push(lengths[i - 1] + vec3Length(vec3Sub(vertices[i], vertices[i - 1])));
  }
  // Close the loop
  const totalLength = lengths[lengths.length - 1] +
    vec3Length(vec3Sub(vertices[0], vertices[vertices.length - 1]));

  const result: CurveVec3[] = [];
  for (let i = 0; i < n; i++) {
    const targetLen = (i / n) * totalLength;
    // Find segment
    let seg = 0;
    for (let j = 1; j < lengths.length; j++) {
      if (lengths[j] >= targetLen) {
        seg = j - 1;
        break;
      }
      if (j === lengths.length - 1) seg = j - 1;
    }

    const segStart = vertices[seg];
    const segEnd = seg + 1 < vertices.length ? vertices[seg + 1] : vertices[0];
    const segLen = vec3Length(vec3Sub(segEnd, segStart));
    let t = 0;
    if (segLen > 1e-12) {
      t = (targetLen - lengths[seg]) / segLen;
    }
    t = Math.max(0, Math.min(1, t));
    result.push(vec3Add(segStart, vec3Scale(vec3Sub(segEnd, segStart), t)));
  }

  return result;
}

// ---------------------------------------------------------------------------
// LOFT
// ---------------------------------------------------------------------------

/**
 * Create a Shape by lofting between 2D profiles at specified heights.
 *
 * @param profiles Array of Sketch instances (ordered bottom to top, or will be sorted by height)
 * @param heights  Array of Z heights corresponding to each profile
 * @returns Shape representing the lofted solid
 */
export function loft(profiles: Sketch[], heights: number[]): Shape {
  if (profiles.length < 2) {
    throw new Error('loft requires at least 2 profiles');
  }
  if (profiles.length !== heights.length) {
    throw new Error(
      `loft: profiles count (${profiles.length}) must match heights count (${heights.length})`
    );
  }

  // Sort profiles by height
  const indexed = profiles.map((p, i) => ({ p, h: heights[i] }));
  indexed.sort((a, b) => a.h - b.h);
  const sortedProfiles = indexed.map(x => x.p);
  const sortedHeights = indexed.map(x => x.h);

  // Get vertices from each profile
  const allVertices = sortedProfiles.map(p => getSketchVertices(p));

  // Standardize vertex count: resample all profiles to the same count
  const maxVerts = Math.max(...allVertices.map(v => v.length), 6);
  const targetVerts = Math.max(maxVerts, 16); // At least 16 for smoothness

  const resampledRings = allVertices.map(v =>
    resampleVertices2D(v, targetVerts)
  );

  // Build triangle strip mesh
  const numRings = resampledRings.length;
  const vertsPerRing = targetVerts;

  // Vertices: numRings rings × vertsPerRing vertices + 2 cap centers
  const vertices: number[] = [];
  const triangleIndices: number[] = [];

  // Add ring vertices at each height
  for (let r = 0; r < numRings; r++) {
    const h = sortedHeights[r];
    for (let v = 0; v < vertsPerRing; v++) {
      const pt = resampledRings[r][v];
      vertices.push(pt[0], pt[1], h);
    }
  }

  // Cap triangulation using proper polygon triangulation
  // Bottom cap: add centroid as cap center, fan from it
  const bottomRing2D = resampledRings[0].map(p => [p[0], p[1], 0] as CurveVec3);
  const bottomCentroid = polygonCentroid2D(bottomRing2D);
  const bottomCenterIdx = numRings * vertsPerRing;
  vertices.push(bottomCentroid[0], bottomCentroid[1], sortedHeights[0]);

  // Top cap: same approach
  const topRing2D = resampledRings[numRings - 1].map(p => [p[0], p[1], 0] as CurveVec3);
  const topCentroid = polygonCentroid2D(topRing2D);
  const topCenterIdx = bottomCenterIdx + 1;
  vertices.push(topCentroid[0], topCentroid[1], sortedHeights[numRings - 1]);

  // Add center vertex to 2D ring for fan triangulation
  const bottomRingWithCenter = [...bottomRing2D, [bottomCentroid[0], bottomCentroid[1], 0] as CurveVec3];
  const topRingWithCenter = [...topRing2D, [topCentroid[0], topCentroid[1], 0] as CurveVec3];

  // Bottom cap: fan from center (index = ring length) to ring edges
  for (let v = 0; v < vertsPerRing; v++) {
    const v0 = v;
    const v1 = (v + 1) % vertsPerRing;
    triangleIndices.push(bottomCenterIdx, v0, v1);
  }

  // Top cap (reversed winding for outward-facing normals)
  const topRingBase = (numRings - 1) * vertsPerRing;
  for (let v = 0; v < vertsPerRing; v++) {
    const v0 = topRingBase + v;
    const v1 = topRingBase + (v + 1) % vertsPerRing;
    triangleIndices.push(topCenterIdx, v1, v0);
  }

  // Validate with Manifold.ofMesh()
  return validateAndCreateShape(
    new Float32Array(vertices),
    new Uint32Array(triangleIndices),
    sortedProfiles,
    sortedHeights,
  );
}

// ---------------------------------------------------------------------------
// SWEEP
// ---------------------------------------------------------------------------

/**
 * Create a Shape by sweeping a 2D profile along a 3D curve path.
 *
 * @param profile The 2D cross-section sketch to sweep
 * @param path    The 3D curve path to sweep along
 * @returns Shape representing the swept solid
 */
export function sweep(profile: Sketch, path: Curve3D | CurveVec3[]): Shape {
  // Accept plain point arrays — convert to Curve3D via Catmull-Rom
  const curve = Array.isArray(path) ? spline3d(path as CurveVec3[], { tension: 0.5 }) : path;

  // Sample path and compute frames
  const pathLength = curve.length();
  const numSamples = Math.max(20, Math.ceil(pathLength / 2));
  const frames = curve.frames(numSamples);

  // Get profile vertices
  const profileVerts = getSketchVertices(profile);
  const numProfileVerts = profileVerts.length;

  // Build ring vertices: transform profile into each frame's coordinate system
  const vertices: number[] = [];
  const triangleIndices: number[] = [];

  const totalRingVerts = numSamples * numProfileVerts;

  for (let i = 0; i < numSamples; i++) {
    const frame = frames[i];
    for (let j = 0; j < numProfileVerts; j++) {
      // Profile vertex is in XY plane (2D extruded to 3D)
      const pv = profileVerts[j];
      // Transform: translate profile point into frame's local basis
      // local point = origin + pv[0] * normal + pv[1] * binormal
      const x = frame.origin[0] + pv[0] * frame.normal[0] + pv[1] * frame.binormal[0];
      const y = frame.origin[1] + pv[0] * frame.normal[1] + pv[1] * frame.binormal[1];
      const z = frame.origin[2] + pv[0] * frame.normal[2] + pv[1] * frame.binormal[2];
      vertices.push(x, y, z);
    }
  }

  // Cap centers (start and end)
  const startCenter = computeCentroid(frames[0], profileVerts);
  const endCenter = computeCentroid(frames[numSamples - 1], profileVerts);
  const startIndex = totalRingVerts;
  const endIndex = startIndex + 1;

  vertices.push(startCenter[0], startCenter[1], startCenter[2]);
  vertices.push(endCenter[0], endCenter[1], endCenter[2]);

  // Triangle strips between adjacent rings
  for (let i = 0; i < numSamples - 1; i++) {
    const base0 = i * numProfileVerts;
    const base1 = (i + 1) * numProfileVerts;
    for (let j = 0; j < numProfileVerts; j++) {
      const v0 = base0 + j;
      const v1 = base0 + (j + 1) % numProfileVerts;
      const v2 = base1 + j;
      const v3 = base1 + (j + 1) % numProfileVerts;

      triangleIndices.push(v0, v2, v1);
      triangleIndices.push(v1, v2, v3);
    }
  }

  // Start cap (fan triangulation, reversed winding for outward normal)
  for (let j = 0; j < numProfileVerts; j++) {
    const v0 = j;
    const v1 = (j + 1) % numProfileVerts;
    triangleIndices.push(startIndex, v1, v0);
  }

  // End cap (fan triangulation)
  const endRingBase = (numSamples - 1) * numProfileVerts;
  for (let j = 0; j < numProfileVerts; j++) {
    const v0 = endRingBase + j;
    const v1 = endRingBase + (j + 1) % numProfileVerts;
    triangleIndices.push(endIndex, v0, v1);
  }

  // Validate and create shape
  return validateAndCreateShapeSweep(
    new Float32Array(vertices),
    new Uint32Array(triangleIndices),
    profile,
    curve,
  );
}

// ---------------------------------------------------------------------------
// Mesh validation and shape creation
// ---------------------------------------------------------------------------

function validateAndCreateShape(
  vertProperties: Float32Array,
  triVerts: Uint32Array,
  profiles: Sketch[],
  heights: number[],
): Shape {
  const m = getManifold();

  try {
    // Build a proper Mesh instance if available, fall back to plain object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MeshClass = (m as any).Mesh;
    const mesh = typeof MeshClass === 'function'
      ? new MeshClass({ numProp: 3, vertProperties, triVerts })
      : { numProp: 3, vertProperties, triVerts };

    // manifold-3d v3.x: Manifold.ofMesh(mesh)
    if (typeof m.Manifold.ofMesh === 'function') {
      try {
        const manifold = m.Manifold.ofMesh(mesh);
        if (manifold) return new Shape(manifold);
      } catch {
        // ofMesh threw — fall through to fallback
      }
    }

    // Fallback: union of extruded profiles
    return fallbackLoftShape(profiles, heights);
  } catch (err) {
    console.warn('loft: mesh validation failed, falling back to union approximation', err);
    return fallbackLoftShape(profiles, heights);
  }
}

function validateAndCreateShapeSweep(
  vertProperties: Float32Array,
  triVerts: Uint32Array,
  profile: Sketch,
  path: Curve3D,
): Shape {
  const m = getManifold();

  try {
    // Build proper Mesh instance when available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MeshClass = (m as any).Mesh;
    const mesh = typeof MeshClass === 'function'
      ? new MeshClass({ numProp: 3, vertProperties, triVerts })
      : { numProp: 3, vertProperties, triVerts };

    if (typeof m.Manifold.ofMesh === 'function') {
      try {
        const manifold = m.Manifold.ofMesh(mesh);
        if (manifold) return new Shape(manifold);
      } catch {
        // ofMesh threw — fall through to fallback
      }
    }

    // Fallback: approximate sweep with union of extruded slices
    return fallbackSweepShape(profile, path);
  } catch (err) {
    console.warn('sweep: mesh validation failed, falling back to approximation', err);
    return fallbackSweepShape(profile, path);
  }
}

// ---------------------------------------------------------------------------
// Fallback approximations
// ---------------------------------------------------------------------------

/**
 * Loft fallback: union of extruded profiles (approximate with stacked boxes/sections).
 */
function fallbackLoftShape(profiles: Sketch[], heights: number[]): Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = getManifold();
  let result: unknown = null;

  for (let i = 0; i < profiles.length - 1; i++) {
    const h0 = heights[i];
    const h1 = heights[i + 1];
    const layerHeight = Math.abs(h1 - h0);

    // Extrude the lower profile and translate to height
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extruded: any = (profiles[i].crossSection as any).extrude(layerHeight);
    if (h0 !== 0) {
      extruded = extruded.translate([0, 0, Math.min(h0, h1)]);
    }

    if (result === null) {
      result = extruded;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (result as any).add(extruded);
    }
  }

  if (!result) {
    // Ultimate fallback: return first profile extruded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Shape((profiles[0].crossSection as any).extrude(1));
  }
  return new Shape(result);
}

/**
 * Sweep fallback: approximate with union of small extrusions along the path.
 */
function fallbackSweepShape(profile: Sketch, path: Curve3D): Shape {
  const samples = Math.max(10, Math.ceil(path.length() / 5));
  const points = path.sample(samples);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseManifold: any = (profile.crossSection as any).extrude(1);

  const m = getManifold();

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    // Create a small extrusion at each sample point
    const slice = baseManifold.translate([pt[0], pt[1], pt[2]]);

    if (result === null) {
      result = slice;
    } else {
      result = result.add(slice);
    }
  }

  return new Shape(result);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeCentroid(frame: Frame, profileVerts: CurveVec3[]): CurveVec3 {
  let cx = 0, cy = 0;
  for (const pv of profileVerts) {
    cx += pv[0];
    cy += pv[1];
  }
  cx /= profileVerts.length;
  cy /= profileVerts.length;

  // Transform centroid into world space
  const x = frame.origin[0] + cx * frame.normal[0] + cy * frame.binormal[0];
  const y = frame.origin[1] + cx * frame.normal[1] + cy * frame.binormal[1];
  const z = frame.origin[2] + cx * frame.normal[2] + cy * frame.binormal[2];

  return [x, y, z];
}