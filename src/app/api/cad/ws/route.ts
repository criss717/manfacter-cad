/**
 * WebSocket API route for the ForgeCAD agent.
 *
 * Uses next-ws to handle WebSocket connections directly in Next.js.
 * The UPGRADE function is called when a client connects via ws://localhost:3000/api/cad/ws.
 *
 * @see https://github.com/k0d13/next-ws
 */

import type { WebSocket } from 'ws';
import {
  handleConnection,
  handleMessage,
  handleDisconnect,
} from '@/agent/server';

/**
 * next-ws UPGRADE handler — called on every WebSocket upgrade request.
 *
 * Wires up the agent server handlers to the raw ws.WebSocket instance:
 * - connection → handleConnection (sends ready event)
 * - message → handleMessage (parses JSON, runs agent loop)
 * - close → handleDisconnect (cleans up session resources)
 */
export function GET(): Response {
  return new Response('Upgrade required', { status: 426 });
}

export function UPGRADE(client: WebSocket): void {
  handleConnection(client as unknown as import('@/agent/server').AgentWebSocket);

  client.on('message', (data) => {
    const raw = typeof data === 'string' ? data : String(data);
    handleMessage(client as unknown as import('@/agent/server').AgentWebSocket, raw).catch(
      (err) => {
        console.error('[WS ROUTE] handleMessage error:', err);
      },
    );
  });

  client.on('close', () => {
    handleDisconnect(client as unknown as import('@/agent/server').AgentWebSocket);
  });
}
