/**
 * Session store — in-memory Map with TTL cleanup.
 *
 * Mirrors the SESSIONS / SESSION_LAST_ACCESS pattern from openai_server.py.
 * Each session holds an OpenAI-format message array with a system prompt
 * prepended on creation.
 */

import type { ChatMessage, Session } from './types';
import { CAD_AGENT_PROMPT } from './prompt';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Global session map — keyed by session ID. */
export const SESSIONS = new Map<string, Session>();

/** TTL in milliseconds (1 hour, matching Python SESSION_TTL = 3600). */
const SESSION_TTL_MS = 60 * 60 * 1000;

/** Cleanup interval in milliseconds (10 minutes, matching Python 600s). */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return an existing session or create a new one with the system prompt.
 * Touches `lastAccess` on every call.
 */
export function getSession(sessionId: string): Session {
  let session = SESSIONS.get(sessionId);
  if (!session) {
    session = {
      messages: [{ role: 'system', content: CAD_AGENT_PROMPT }],
      lastAccess: Date.now(),
    };
    SESSIONS.set(sessionId, session);
  }
  session.lastAccess = Date.now();
  return session;
}

/**
 * Append a message to a session's history.
 * Creates the session if it doesn't exist.
 */
export function addMessage(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId);
  session.messages.push(message);
  session.lastAccess = Date.now();
}

/**
 * Remove expired sessions (older than SESSION_TTL_MS).
 */
export function cleanupSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [sid, session] of SESSIONS) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      SESSIONS.delete(sid);
      removed++;
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Auto-cleanup timer
// ---------------------------------------------------------------------------

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic cleanup timer. Safe to call multiple times —
 * subsequent calls are no-ops if the timer is already running.
 */
export function startSessionCleanup(): void {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const removed = cleanupSessions();
    if (removed > 0) {
      console.log(`[SESSION] Cleaned ${removed} expired sessions, ${SESSIONS.size} remaining`);
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is active.
  if (_cleanupTimer && typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
    _cleanupTimer.unref();
  }
}

/**
 * Stop the cleanup timer (useful for tests).
 */
export function stopSessionCleanup(): void {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}
