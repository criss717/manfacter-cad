import { create } from "zustand";

export type LLMProvider =
  | "gemini"           // Gemini 3.5 Flash — Google API key (ADK)
  | "gemini-pro-google" // Gemini 3.1 Pro  — Google API key (ADK)
  | "gemini-pro"       // Gemini 3.1 Pro  — via OpenCode Zen (port 8003)
  | "sonnet"
  | "opus"
  | "qwen"
  | "minimax"
  | "glm"
  | "kimi"
  | "deepseek"
  | "mimo-v2.5-free"        // MiMo V2.5 Free  — Zen (multimodal)
  | "deepseek-v4-flash-free" // DeepSeek V4 Flash Free — Zen
  | "nemotron-3-ultra-free"; // Nemotron 3 Ultra Free — Zen

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>([
  "gemini", "gemini-pro-google", "gemini-pro",
  "sonnet", "opus", "qwen", "minimax", "glm", "kimi", "deepseek",
  "mimo-v2.5-free", "deepseek-v4-flash-free", "nemotron-3-ultra-free",
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
  } catch {}
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
