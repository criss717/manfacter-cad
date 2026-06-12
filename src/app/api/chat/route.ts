/**
 * Legacy /api/chat route — redirects to /api/generate for REST callers.
 *
 * The primary CAD generation path is WebSocket via /api/cad/ws.
 * This route exists for backward compatibility with clients that
 * still POST to /api/chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { runCadGeneration } from "@/lib/cadGeneration";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body.code as string | undefined;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: 'Missing "code" field. Use WebSocket (ws://localhost:3000/api/cad/ws) for the full agent experience, or POST to /api/generate with { code }.' },
        { status: 400 },
      );
    }

    const result = await runCadGeneration(code);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
