import { create } from "zustand";
import type { ShapeData } from "@/cad";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

interface CadStore {
  shapes: Record<string, ShapeData>;
  messages: ChatMessage[];
  isProcessing: boolean;
  currentUnit: "mm" | "in";
  glbUrl: string | null;
  stepUrl: string | null;
  stlUrl: string | null;

  addMessage: (msg: ChatMessage) => void;
  setProcessing: (v: boolean) => void;
  addShape: (data: ShapeData) => void;
  updateShape: (id: string, updates: Partial<ShapeData>) => void;
  setShapes: (shapes: Record<string, ShapeData>) => void;
  setGlbUrl: (url: string | null) => void;
  setStepUrl: (url: string | null) => void;
  setStlUrl: (url: string | null) => void;
  clearScene: () => void;
}

export const useCadStore = create<CadStore>((set) => ({
  shapes: {},
  messages: [],
  isProcessing: false,
  currentUnit: "mm",
  glbUrl: null,
  stepUrl: null,
  stlUrl: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setProcessing: (v) => set({ isProcessing: v }),

  addShape: (data) =>
    set((s) => ({ shapes: { ...s.shapes, [data.id]: data } })),

  updateShape: (id, updates) =>
    set((s) => {
      const shape = s.shapes[id];
      if (!shape) return s;
      return { shapes: { ...s.shapes, [id]: { ...shape, ...updates } } };
    }),

  setShapes: (shapes) => set({ shapes }),

  setGlbUrl: (url) => set({ glbUrl: url }),
  setStepUrl: (url) => set({ stepUrl: url }),
  setStlUrl: (url) => set({ stlUrl: url }),

  clearScene: () => set({ shapes: {}, messages: [], glbUrl: null, stepUrl: null, stlUrl: null }),
}));
