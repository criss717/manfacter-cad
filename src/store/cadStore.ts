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

const DEFAULT_COLOR = "#0080ff";
const DEFAULT_BG = "#f5f5f7";

interface CadStore {
  shapes: Record<string, unknown>;
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
  projectRefreshKey: number;
  chatInputFocusKey: number;

  addMessage: (msg: ChatMessage) => void;
  setProcessing: (v: boolean) => void;
  addShape: (data: unknown) => void;
  updateShape: (id: string, updates: Partial<unknown>) => void;
  setShapes: (shapes: Record<string, unknown>) => void;
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
  clearScene: () => void;
  focusChatInput: () => void;
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
  modelColor: DEFAULT_COLOR,
  sceneBackground: DEFAULT_BG,
  pendingGlbUrl: null,
  projectRefreshKey: 0,
  chatInputFocusKey: 0,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setProcessing: (v) => set({ isProcessing: v }),
  addShape: (data) => set((s) => ({ shapes: { ...s.shapes, [(data as Record<string, unknown>).id as string]: data } })),
  updateShape: (id, updates) => set((s) => {
    const shape = s.shapes[id];
    if (!shape) return s;
    return { shapes: { ...s.shapes, [id]: { ...shape, ...updates } } };
  }),
  setShapes: (shapes) => set({ shapes }),
  setGlbUrl: (url) => set({ glbUrl: url }),
  setStepUrl: (url) => set({ stepUrl: url }),
  setStlUrl: (url) => set({ stlUrl: url }),
  addUrls: (glb, step, stl) => set((s) => ({
    stepUrls: step ? [...s.stepUrls, step] : s.stepUrls,
    stlUrls: stl ? [...s.stlUrls, stl] : s.stlUrls,
  })),
  commitPendingGlb: () => set((s) => ({
    glbUrl: s.pendingGlbUrl || s.glbUrl,
    pendingGlbUrl: null,
  })),
  setLastCode: (code, params) => set({ lastCode: code, lastParams: params }),
  updateParam: (name, value) => set((s) => ({
    lastParams: { ...s.lastParams, [name]: value },
  })),
  setModelColor: (color) => {
    set({ modelColor: color });
  },
  setSceneBackground: (color) => {
    set({ sceneBackground: color });
  },
  bumpProjectRefresh: () => set((s) => ({ projectRefreshKey: s.projectRefreshKey + 1 })),
  focusChatInput: () => set((s) => ({ chatInputFocusKey: s.chatInputFocusKey + 1 })),
  clearScene: () => set((s) => ({
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
    modelColor: DEFAULT_COLOR,
    sceneBackground: DEFAULT_BG,
    chatInputFocusKey: s.chatInputFocusKey + 1,
  })),
}));
