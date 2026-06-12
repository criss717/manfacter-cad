/**
 * ForgeCAD AI agent — barrel export.
 *
 * Re-exports all public APIs from the agent module.
 */

// Types
export type {
  Provider,
  Tier,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  AnthropicToolDefinition,
  ProviderConfig,
  Session,
  WSMessage,
  WSEvent,
  WSError,
  WSDone,
  WSReady,
  RunCadCodeResult,
  InspectResult,
  ListOutputsResult,
} from './types';

// Prompt
export {
  CAD_AGENT_PROMPT,
  GOTCHAS,
  GOTCHAS_VERSION,
  SIMPLE_KEYWORDS,
  COMPLEX_KEYWORDS,
  FEATURE_KEYWORDS,
  classifyTier,
  buildTierDirective,
  assemblePrompt,
} from './prompt';

// Session
export {
  SESSIONS,
  getSession,
  addMessage,
  cleanupSessions,
  startSessionCleanup,
  stopSessionCleanup,
} from './session';

// Tools
export {
  TOOL_DEFINITIONS,
  ANTHROPIC_TOOLS,
  TOOL_MAP,
  _attemptCounts,
  setCurrentSession,
  setCurrentTier,
  releaseSessionResources,
} from './tools';

// Dispatch
export {
  MODEL_CONFIGS,
  runAgentLoop,
} from './dispatch';

// Image analysis
export {
  MODELS_WITH_VISION,
  analyzeImageKimi,
  analyzeImageMiniMax,
  needsImagePipeline,
  analyzeImageDual,
} from './image-analysis';

// Server
export {
  handleConnection,
  handleMessage,
  handleDisconnect,
  attachHandlers,
} from './server';
export type { AgentWebSocket, AgentRequest } from './server';
