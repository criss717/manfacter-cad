/**
 * Export utilities: STL, GLB, and STEP formats.
 *
 * These are free functions that accept a Shape and produce export buffers.
 * Shape class methods (.toSTL(), .toGLB(), .toSTEP()) delegate to these.
 *
 * - STL and GLB convert directly from the Manifold mesh.
 * - STEP uses opencascade.js loaded lazily via dynamic import (stub).
 */

import { Shape } from './shape';

// ---------------------------------------------------------------------------
// STL export
// ---------------------------------------------------------------------------

/**
 * Export a shape as a binary STL buffer.
 */
export function toSTL(shape: Shape): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifold = shape.manifold as any;
  const mesh = manifold.getMesh();

  const numTri = mesh.numTri;
  const numVert = mesh.numVert;
  const verts = mesh.vertProperties;
  const indices = mesh.triVerts;

  // Binary STL format:
  // 80 bytes header + 4 bytes triangle count + (50 bytes per triangle)
  const bufferSize = 80 + 4 + numTri * 50;
  const buffer = Buffer.alloc(bufferSize);

  // Header (80 bytes)
  buffer.write('ForgeCAD STL', 0, 'ascii');

  // Triangle count (uint32 LE)
  buffer.writeUInt32LE(numTri, 80);

  let offset = 84;
  for (let i = 0; i < numTri; i++) {
    const i0 = indices[i * 3];
    const i1 = indices[i * 3 + 1];
    const i2 = indices[i * 3 + 2];

    // Compute face normal from cross product
    const ax = verts[i0 * 3], ay = verts[i0 * 3 + 1], az = verts[i0 * 3 + 2];
    const bx = verts[i1 * 3], by = verts[i1 * 3 + 1], bz = verts[i1 * 3 + 2];
    const cx = verts[i2 * 3], cy = verts[i2 * 3 + 1], cz = verts[i2 * 3 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    // Normal
    buffer.writeFloatLE(nx, offset); offset += 4;
    buffer.writeFloatLE(ny, offset); offset += 4;
    buffer.writeFloatLE(nz, offset); offset += 4;

    // Vertex 1
    buffer.writeFloatLE(ax, offset); offset += 4;
    buffer.writeFloatLE(ay, offset); offset += 4;
    buffer.writeFloatLE(az, offset); offset += 4;

    // Vertex 2
    buffer.writeFloatLE(bx, offset); offset += 4;
    buffer.writeFloatLE(by, offset); offset += 4;
    buffer.writeFloatLE(bz, offset); offset += 4;

    // Vertex 3
    buffer.writeFloatLE(cx, offset); offset += 4;
    buffer.writeFloatLE(cy, offset); offset += 4;
    buffer.writeFloatLE(cz, offset); offset += 4;

    // Attribute byte count (uint16 LE) — always 0
    buffer.writeUInt16LE(0, offset); offset += 2;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// GLB export
// ---------------------------------------------------------------------------

/**
 * Export a shape as a GLB (binary glTF 2.0) buffer.
 */
export function toGLB(shape: Shape): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifold = shape.manifold as any;
  const mesh = manifold.getMesh();

  const numTri = mesh.numTri;
  const verts = mesh.vertProperties;
  const indices = mesh.triVerts;
  const numVert = verts.length / 3;

  // Compute bounding box for accessor bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    minX = Math.min(minX, verts[i]);
    minY = Math.min(minY, verts[i + 1]);
    minZ = Math.min(minZ, verts[i + 2]);
    maxX = Math.max(maxX, verts[i]);
    maxY = Math.max(maxY, verts[i + 1]);
    maxZ = Math.max(maxZ, verts[i + 2]);
  }

  // Vertex buffer: Float32 (positions only)
  const vertexBuffer = Buffer.alloc(numVert * 3 * 4);
  for (let i = 0; i < verts.length; i++) {
    vertexBuffer.writeFloatLE(verts[i], i * 4);
  }

  // Index buffer: Uint32
  const indexBuffer = Buffer.alloc(numTri * 3 * 4);
  for (let i = 0; i < indices.length; i++) {
    indexBuffer.writeUInt32LE(indices[i], i * 4);
  }

  // Align buffers to 4-byte boundaries
  const vbPadded = alignBuffer(vertexBuffer);
  const ibPadded = alignBuffer(indexBuffer);

  const vbByteLength = vertexBuffer.length;
  const ibByteLength = indexBuffer.length;
  const totalBinLength = vbPadded.length + ibPadded.length;

  // Build JSON chunk
  const gltfJson = {
    asset: { version: '2.0', generator: 'ForgeCAD' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: numVert,
        type: 'VEC3',
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5125, // UNSIGNED_INT
        count: numTri * 3,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: vbByteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: vbPadded.length,
        byteLength: ibByteLength,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        byteLength: totalBinLength,
      },
    ],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBuffer = Buffer.from(jsonStr, 'utf8');
  const jsonPadded = alignBuffer(jsonBuffer);

  // GLB structure:
  // Header (12 bytes) + JSON chunk header (8) + JSON data + BIN chunk header (8) + BIN data
  const glbLength = 12 + 8 + jsonPadded.length + 8 + totalBinLength;
  const glb = Buffer.alloc(glbLength);
  let off = 0;

  // GLB header
  glb.writeUInt32LE(0x46546C67, off); off += 4; // magic: "glTF"
  glb.writeUInt32LE(2, off); off += 4;           // version
  glb.writeUInt32LE(glbLength, off); off += 4;   // total length

  // JSON chunk
  glb.writeUInt32LE(jsonPadded.length, off); off += 4; // chunk length
  glb.writeUInt32LE(0x4E4F534A, off); off += 4;        // chunk type: "JSON"
  jsonPadded.copy(glb, off); off += jsonPadded.length;

  // BIN chunk
  glb.writeUInt32LE(totalBinLength, off); off += 4;  // chunk length
  glb.writeUInt32LE(0x004E4942, off); off += 4;       // chunk type: "BIN\0"
  vbPadded.copy(glb, off); off += vbPadded.length;
  ibPadded.copy(glb, off); off += ibPadded.length;

  return glb;
}

// ---------------------------------------------------------------------------
// STEP export (stub — requires opencascade.js)
// ---------------------------------------------------------------------------

/**
 * Export a shape as a STEP file buffer.
 *
 * Uses opencascade.js loaded lazily. This is a heavyweight operation
 * (OCCT WASM is ~13 MB) — first call has a 2-5s cold start penalty.
 *
 * Currently a stub — full OCCT integration is future work.
 */
export async function toSTEP(_shape: Shape): Promise<Buffer> {
  throw new Error(
    'STEP export requires opencascade.js B-Rep construction — ' +
    'this will be implemented when OCCT WASM integration is complete. ' +
    'Use toGLB() or toSTL() for now.'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad a buffer to 4-byte alignment with 0x20 (space) bytes. */
function alignBuffer(buf: Buffer): Buffer {
  const remainder = buf.length % 4;
  if (remainder === 0) return buf;
  const padding = 4 - remainder;
  const padded = Buffer.alloc(buf.length + padding, 0x20);
  buf.copy(padded);
  return padded;
}