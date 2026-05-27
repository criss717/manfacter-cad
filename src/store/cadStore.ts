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
  stepUrls: string[];
  stlUrls: string[];
  lastCode: string | null;
  lastParams: CadParams;
  modelColor: string;
  sceneBackground: string;
  pendingGlbUrl: string | null;

  addMessage: (msg: ChatMessage) => void;
  setProcessing: (v: boolean) => void;
  addShape: (data: ShapeData) => void;
  updateShape: (id: string, updates: Partial<ShapeData>) => void;
  setShapes: (shapes: Record<string, ShapeData>) => void;
  setGlbUrl: (url: string | null) => void;
  setStepUrl: (url: string | null) => void;
  setStlUrl: (url: string | null) => void;
  addUrls: (glb: string | null, step: string | null, stl: string | null) => void;
  commitPendingGlb: () => void;
  setLastCode: (code: string | null, params: CadParams) => void;
  updateParam: (name: string, value: number) => void;
  setModelColor: (color: string) => void;
  setSceneBackground: (color: string) => void;
  bumpProjectRefresh: () => void;
  projectRefreshKey: number;
  clearScene: () => void;
}

export const useCadStore = create<CadStore>((set) => ({
  shapes: {},
  messages: [
    {
      id: "msg_welcome",
      role: "assistant",
      content: "¡Hola! Soy tu ingeniero de Manfacter especializado en fabricación digital e impresión 3D. Si necesitas asesoramiento sobre materiales, tolerancias, diseño para impresión o quieres que modele alguna pieza en 3D, aquí estoy para ayudarte. ¿En qué puedo colaborar contigo hoy?",
      timestamp: Date.now(),
    },
  ],
  isProcessing: false,
  currentUnit: "mm",
  glbUrl: null,
  stepUrl: null,
  stlUrl: null,
  stepUrls: [],
  stlUrls: [],
  lastCode: null,
  lastParams: {},
  modelColor: "#0080ff",
  sceneBackground: "#f5f5f7",
  pendingGlbUrl: null,

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

  addUrls: (glb, step, stl) => set((s) => ({
    stepUrls: step ? [...s.stepUrls.filter(u => u !== step), step] : s.stepUrls,
    stlUrls: stl ? [...s.stlUrls.filter(u => u !== stl), stl] : s.stlUrls,
    pendingGlbUrl: glb || s.pendingGlbUrl,
  })),

  commitPendingGlb: () => set((s) => ({ glbUrl: s.pendingGlbUrl || s.glbUrl, pendingGlbUrl: null })),

  setLastCode: (code, params) => set({ lastCode: code, lastParams: params }),

  updateParam: (name, value) =>
    set((s) => ({
      lastParams: { ...s.lastParams, [name]: value },
    })),

  setModelColor: (color) => set({ modelColor: color }),
  setSceneBackground: (color) => set({ sceneBackground: color }),

  projectRefreshKey: 0,
  bumpProjectRefresh: () => set((s) => ({ projectRefreshKey: s.projectRefreshKey + 1 })),

  clearScene: () => set({
    shapes: {},
    messages: [
      {
        id: "msg_welcome",
        role: "assistant",
        content: "¡Hola! Soy tu ingeniero de Manfacter especializado en fabricación digital e impresión 3D. Si necesitas asesoramiento sobre materiales, tolerancias, diseño para impresión o quieres que modele alguna pieza en 3D, aquí estoy para ayudarte. ¿En qué puedo colaborar contigo hoy?",
        timestamp: Date.now(),
      },
    ],
    glbUrl: null,
    stepUrl: null,
    stlUrl: null,
    stepUrls: [],
    stlUrls: [],
    lastCode: null,
    lastParams: {},
    modelColor: "#0080ff",
    sceneBackground: "#f5f5f7",
  }),
}));
