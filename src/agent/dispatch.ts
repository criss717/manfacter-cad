/**
 * Multi-provider AI dispatch.
 *
 * Ported from openai_server.py _run_chat, _run_messages, _run_gemini_zen.
 * Supports three API formats:
 * - chat: OpenAI-compatible /chat/completions (minimax, glm, kimi, deepseek, go models)
 * - messages: Anthropic /messages (sonnet, opus, qwen, minimax-m3-go)
 * - gemini: Google AI SDK :generateContent (gemini-pro)
 */

import type {
  ChatMessage,
  ProviderConfig,
  ToolCall,
} from './types';
import {
  TOOL_DEFINITIONS,
  ANTHROPIC_TOOLS,
  TOOL_MAP,
  setCurrentSession,
  setCurrentTier,
} from './tools';
import { assemblePrompt } from './prompt';
import {
  needsImagePipeline,
  analyzeImageDual,
  MODELS_WITH_VISION,
} from './image-analysis';
import { getSession, addMessage } from './session';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZEN_BASE = 'https://opencode.ai/zen/v1';
const ZEN_GO_BASE = 'https://opencode.ai/zen/go/v1';

const MAX_TOOL_ITERATIONS = 20;

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

export const MODEL_CONFIGS: Record<string, ProviderConfig> = {
  // Chat / completions
  minimax:               { model: 'minimax-m2.7',           api: 'chat' },
  glm:                   { model: 'glm-5.1',                api: 'chat' },
  kimi:                  { model: 'kimi-k2.6',              api: 'chat' },
  deepseek:              { model: 'deepseek-v4-flash',      api: 'chat' },
  // Free Zen models
  'mimo-v2.5-free':        { model: 'mimo-v2.5-free',           api: 'chat' },
  'deepseek-v4-flash-free':{ model: 'deepseek-v4-flash-free',   api: 'chat' },
  'nemotron-3-ultra-free': { model: 'nemotron-3-ultra-free',    api: 'chat' },
  // Anthropic Messages API
  sonnet:   { model: 'claude-sonnet-4-6',  api: 'messages' },
  opus:     { model: 'claude-opus-4-8',    api: 'messages' },
  qwen:     { model: 'qwen3.7-max',         api: 'messages' },
  // Gemini via Zen
  'gemini-pro': { model: 'gemini-3.1-pro', api: 'gemini' },
  // Go models (subscription)
  'deepseek-v4-pro-go': { model: 'deepseek-v4-pro', api: 'chat',     base_url: ZEN_GO_BASE },
  'mimo-v2.5-pro-go':   { model: 'mimo-v2.5-pro',   api: 'chat',     base_url: ZEN_GO_BASE },
  'kimi-go':            { model: 'kimi-k2.6',         api: 'chat',     base_url: ZEN_GO_BASE },
  'glm-go':             { model: 'glm-5.1',           api: 'chat',     base_url: ZEN_GO_BASE },
  'qwen3.7-max-go':     { model: 'qwen3.7-max',       api: 'messages', base_url: ZEN_GO_BASE },
  'minimax-m3-go':      { model: 'minimax-m3',        api: 'messages', base_url: ZEN_GO_BASE },
};

const DEFAULT_PROVIDER = 'glm';

// ---------------------------------------------------------------------------
// WebSocket sender helper
// ---------------------------------------------------------------------------

interface WSSender {
  send(data: string): void | Promise<void>;
}

async function wsSend(ws: WSSender, data: Record<string, unknown>): Promise<void> {
  await ws.send(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Format converters
// ---------------------------------------------------------------------------

/**
 * Convert OpenAI-format messages to Anthropic format.
 * Returns (systemPrompt, anthropicMessages).
 */
function toAnthropic(messages: ChatMessage[]): { system: string; msgs: unknown[] } {
  let system = '';
  const result: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content ?? '';
      continue;
    }

    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content ?? '' });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: unknown[] = [];
      if (msg.content) parts.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls ?? []) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments); } catch { /* noop */ }
        parts.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      if (parts.length > 0) result.push({ role: 'assistant', content: parts });
      continue;
    }

    if (msg.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id ?? '',
        content: msg.content ?? '',
      };
      // Group consecutive tool results
      const last = result[result.length - 1] as { role?: string; content?: unknown[] } | undefined;
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
    }
  }

  return { system, msgs: result };
}

/**
 * Convert OpenAI-format messages to Gemini contents.
 */
function toGemini(messages: ChatMessage[]): { system: string | null; contents: unknown[] } {
  let system: string | null = null;
  const contents: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
      continue;
    }

    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content ?? '' }] });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: unknown[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.tool_calls ?? []) {
        let args: unknown = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* noop */ }
        parts.push({ functionCall: { name: tc.function.name, args } });
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      // Resolve function name from tool_call_id
      let fnName = msg.tool_call_id ?? '';
      for (let i = messages.length - 1; i >= 0; i--) {
        const prev = messages[i];
        if (prev.role === 'assistant' && prev.tool_calls) {
          const tc = prev.tool_calls.find((t) => t.id === msg.tool_call_id);
          if (tc) { fnName = tc.function.name; break; }
        }
      }

      let respData: unknown;
      try {
        const parsed = JSON.parse(msg.content ?? '');
        respData = typeof parsed === 'object' ? parsed : { output: msg.content };
      } catch {
        respData = { output: msg.content ?? '' };
      }

      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: fnName, response: respData } }],
      });
    }
  }

  return { system, contents };
}

function toGeminiTools(): unknown[] {
  const declarations = TOOL_DEFINITIONS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: {
      ...t.function.parameters,
      type: (t.function.parameters.type as string)?.toUpperCase() ?? 'OBJECT',
    },
  }));
  return [{ function_declarations: declarations }];
}

// ---------------------------------------------------------------------------
// Tool execution helper
// ---------------------------------------------------------------------------

async function executeTool(
  ws: WSSender,
  name: string,
  args: Record<string, unknown>,
  messages: ChatMessage[],
  toolCallId: string
): Promise<void> {
  await wsSend(ws, {
    type: 'agent_event',
    tool_call: { name, args },
  });
  console.log(`[DISPATCH] TOOL: ${name}`);

  let result: string;
  try {
    const fn = TOOL_MAP[name];
    result = fn ? await fn(args) : JSON.stringify({ error: `Unknown tool: ${name}` });
    console.log(`[DISPATCH] RESULT: ${name} ok (${result.length} chars)`);
  } catch (err) {
    result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    console.error(`[DISPATCH] RESULT: ${name} FAIL:`, err);
  }

  await wsSend(ws, {
    type: 'agent_event',
    tool_result: {
      name,
      response: name === 'runCadCode' ? result : result.slice(0, 1000),
    },
  });

  messages.push({
    role: 'tool',
    content: result,
    tool_call_id: toolCallId,
  });
}

// ---------------------------------------------------------------------------
// Dispatcher: OpenAI chat/completions
// ---------------------------------------------------------------------------

async function dispatchChat(
  ws: WSSender,
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  baseUrl: string = ZEN_BASE
): Promise<void> {
  const endpoint = `${baseUrl}/chat/completions`;

  for (let step = 0; step < MAX_TOOL_ITERATIONS; step++) {
    let data: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            temperature: 0.2,
            stream: false,
          }),
          signal: AbortSignal.timeout(300_000),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        }

        data = (await resp.json()) as Record<string, unknown>;
        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DISPATCH] chat error (attempt ${attempt + 1}/3): ${errMsg.slice(0, 120)}`);
        if (attempt < 2) await sleep(2 ** (attempt + 1) * 1000);
        else {
          await wsSend(ws, { type: 'error', error: errMsg.slice(0, 300) });
          return;
        }
      }
    }

    if (!data) return;

    const choice = (data as { choices?: Array<{ message?: Record<string, unknown>; finish_reason?: string }> })
      .choices?.[0];
    if (!choice) {
      await wsSend(ws, { type: 'error', error: 'No choices in response' });
      return;
    }

    const assistantMsg = choice.message as {
      content?: string | null;
      tool_calls?: ToolCall[];
    };

    const toolCalls = assistantMsg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      // No tool calls — send text and done
      if (assistantMsg.content) {
        messages.push({ role: 'assistant', content: assistantMsg.content });
        await wsSend(ws, { type: 'agent_event', text: assistantMsg.content });
      }
      return;
    }

    // Has tool calls — append assistant message and execute tools
    messages.push({
      role: 'assistant',
      content: assistantMsg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* noop */ }
      await executeTool(ws, tc.function.name, args, messages, tc.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatcher: Anthropic Messages
// ---------------------------------------------------------------------------

async function dispatchMessages(
  ws: WSSender,
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  baseUrl: string = ZEN_BASE
): Promise<void> {
  const endpoint = `${baseUrl}/messages`;

  for (let step = 0; step < MAX_TOOL_ITERATIONS; step++) {
    const { system, msgs } = toAnthropic(messages);

    const payload: Record<string, unknown> = {
      model,
      messages: msgs,
      tools: ANTHROPIC_TOOLS,
      max_tokens: 8192,
    };
    if (system) payload.system = system;

    let data: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(300_000),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        }

        data = (await resp.json()) as Record<string, unknown>;
        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DISPATCH] messages error (attempt ${attempt + 1}/3): ${errMsg.slice(0, 120)}`);
        if (attempt < 2) await sleep(2 ** (attempt + 1) * 1000);
        else {
          await wsSend(ws, { type: 'error', error: errMsg.slice(0, 300) });
          return;
        }
      }
    }

    if (!data) return;

    const stopReason = (data as { stop_reason?: string }).stop_reason ?? 'end_turn';
    const contentBlocks = (data as { content?: Array<Record<string, unknown>> }).content ?? [];

    const textBlocks = contentBlocks.filter((b) => b.type === 'text');
    const toolBlocks = contentBlocks.filter((b) => b.type === 'tool_use');

    // Build assistant message in OpenAI format
    const assistantMsg: ChatMessage = { role: 'assistant', content: null };
    if (textBlocks.length > 0) {
      const text = textBlocks.map((b) => b.text as string).join(' ');
      assistantMsg.content = text;
      if (stopReason !== 'tool_use') {
        await wsSend(ws, { type: 'agent_event', text });
      }
    }

    if (toolBlocks.length > 0) {
      assistantMsg.tool_calls = toolBlocks.map((b) => ({
        id: b.id as string,
        type: 'function' as const,
        function: {
          name: b.name as string,
          arguments: JSON.stringify(b.input ?? {}),
        },
      }));
    }

    messages.push(assistantMsg);

    if (stopReason === 'end_turn' || toolBlocks.length === 0) return;

    for (const b of toolBlocks) {
      const name = b.name as string;
      const input = (b.input ?? {}) as Record<string, unknown>;
      await executeTool(ws, name, input, messages, b.id as string);
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatcher: Gemini via Zen
// ---------------------------------------------------------------------------

async function dispatchGemini(
  ws: WSSender,
  messages: ChatMessage[],
  model: string,
  apiKey: string
): Promise<void> {
  const endpoint = `${ZEN_BASE}/models/${model}:generateContent`;

  for (let step = 0; step < MAX_TOOL_ITERATIONS; step++) {
    const { system, contents } = toGemini(messages);

    const payload: Record<string, unknown> = { contents };
    if (system) payload.system_instruction = { parts: [{ text: system }] };
    payload.tools = toGeminiTools();

    let data: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(300_000),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        }

        data = (await resp.json()) as Record<string, unknown>;
        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DISPATCH] gemini error (attempt ${attempt + 1}/3): ${errMsg.slice(0, 120)}`);
        if (attempt < 2) await sleep(2 ** (attempt + 1) * 1000);
        else {
          await wsSend(ws, { type: 'error', error: errMsg.slice(0, 300) });
          return;
        }
      }
    }

    if (!data) return;

    const candidates = (data as { candidates?: Array<Record<string, unknown>> }).candidates ?? [];
    if (candidates.length === 0) {
      await wsSend(ws, { type: 'error', error: 'No candidates in Gemini response' });
      return;
    }

    const candidate = candidates[0];
    const finish = (candidate.finishReason as string) ?? 'STOP';
    const content = (candidate.content ?? {}) as { parts?: Array<Record<string, unknown>> };
    const parts = content.parts ?? [];

    const textParts = parts.filter((p) => 'text' in p);
    const fnCallParts = parts.filter((p) => 'functionCall' in p);

    // Build assistant message
    const assistantMsg: ChatMessage = { role: 'assistant', content: null };

    if (textParts.length > 0) {
      const text = textParts.map((p) => p.text as string).join(' ');
      assistantMsg.content = text;
      if (finish !== 'TOOL_CALL') {
        await wsSend(ws, { type: 'agent_event', text });
      }
    }

    if (fnCallParts.length > 0) {
      assistantMsg.tool_calls = fnCallParts.map((p, i) => {
        const fc = p.functionCall as { name: string; args?: unknown };
        return {
          id: `call_${step}_${i}`,
          type: 'function' as const,
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args ?? {}),
          },
        };
      });
    }

    messages.push(assistantMsg);

    if (finish !== 'TOOL_CALL' || fnCallParts.length === 0) return;

    // Execute tools
    for (let i = 0; i < fnCallParts.length; i++) {
      const fc = fnCallParts[i].functionCall as { name: string; args?: unknown };
      const name = fc.name;
      const args = (fc.args ?? {}) as Record<string, unknown>;
      const tcId = `call_${step}_${i}`;

      await executeTool(ws, name, args, messages, tcId);
    }
  }
}

// ---------------------------------------------------------------------------
// Main agent loop
// ---------------------------------------------------------------------------

/**
 * Orchestrate a full agent interaction:
 * 1. Classify tier and build augmented prompt
 * 2. Handle image pipeline if needed
 * 3. Route to correct dispatcher
 * 4. Send done event
 */
export async function runAgentLoop(
  ws: WSSender,
  provider: string,
  sessionId: string,
  userMessage: string,
  imageData?: string
): Promise<void> {
  const effectiveProvider = provider || DEFAULT_PROVIDER;
  const config = MODEL_CONFIGS[effectiveProvider];

  if (!config) {
    await wsSend(ws, {
      type: 'error',
      error: `Provider '${effectiveProvider}' not found. Choose one: ${Object.keys(MODEL_CONFIGS).join(', ')}`,
    });
    return;
  }

  const { model, api } = config;
  const apiKey = process.env.OPENCODE_API_KEY ?? '';
  const baseUrl = config.base_url ?? ZEN_BASE;

  // Tier classification
  const { augmentedText, tier } = assemblePrompt(userMessage);
  setCurrentTier(tier);
  console.log(`[DISPATCH] TIER=${tier} provider=${effectiveProvider} model=${model} session=${sessionId.slice(0, 12)}`);

  // Image pipeline
  let finalText = augmentedText;
  let finalImage = imageData;

  if (needsImagePipeline(effectiveProvider, !!imageData)) {
    console.log(`[DISPATCH] IMAGE PIPELINE: dual analysis...`);
    await wsSend(ws, {
      type: 'agent_event',
      tool_call: { name: 'analyze_image', args: { providers: ['kimi-go', 'minimax-m3-go'] } },
    });

    const result = await analyzeImageDual(imageData!, userMessage);

    if (result) {
      finalText = result.augmentedText;
      finalImage = undefined; // Image already analyzed
      await wsSend(ws, {
        type: 'agent_event',
        tool_result: { name: 'analyze_image', response: `Dos análisis completados.` },
      });
      await wsSend(ws, {
        type: 'agent_event',
        text: 'Imagen analizada por dos ingenieros. Generando CAD con consenso...',
      });
    } else {
      finalImage = undefined;
      await wsSend(ws, {
        type: 'agent_event',
        text: 'No se pudo analizar la imagen con ningún modelo. Intentando solo con el texto...',
      });
    }
  }

  // Get/create session
  setCurrentSession(sessionId);
  const session = getSession(sessionId);

  // Build user content (text + optional image)
  const userContent = finalImage
    ? _buildUserContent(finalText, finalImage)
    : finalText;

  session.messages.push({ role: 'user', content: userContent });

  // Route to dispatcher
  if (api === 'messages') {
    await dispatchMessages(ws, session.messages, model, apiKey, baseUrl);
  } else if (api === 'gemini') {
    await dispatchGemini(ws, session.messages, model, apiKey);
  } else {
    await dispatchChat(ws, session.messages, model, apiKey, baseUrl);
  }

  // Done
  console.log(`[DISPATCH] Completed, sending done`);
  try {
    await wsSend(ws, { type: 'done', tier });
  } catch {
    // WebSocket may be closed
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _buildUserContent(text: string, imageData: string): string {
  // For now, prepend image analysis context as text.
  // The image was already analyzed by the pipeline.
  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
