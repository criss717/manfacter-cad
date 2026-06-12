/**
 * Inspection utilities: bounding box, volume, surface area, triangle count,
 * emptiness check, collision detection, and snapshot rendering.
 *
 * Free functions delegate to Shape instance methods where applicable.
 * Standalone functions like checkCollisions and renderSnapshot remain here.
 */

import { Shape } from './shape';
import type { BBox, CollisionResult, SnapshotAngle } from './types';

/**
 * Get the axis-aligned bounding box of a shape.
 * Delegates to shape.boundingBox().
 */
export function getBoundingBox(shape: Shape): BBox {
  return shape.boundingBox();
}

/**
 * Get the volume of a shape in cubic millimetres.
 * Delegates to shape.volume().
 */
export function getVolume(shape: Shape): number {
  return shape.volume();
}

/**
 * Get the surface area of a shape in square millimetres.
 * Delegates to shape.surfaceArea().
 */
export function getSurfaceArea(shape: Shape): number {
  return shape.surfaceArea();
}

/**
 * Get the triangle count of the shape's mesh.
 * Delegates to shape.numTri().
 */
export function getTriangleCount(shape: Shape): number {
  return shape.numTri();
}

/**
 * Check whether a shape is empty (has no triangles).
 * Delegates to shape.isEmpty().
 */
export function isEmpty(shape: Shape): boolean {
  return shape.isEmpty();
}

/**
 * Check for bounding-box overlaps between all pairs of shapes.
 * This is a fast broad-phase check — not exact mesh intersection.
 */
export function checkCollisions(shapes: Shape[]): CollisionResult[] {
  const results: CollisionResult[] = [];

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = getBoundingBox(shapes[i]);
      const b = getBoundingBox(shapes[j]);

      const overlapping =
        a.min[0] <= b.max[0] &&
        a.max[0] >= b.min[0] &&
        a.min[1] <= b.max[1] &&
        a.max[1] >= b.min[1] &&
        a.min[2] <= b.max[2] &&
        a.max[2] >= b.min[2];

      let volume: number | undefined;
      if (overlapping) {
        // Compute exact intersection volume
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mA = shapes[i].manifold as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mB = shapes[j].manifold as any;
        try {
          volume = mA.intersect(mB).volume();
        } catch {
          volume = undefined;
        }
      }

      results.push({
        shapeA: shapes[i].id,
        shapeB: shapes[j].id,
        overlapping,
        volume,
      });
    }
  }

  return results;
}

/**
 * Render a PNG snapshot of a shape from a canonical camera angle.
 *
 * Converts the shape to a GLB mesh, then renders it to PNG using sharp
 * for image compositing. Returns a Buffer containing PNG data.
 */
export async function renderSnapshot(
  shape: Shape,
  _angle: SnapshotAngle = 'iso'
): Promise<Buffer> {
  // For MVP, we render a simple bounding-box wireframe as a PNG.
  // Full 3D rendering requires a WebGL context (headless three.js or similar).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharp: any = await import('sharp');
  const bbox = getBoundingBox(shape);

  const width = 400;
  const height = 300;

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    <rect x="50" y="50" width="${Math.min(300, Math.max(50, bbox.size[0]))}" height="${Math.min(200, Math.max(30, bbox.size[1]))}" fill="none" stroke="#4cc9f0" stroke-width="2"/>
    <text x="200" y="260" fill="#e0e0e0" font-family="monospace" font-size="12" text-anchor="middle">
      ${bbox.size[0].toFixed(1)} x ${bbox.size[1].toFixed(1)} x ${bbox.size[2].toFixed(1)} mm
    </text>
    <text x="200" y="280" fill="#888" font-family="monospace" font-size="10" text-anchor="middle">
      ${getTriangleCount(shape)} triangles | vol: ${getVolume(shape).toFixed(1)} mm³
    </text>
  </svg>`;

  return sharp.default(Buffer.from(svg)).png().toBuffer();
}