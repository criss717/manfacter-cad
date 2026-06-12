/**
 * Inspection utilities: bounding box, volume, surface area, triangle count,
 * emptiness check, collision detection, and snapshot rendering.
 */

import type { BBox, CollisionResult, Shape, SnapshotAngle } from './types';
import { getManifoldFromShape } from './engine';

/**
 * Get the axis-aligned bounding box of a shape.
 */
export function getBoundingBox(shape: Shape): BBox {
  const bb = getManifoldFromShape(shape).boundingBox() as {
    min: number[];
    max: number[];
  };
  const min: [number, number, number] = [bb.min[0], bb.min[1], bb.min[2]];
  const max: [number, number, number] = [bb.max[0], bb.max[1], bb.max[2]];
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

/**
 * Get the volume of a shape in cubic millimetres.
 */
export function getVolume(shape: Shape): number {
  return getManifoldFromShape(shape).volume();
}

/**
 * Get the surface area of a shape in square millimetres.
 */
export function getSurfaceArea(shape: Shape): number {
  return getManifoldFromShape(shape).surfaceArea();
}

/**
 * Get the triangle count of the shape's mesh.
 */
export function getTriangleCount(shape: Shape): number {
  return getManifoldFromShape(shape).numTri();
}

/**
 * Check whether a shape is empty (has no triangles).
 */
export function isEmpty(shape: Shape): boolean {
  return getManifoldFromShape(shape).isEmpty();
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
        const mA = getManifoldFromShape(shapes[i]);
        const mB = getManifoldFromShape(shapes[j]);
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
 *
 * Camera positions for each angle (looking at origin):
 * - front:  (0, -1, 0.5)    — looking from front
 * - back:   (0, 1, 0.5)     — looking from back
 * - top:    (0, 0, 1)       — looking down
 * - bottom: (0, 0, -1)      — looking up
 * - left:   (-1, 0, 0.5)    — looking from left
 * - right:  (1, 0, 0.5)     — looking from right
 * - iso:    (1, -1, 1)      — isometric view
 */
export async function renderSnapshot(
  shape: Shape,
  _angle: SnapshotAngle = 'iso'
): Promise<Buffer> {
  // For MVP, we render a simple bounding-box wireframe as a PNG.
  // Full 3D rendering requires a WebGL context (headless three.js or similar).
  //
  // This placeholder creates a minimal PNG with the shape's bounding box
  // dimensions drawn as a labelled rectangle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @ts-ignore sharp types don't resolve via pnpm exports map
  const sharp: any = await import('sharp');
  const bbox = getBoundingBox(shape);

  const width = 400;
  const height = 300;

  // Create a simple SVG with the bbox info as text overlay
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
