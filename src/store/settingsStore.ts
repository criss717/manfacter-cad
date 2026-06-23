import { create } from "zustand";

export type LLMProvider =
  | "gemini"           // Gemini 3.5 Flash — Google API key (ADK)
  | "gemini-pro-google" // Gemini 3.1 Pro  — Google API key (ADK)
  | "gemini-2.5-pro"   // Gemini 2.5 Pro  — Google API key (ADK)
  | "gemini-pro"        // Gemini 3.1 Pro  — via OpenCode Zen (port 8003)
  | "sonnet"
  | "opus"
  | "qwen"
  | "minimax"
  | "glm"
  | "kimi"
  | "deepseek"
  | "mimo-v2.5-free"        // MiMo V2.5 Free  — Zen (multimodal)
  | "deepseek-v4-flash-free" // DeepSeek V4 Flash Free — Zen
  | "nemotron-3-ultra-free" // Nemotron 3 Ultra Free — Zen
  | "deepseek-v4-pro-go"  // DeepSeek V4 Pro — GO (coding beast)
  | "mimo-v2.5-pro-go"    // MiMo V2.5 Pro — GO (omnimodal)
  | "qwen3.7-max-go"      // Qwen 3.7 Max — GO (math/reasoning)
  | "kimi-go"             // Kimi K2.6 — GO (balanced)
  | "kimi-go-2.7"         // Kimi 2.7 — GO (balanced)
  | "glm-go"              // GLM 5.1 — GO (stable)
  | "glm5.2-go"           // GLM 5.2 — GO (stable)
  | "minimax-m3-go"       // MiniMax M3 — GO (fast)
  | "nvidia-cosmos"     // NVIDIA Cosmos — physics/geometry expert (NVIDIA API key)
  | "deepseek-v4-pro-sdk"; // DeepSeek V4 Pro — Agents SDK (experimental, port 8004)

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>([
  "gemini", "gemini-pro-google", "gemini-2.5-pro", "gemini-pro",
  "sonnet", "opus", "qwen", "minimax", "glm", "kimi", "deepseek",
  "mimo-v2.5-free", "deepseek-v4-flash-free", "nemotron-3-ultra-free",
  "deepseek-v4-pro-go", "mimo-v2.5-pro-go", "qwen3.7-max-go",
  "kimi-go", "kimi-go-2.7", "glm-go", "glm5.2-go", "minimax-m3-go",
  "nvidia-cosmos", "deepseek-v4-pro-sdk",
]);

interface SettingsStore {
  provider: LLMProvider;
  setProvider: (p: LLMProvider) => void;
}

const STORAGE_KEY = "manfactercad_settings";

function loadProvider(): LLMProvider {
  if (typeof window === "undefined") return "gemini";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (VALID_PROVIDERS.has(data.provider)) {
        return data.provider as LLMProvider;
      }
    }
  } catch { }
  return "gemini";
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  provider: loadProvider(),
  setProvider: (p) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: p }));
    }
    set({ provider: p });
  },
}));
