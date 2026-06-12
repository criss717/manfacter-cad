/**
 * WebSocket server handler for the ForgeCAD agent.
 *
 * This module provides the handler logic for WebSocket connections.
 * The actual WebSocket transport depends on the deployment:
 * - next-ws plugin for Next.js (recommended)
 * - Custom server with `ws` package (fallback)
 *
 * The handler parses incoming JSON messages and delegates to runAgentLoop
 * in dispatch.ts for the multi-provider agent loop.
 */

import type { WSMessage } from './types';
import { runAgentLoop } from './dispatch';
import { releaseSessionResources } from './tools';
import { startSessionCleanup } from './session';

// ---------------------------------------------------------------------------
// WebSocket interface (minimal — compatible with ws, next-ws, Bun, etc.)
// ---------------------------------------------------------------------------

export interface AgentWebSocket {
  send(data: string): void | Promise<void>;
  close?: () => void;
  readyState?: number;
}

export interface AgentRequest {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

// ---------------------------------------------------------------------------
// Session tracking per connection
// ---------------------------------------------------------------------------

const connectionSessions = new WeakMap<AgentWebSocket, Set<string>>();

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Handle a WebSocket connection for the CAD agent.
 * Call this from your WebSocket route handler (next-ws, custom server, etc.).
 *
 * @example
 * ```ts
 * // With next-ws:
 * export function GET(req: Request) {
 *   const { socket, response } = await upgradeWebSocket(req);
 *   handleConnection(socket);
 *   return response;
 * }
 * ```
 */
export function handleConnection(ws: AgentWebSocket): void {
  // Ensure session cleanup timer is running
  startSessionCleanup();

  const usedSids = new Set<string>();
  connectionSessions.set(ws, usedSids);

  // Send ready event
  wsSend(ws, { type: 'ready', message: 'ForgeCAD Agent connected' });
  console.log('[SERVER] New WebSocket connection');

  // The caller should wire up message/close events to these handlers:
  // ws.on('message', (data) => handleMessage(ws, data.toString()));
  // ws.on('close', () => handleDisconnect(ws));
}

/**
 * Handle an incoming WebSocket message.
 * Wire this to your WebSocket's 'message' event.
 */
export async function handleMessage(ws: AgentWebSocket, raw: string): Promise<void> {
  let msg: WSMessage;
  try {
    msg = JSON.parse(raw) as WSMessage;
  } catch {
    wsSend(ws, { type: 'error', error: 'Invalid JSON' });
    return;
  }

  const userText = msg.message ?? '';
  const provider = msg.provider ?? 'glm';
  const imageData = msg.image;
  const sessionId = msg.session_id ?? `sid_${Date.now()}`;

  if (!userText && !imageData) {
    wsSend(ws, { type: 'error', error: "Missing 'message'" });
    return;
  }

  const effectiveText = userText || 'Analiza esta imagen y genera el modelo CAD correspondiente';

  // Track session for cleanup
  const sids = connectionSessions.get(ws);
  sids?.add(sessionId);

  console.log(`[SERVER] Message (session=${sessionId.slice(0, 12)}): ${effectiveText.slice(0, 80)}...`);

  try {
    await runAgentLoop(ws, provider, sessionId, effectiveText, imageData);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[SERVER] ERROR: ${error}`);
    try {
      wsSend(ws, { type: 'error', error: error.slice(0, 300) });
    } catch {
      // WebSocket may be closed
    }
  }
}

/**
 * Handle WebSocket disconnect.
 * Wire this to your WebSocket's 'close' event.
 */
export function handleDisconnect(ws: AgentWebSocket): void {
  const sids = connectionSessions.get(ws);
  if (sids) {
    for (const sid of sids) {
      try {
        releaseSessionResources(sid);
      } catch (err) {
        console.error(`[SERVER] cleanup error for ${sid.slice(0, 12)}:`, err);
      }
    }
  }
  console.log('[SERVER] WebSocket disconnected');
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function wsSend(ws: AgentWebSocket, data: Record<string, unknown>): Promise<void> {
  await ws.send(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Compatibility: attach handlers to a ws-compatible WebSocket instance
// ---------------------------------------------------------------------------

/**
 * Attach all event handlers to a WebSocket instance.
 * Use this when you have a raw WebSocket object with .on() method.
 *
 * @example
 * ```ts
 * import { WebSocketServer } from 'ws';
 * const wss = new WebSocketServer({ port: 8080 });
 * wss.on('connection', (ws) => attachHandlers(ws));
 * ```
 */
export function attachHandlers(ws: AgentWebSocket & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
}): void {
  handleConnection(ws);

  if (typeof ws.on === 'function') {
    ws.on('message', (data: unknown) => {
      const str = typeof data === 'string' ? data : String(data);
      handleMessage(ws, str).catch(console.error);
    });
    ws.on('close', () => {
      handleDisconnect(ws);
    });
  }
}
