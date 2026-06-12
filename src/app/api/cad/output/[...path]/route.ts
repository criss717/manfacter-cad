/**
 * Serve generated CAD output files (GLB, STL, STEP, PNG, JSON).
 *
 * Route: /api/cad/output/[modelId]/[filename]
 * Files are read from the output/ directory at project root.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const OUTPUT_DIR = resolve(process.cwd(), 'output');

/** MIME types for known CAD file extensions. */
const MIME_MAP: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.stl': 'application/sla',
  '.step': 'application/step',
  '.stp': 'application/step',
  '.png': 'image/png',
  '.json': 'application/json',
  '.js': 'application/javascript',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;

  if (!path || path.length === 0) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  // Sanitize: prevent directory traversal
  const safePath = path
    .map((p) => p.replace(/\.\./g, ''))
    .join('/');

  const filePath = join(OUTPUT_DIR, safePath);

  // Ensure the resolved path is within OUTPUT_DIR
  if (!filePath.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = '.' + filePath.split('.').pop()?.toLowerCase();
    const contentType = MIME_MAP[ext] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
