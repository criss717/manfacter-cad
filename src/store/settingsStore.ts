import { create } from "zustand";

export type LLMProvider = "gemini" | "deepseek" | "openai";

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
      if (["gemini", "deepseek", "openai"].includes(data.provider)) {
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
