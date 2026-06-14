/**
 * TypeScript types for the ForgeCAD AI agent system.
 *
 * Mirrors the Python openai_server.py / tools.py data contracts
 * and defines the WebSocket message format used by the frontend.
 */

// ---------------------------------------------------------------------------
// Provider / model types
// ---------------------------------------------------------------------------

/** Named provider keys — maps 1:1 to MODEL_CONFIGS entries. */
export type Provider =
  | 'minimax'
  | 'glm'
  | 'kimi'
  | 'deepseek'
  | 'mimo-v2.5-free'
  | 'deepseek-v4-flash-free'
  | 'nemotron-3-ultra-free'
  | 'sonnet'
  | 'opus'
  | 'qwen'
  | 'gemini-pro'
  | 'deepseek-v4-pro-go'
  | 'mimo-v2.5-pro-go'
  | 'kimi-go'
  | 'kimi2.7-go'
  | 'glm-go'
  | 'qwen3.7-max-go'
  | 'minimax-m3-go'
  | string;

/** Tier classification from prompt heuristics. */
export type Tier = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

// ---------------------------------------------------------------------------
// Chat message types (OpenAI-compatible session format)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | unknown[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  model: string;
  api: 'chat' | 'messages' | 'gemini';
  base_url?: string;
  temperature?: number;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export interface Session {
  messages: ChatMessage[];
  lastAccess: number;
}

// ---------------------------------------------------------------------------
// WebSocket message types (compatible with frontend useCadChat.ts)
// ---------------------------------------------------------------------------

/** Client → Server */
export interface WSMessage {
  type: string;
  message?: string;
  provider?: string;
  session_id?: string;
  image?: string;
}

/** Server → Client: agent event (text, tool_call, tool_result) */
export interface WSEvent {
  type: 'agent_event';
  text?: string;
  tool_call?: { name: string; args: unknown };
  tool_result?: { name: string; response: string };
}

/** Server → Client: error */
export interface WSError {
  type: 'error';
  error: string;
}

/** Server → Client: done */
export interface WSDone {
  type: 'done';
  tier: string;
}

/** Server → Client: ready */
export interface WSReady {
  type: 'ready';
  message?: string;
}

// ---------------------------------------------------------------------------
// Tool execution results
// ---------------------------------------------------------------------------

export interface RunCadCodeResult {
  ok: boolean;
  modelId?: string;
  glbUrl?: string;
  stlUrl?: string;
  stepUrl?: string;
  facts?: {
    bbox?: { min: number[]; max: number[]; size: number[] };
    volume?: number;
    triangles?: number;
  };
  paramDefs?: ParamDefEntry[];
  error?: string;
  hint?: string;
  code?: string;
  tier?: string;
}

export interface ParamDefEntry {
  name: string;
  type: 'number' | 'bool' | 'choice';
  defaultValue: number | boolean | string;
  options?: {
    min?: number;
    max?: number;
    step?: number;
    values?: string[];
  };
  unit?: string;
}

export interface InspectResult {
  ok: boolean;
  facts?: Record<string, unknown>;
  error?: string;
  hint?: string;
  dimensionalMismatch?: boolean;
}

export interface ListOutputsResult {
  ok: boolean;
  files: Array<{ name: string; size: number; suffix: string }>;
  session: string;
}
