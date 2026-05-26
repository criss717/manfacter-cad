import { create } from "zustand";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  image?: string;
}

export interface CadParams {
  [name: string]: number;
}

export interface ShapeData {
  id: string;
  name: string;
  type: string;
  primitiveType?: string;
  dimensions?: Record<string, number>;
  children: string[];
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scaleVec: [number, number, number];
  visible: boolean;
}

interface CadStore {
  shapes: Record<string, ShapeData>;
  messages: ChatMessage[];
  isProcessing: boolean;
  currentUnit: "mm" | "in";
  glbUrl: string | null;
  stepUrl: string | null;
  stlUrl: string | null;
  lastCode: string | null;
  lastParams: CadParams;
  modelColor: string;
  sceneBackground: string;

  addMessage: (msg: ChatMessage) => void;
  setProcessing: (v: boolean) => void;
  addShape: (data: ShapeData) => void;
  updateShape: (id: string, updates: Partial<ShapeData>) => void;
  setShapes: (shapes: Record<string, ShapeData>) => void;
  setGlbUrl: (url: string | null) => void;
  setStepUrl: (url: string | null) => void;
  setStlUrl: (url: string | null) => void;
  setLastCode: (code: string | null, params: CadParams) => void;
  updateParam: (name: string, value: number) => void;
  setModelColor: (color: string) => void;
  setSceneBackground: (color: string) => void;
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
  lastCode: null,
  lastParams: {},
  modelColor: "#0080ff",
  sceneBackground: "#f5f5f7",

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

  setLastCode: (code, params) => set({ lastCode: code, lastParams: params }),

  updateParam: (name, value) =>
    set((s) => ({
      lastParams: { ...s.lastParams, [name]: value },
    })),

  setModelColor: (color) => set({ modelColor: color }),
  setSceneBackground: (color) => set({ sceneBackground: color }),

  clearScene: () => set({
    shapes: {}, messages: [], glbUrl: null, stepUrl: null, stlUrl: null,
    lastCode: null, lastParams: {}, modelColor: "#0080ff", sceneBackground: "#f5f5f7",
  }),
}));
