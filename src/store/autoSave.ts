import { useCadStore } from "./cadStore";

const AUTO_SAVE_KEY = "manfactercad_autosave";

export function autoSaveConversation() {
  if (typeof window === "undefined") return;
  try {
    const s = useCadStore.getState();
    const msgs = s.messages.filter((m) => m.role !== "system");
    if (msgs.length <= 1) return;
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
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(snapshot));
  } catch { /* quota exceeded or private browsing */ }
}

export function loadAutoSaved(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot.messages || snapshot.messages.length <= 1) return false;

    const restored = snapshot.messages.map(
      (m: { role: string; content: string; timestamp?: number; image?: string }, idx: number) => ({
        id: `autosave_${idx}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        image: m.image,
      })
    );

    useCadStore.setState({
      messages: restored,
      lastCode: snapshot.lastCode || null,
      lastParams: snapshot.lastParams || {},
      glbUrl: snapshot.glbUrl || null,
      stepUrl: snapshot.stepUrl || null,
      stlUrl: snapshot.stlUrl || null,
      stepUrls: snapshot.stepUrls || [],
      stlUrls: snapshot.stlUrls || [],
      modelColor: snapshot.modelColor || "#0080ff",
      sceneBackground: snapshot.sceneBackground || "#f5f5f7",
    });
    return true;
  } catch {
    return false;
  }
}
