import { useCadStore } from "./cadStore";

const PROJECTS_KEY = "manfactercad_projects";
let _currentProjectId: string | null = null;
const DEFAULT_MODEL_COLOR = "#0080ff";
const DEFAULT_BG = "#f5f5f7";

export function getCurrentProjectId() { return _currentProjectId; }

export interface SavedProject {
  id: string;
  name: string;
  msgCount: number;
  updatedAt: number;
}

export function getProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
  } catch { return []; }
}

function saveProjects(list: SavedProject[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

function makeName(msgs: { role: string; content: string }[]): string {
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content || "Conversacion").slice(0, 35);
  return text.length < 35 ? text : text + "...";
}

export function autoSaveConversation() {
  if (typeof window === "undefined") return;
  try {
    const s = useCadStore.getState();
    const msgs = s.messages.filter((m) => m.role !== "system");
    if (msgs.length <= 1) return;

    const id = _currentProjectId || `proj_${Date.now()}`;
    _currentProjectId = id;

    const name = makeName(msgs);
    const snapshot = {
      messages: msgs.slice(-50),
      lastCode: s.lastCode,
      lastParams: s.lastParams,
      glbUrl: s.glbUrl,
      stepUrl: s.stepUrl,
      stlUrl: s.stlUrl,
      stepUrls: s.stepUrls,
      stlUrls: s.stlUrls,
      modelColor: s.modelColor,
      sceneBackground: s.sceneBackground,
    };
    localStorage.setItem(`manfactercad_${id}`, JSON.stringify(snapshot));

    const projects = getProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx >= 0) {
      projects[idx].name = name;
      projects[idx].msgCount = msgs.length;
      projects[idx].updatedAt = Date.now();
    } else {
      projects.unshift({ id, name, msgCount: msgs.length, updatedAt: Date.now() });
    }
    saveProjects(projects);
    useCadStore.getState().bumpProjectRefresh();
  } catch { /* quota exceeded */ }
}

export function loadAutoSaved(): boolean {
  if (typeof window === "undefined") return false;
  const projects = getProjects();
  if (projects.length === 0) return false;

  const latest = projects[0];
  return loadProject(latest.id);
}

export function updateProjectColors() {
  if (typeof window === "undefined") return;
  const id = _currentProjectId;
  if (!id) return;
  try {
    const raw = localStorage.getItem(`manfactercad_${id}`);
    if (!raw) return;
    const snapshot = JSON.parse(raw);
    const s = useCadStore.getState();
    snapshot.modelColor = s.modelColor;
    snapshot.sceneBackground = s.sceneBackground;
    localStorage.setItem(`manfactercad_${id}`, JSON.stringify(snapshot));
  } catch {}
}

export function loadProject(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`manfactercad_${id}`);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot.messages?.length) return false;

    const restored = snapshot.messages.map(
      (m: { role: string; content: string; timestamp?: number; image?: string }, idx: number) => ({
        id: `restore_${Date.now()}_${idx}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        image: m.image,
      })
    );

    _currentProjectId = id;

    useCadStore.setState({
      messages: restored,
      lastCode: snapshot.lastCode || null,
      lastParams: snapshot.lastParams || {},
      glbUrl: snapshot.glbUrl || null,
      stepUrl: snapshot.stepUrl || null,
      stlUrl: snapshot.stlUrl || null,
      stepUrls: snapshot.stepUrls || [],
      stlUrls: snapshot.stlUrls || [],
      modelColor: snapshot.modelColor || DEFAULT_MODEL_COLOR,
      sceneBackground: snapshot.sceneBackground || DEFAULT_BG,
      shapes: {},
      isProcessing: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function newConversation() {
  if (typeof window === "undefined") return;
  _currentProjectId = null;
}

export function deleteProject(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`manfactercad_${id}`);
  saveProjects(getProjects().filter((p) => p.id !== id));
}
