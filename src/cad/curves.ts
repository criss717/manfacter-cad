/**
 * Curve3D — Parametric 3D curve with Catmull-Rom interpolation.
 *
 * Provides spline3d() factory, sample(), length(), and frames() methods.
 * Used by sweep() in surfacing.ts for path sampling and Frenet-Serret frames.
 *
 * All operations are immutable — methods return new Curve3D instances.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

// ---------------------------------------------------------------------------
// Frame type
// ---------------------------------------------------------------------------

export interface Frame {
  origin: Vec3;
  tangent: Vec3;
  normal: Vec3;
  binormal: Vec3;
}

// ---------------------------------------------------------------------------
// Vec3 helpers
// ---------------------------------------------------------------------------

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-12) return [0, 0, 1]; // Default fallback
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---------------------------------------------------------------------------
// Curve3D class
// ---------------------------------------------------------------------------

export class Curve3D {
  readonly points: Vec3[];
  readonly closed: boolean;
  readonly tension: number;

  constructor(
    points: Vec3[],
    options?: { closed?: boolean; tension?: number },
  ) {
    if (points.length < 2) {
      throw new Error('Curve3D requires at least 2 control points');
    }
    this.points = points.map(p => [...p] as Vec3);
    this.closed = options?.closed ?? false;
    this.tension = options?.tension ?? 0.5;
  }

  /**
   * Evaluate the Catmull-Rom spline at parameter t ∈ [0, 1].
   */
  sample(n: number): Vec3[] {
    if (n < 2) n = 2;
    const result: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      result.push(this.evaluate(t));
    }
    return result;
  }

  /**
   * Compute arc length via numerical integration.
   */
  length(): number {
    const steps = 200;
    let totalLen = 0;
    let prev = this.evaluate(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curr = this.evaluate(t);
      totalLen += vec3Length(vec3Sub(curr, prev));
      prev = curr;
    }
    return totalLen;
  }

  /**
   * Compute Frenet-Serret frames along the curve.
   * Falls back to parallel-transport for degenerate (near-zero curvature) segments.
   */
  frames(n: number): Frame[] {
    if (n < 2) n = 2;
    const samples = this.sample(n);
    const tangents: Vec3[] = [];

    // Compute tangents at each sample point
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      tangents.push(this.tangent(t));
    }

    // Build frames using parallel transport (robust for all cases)
    // First frame: choose an initial normal perpendicular to the first tangent
    const firstFrame = computeInitialFrame(samples[0], tangents[0]);
    const frames: Frame[] = [firstFrame];
    let prevNormal = firstFrame.normal;

    for (let i = 1; i < n; i++) {
      const t = tangents[i];
      const prevT = tangents[i - 1];

      // Parallel transport: project previous normal onto the plane
      // perpendicular to the current tangent
      const b = vec3Cross(prevT, t);
      const bLen = vec3Length(b);

      let normal: Vec3;

      if (bLen < 1e-10) {
        // Tangents are nearly parallel — keep previous normal
        normal = prevNormal;
      } else {
        // Rotation from prevT to t
        // Project previous normal into the new tangent plane
        const binorm = vec3Normalize(b);
        const cosAngle = vec3Dot(prevT, t);
        const sinAngle = bLen;

        // Rotate prevNormal around binormal axis by angle between prevT and t
        normal = rotateVector(prevNormal, binorm, Math.atan2(sinAngle, cosAngle));
      }

      // Ensure normal is perpendicular to tangent
      const proj = vec3Dot(normal, t);
      normal = vec3Normalize(vec3Sub(normal, vec3Scale(t, proj)));

      // Check for degenerate normal (zero length after projection)
      if (vec3Length(normal) < 1e-10) {
        // Fall back: pick arbitrary perpendicular
        normal = getArbitraryPerpendicular(t);
      }

      const binormal = vec3Normalize(vec3Cross(t, normal));
      // Re-orthogonalize normal
      normal = vec3Cross(binormal, t);

      frames.push({
        origin: samples[i],
        tangent: t,
        normal: vec3Normalize(normal),
        binormal: vec3Normalize(binormal),
      });

      prevNormal = normal;
    }

    return frames;
  }

  /**
   * Compute tangent (first derivative) at parameter t.
   */
  tangent(t: number): Vec3 {
    const eps = 0.0001;
    const t0 = Math.max(0, t - eps);
    const t1 = Math.min(1, t + eps);
    const p0 = this.evaluate(t0);
    const p1 = this.evaluate(t1);
    const dir = vec3Sub(p1, p0);
    const len = vec3Length(dir);
    if (len < 1e-15) {
      return [0, 0, 1]; // Default fallback
    }
    return vec3Normalize(dir);
  }

  // -----------------------------------------------------------------------
  // Internal: Catmull-Rom evaluation
  // -----------------------------------------------------------------------

  /**
   * Evaluate Catmull-Rom spline at parameter t ∈ [0, 1].
   */
  private evaluate(t: number): Vec3 {
    const pts = this.points;
    const n = pts.length;

    if (this.closed) {
      return this.evaluateCatmullRomClosed(t, pts, this.tension);
    }
    return this.evaluateCatmullRomOpen(t, pts, this.tension);
  }

  private evaluateCatmullRomOpen(t: number, pts: Vec3[], tension: number): Vec3 {
    const n = pts.length;
    // Map t to segment
    const totalSegs = n - 1;
    const scaled = t * totalSegs;
    const seg = Math.min(Math.floor(scaled), totalSegs - 1);
    const localT = scaled - seg;

    // Get four control points for this segment
    const i0 = Math.max(0, seg - 1);
    const i1 = seg;
    const i2 = Math.min(n - 1, seg + 1);
    const i3 = Math.min(n - 1, seg + 2);

    return catmullRomPoint(pts[i0], pts[i1], pts[i2], pts[i3], localT, tension);
  }

  private evaluateCatmullRomClosed(t: number, pts: Vec3[], tension: number): Vec3 {
    const n = pts.length;
    const totalSegs = n; // Closed: n segments
    const scaled = t * totalSegs;
    const seg = Math.floor(scaled) % n;
    const localT = scaled - Math.floor(scaled);

    // Wrap indices for closed spline
    const i0 = (seg - 1 + n) % n;
    const i1 = seg;
    const i2 = (seg + 1) % n;
    const i3 = (seg + 2) % n;

    return catmullRomPoint(pts[i0], pts[i1], pts[i2], pts[i3], localT, tension);
  }
}

// ---------------------------------------------------------------------------
// Catmull-Rom interpolation
// ---------------------------------------------------------------------------

function catmullRomPoint(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  t: number,
  tension: number,
): Vec3 {
  const s = (1 - tension) / 2;
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis matrix with tension
  const b1 = 2 * t3 - 3 * t2 + 1;
  const b2 = -2 * t3 + 3 * t2;
  const b3 = t3 - 2 * t2 + t;
  const b4 = t3 - t2;

  // Tangent vectors
  const m1x = s * (p2[0] - p0[0]);
  const m1y = s * (p2[1] - p0[1]);
  const m1z = s * (p2[2] - p0[2]);
  const m2x = s * (p3[0] - p1[0]);
  const m2y = s * (p3[1] - p1[1]);
  const m2z = s * (p3[2] - p1[2]);

  return [
    b1 * p1[0] + b2 * p2[0] + b3 * m1x + b4 * m2x,
    b1 * p1[1] + b2 * p2[1] + b3 * m1y + b4 * m2y,
    b1 * p1[2] + b2 * p2[2] + b3 * m1z + b4 * m2z,
  ];
}

// ---------------------------------------------------------------------------
// Frame computation helpers
// ---------------------------------------------------------------------------

function computeInitialFrame(origin: Vec3, tangent: Vec3): Frame {
  const normal = getArbitraryPerpendicular(tangent);
  const binormal = vec3Normalize(vec3Cross(tangent, normal));
  return {
    origin,
    tangent: vec3Normalize(tangent),
    normal: vec3Normalize(vec3Cross(binormal, tangent)),
    binormal,
  };
}

function getArbitraryPerpendicular(v: Vec3): Vec3 {
  // Find a vector not parallel to v
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  let other: Vec3;
  if (absX <= absY && absX <= absZ) {
    other = [1, 0, 0];
  } else if (absY <= absZ) {
    other = [0, 1, 0];
  } else {
    other = [0, 0, 1];
  }

  return vec3Normalize(vec3Cross(v, other));
}

function rotateVector(v: Vec3, axis: Vec3, angle: number): Vec3 {
  // Rodrigues' rotation formula
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = vec3Dot(v, axis);
  const cross = vec3Cross(axis, v);
  return [
    v[0] * cos + cross[0] * sin + axis[0] * dot * (1 - cos),
    v[1] * cos + cross[1] * sin + axis[1] * dot * (1 - cos),
    v[2] * cos + cross[2] * sin + axis[2] * dot * (1 - cos),
  ];
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a Curve3D with Catmull-Rom interpolation.
 *
 * @param points Control points as [x, y, z] array
 * @param options.closed Whether the curve is closed (default: false)
 * @param options.tension Catmull-Rom tension (default: 0.5)
 */
export function spline3d(
  points: Vec3[],
  options?: { closed?: boolean; tension?: number },
): Curve3D {
  return new Curve3D(points, options);
}

// ---------------------------------------------------------------------------
// 2D spline — Catmull-Rom for 2D profiles
// ---------------------------------------------------------------------------

/**
 * Smooth 2D polyline via Catmull-Rom interpolation.
 * Returns sampled 2D points usable with polygon().
 */
export function spline2d(
  points: Vec2[],
  options?: { closed?: boolean; tension?: number; samples?: number },
): Vec2[] {
  if (points.length < 2) return points;
  const pts3d: Vec3[] = points.map((p) => [p[0], p[1], 0]);
  const curve = spline3d(pts3d, options);
  const n = options?.samples ?? Math.max(20, points.length * 8);
  const sampled = curve.sample(n);
  return sampled.map((p) => [p[0], p[1]]);
}