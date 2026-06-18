"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCadStore, type CadTier, type ChatMessage, type SelectedFace } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";
import { autoSaveConversation } from "@/store/autoSave";

/** WebSocket message sent to backend when user clicks a face. */
export interface FacePickMessage {
  type: "face_pick";
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  scale: number;
  modelId: string;
  session_id: string;
}

/** WebSocket message received from backend with face match result. */
export interface FacePickResultMessage {
  type: "face_pick_result";
  faceIndex: number;
  description: string;
  selector: string;
  confidence: number;
  matches?: Array<{ index: number; confidence: number; selector: string }>;
  ambiguous?: boolean;
  error?: string;
}

function getWsUrl(path: string, directPort: string): string {
  if (process.env.NEXT_PUBLIC_PROXY) {
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}${path}`;
  }
  const host = process.env.NEXT_PUBLIC_BACKEND_HOST ?? "127.0.0.1";
  return `ws://${host}:${directPort}`;
}

function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_PROXY) {
    return "";
  }
  const host = process.env.NEXT_PUBLIC_BACKEND_HOST ?? "127.0.0.1";
  return `http://${host}:8000`;
}

const PROGRESS: Record<string, string> = {
  read_reference: "Leyendo documentacion de referencia...",
  run_cad_code: "Generando codigo CAD...",
  inspect_geometry: "Verificando medidas y calidad...",
  make_snapshot: "Renderizando vista previa...",
  list_outputs: "Listando archivos generados...",
  analyze_image: "Analizando la imagen...",
};

const WAITING_MESSAGES: Record<string, string> = {
  default: "Esperando respuesta del servidor...",
  model_processing: "El modelo esta procesando tu solicitud...",
  tool_execution: "Ejecutando herramienta: {tool_name}...",
  waiting_for_api: "Comunicando con el servicio de IA...",
  analyzing_response: "Analizando la respuesta del modelo...",
};

const VALID_TIERS: ReadonlySet<CadTier> = new Set<CadTier>(["SIMPLE", "MODERATE", "COMPLEX"]);

function parseTier(value: unknown): CadTier | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase() as CadTier;
  return VALID_TIERS.has(upper) ? upper : undefined;
}

export function useCadChat() {
  const messages = useCadStore((s) => s.messages);
  const addMessage = useCadStore((s) => s.addMessage);
  const setProcessing = useCadStore((s) => s.setProcessing);
  const isProcessing = useCadStore((s) => s.isProcessing);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
  const setLastCode = useCadStore((s) => s.setLastCode);
  const lastCode = useCadStore((s) => s.lastCode);
  const resetSessionKey = useCadStore((s) => s.resetSessionKey);
  const cancelRequestKey = useCadStore((s) => s.cancelRequestKey);
  const setComplexModalOpen = useCadStore((s) => s.setComplexModalOpen);
  const setCurrentModelId = useCadStore((s) => s.setCurrentModelId);
  const setSelectedFace = useCadStore((s) => s.setSelectedFace);
  const provider = useSettingsStore((s) => s.provider);
  const [streamingText, setStreamingText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>("");
  const doneRef = useRef(false);
  const firstMessageRef = useRef(true);
  const cancelKeyRef = useRef(cancelRequestKey);

  const cancel = useCallback(() => {
    doneRef.current = true;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch {}
    }
    wsRef.current = null;
    sessionIdRef.current = "";
    firstMessageRef.current = true;
    setProcessing(false);
    setStreamingText("");
  }, [setProcessing]);

  const cancelRef = useRef(cancel);
  useEffect(() => { cancelRef.current = cancel; });

  useEffect(() => {
    if (cancelRequestKey !== cancelKeyRef.current) {
      cancelKeyRef.current = cancelRequestKey;
      cancelRef.current();
      setComplexModalOpen(false);
    }
  }, [cancelRequestKey, setComplexModalOpen]);

  const getAgentUrl = useCallback(() => {
    // gemini / gemini-pro-google / gemini-1.5-* → ADK server (Google API key, port 8002)
    // gemini-pro → OpenCode Zen server (port 8003)
    // Everything else → OpenCode Zen server (port 8003)
    const isGeminiDirect = provider === "gemini"
      || provider === "gemini-pro-google"
      || provider === "gemini-2.5-pro";
    if (isGeminiDirect) return getWsUrl("/ws/gemini", "8002");
    if (provider === "deepseek-v4-pro-sdk") return getWsUrl("/ws/sdk", "8004");
    return getWsUrl("/ws/openai", "8003");
  }, [provider]);

  const ensureConnection = useCallback(async (): Promise<WebSocket | null> => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) return existing;

    const wsUrl = getAgentUrl();

    try {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 30000);
        ws.onopen = () => { clearTimeout(t); resolve(); };
        ws.onerror = () => { clearTimeout(t); reject(new Error("connection")); };
      });
      wsRef.current = ws;
      if (!sessionIdRef.current) sessionIdRef.current = `sid_${Date.now()}`;
      return ws;
    } catch {
      wsRef.current = null;
      return null;
    }
  }, [getAgentUrl]);

  const sendFacePick = useCallback(
    async (position: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }, scale: number, modelId: string) => {
      const ws = await ensureConnection();
      if (!ws) return;
      const msg: FacePickMessage = {
        type: "face_pick",
        position,
        normal,
        scale,
        modelId,
        session_id: sessionIdRef.current,
      };
      ws.send(JSON.stringify(msg));
    },
    [ensureConnection]
  );

  const buildEnrichedMessage = useCallback((content: string): string => {
    if (firstMessageRef.current && lastCode) {
      firstMessageRef.current = false;
      const userMessages = messages.filter((m) => m.role === "user");
      if (userMessages.length >= 1) {
        return `Actualmente tienes esta pieza CAD generada:\n\`\`\`python\n${lastCode}\n\`\`\`\n\nAhora el usuario pide: ${content}`;
      }
    }
    firstMessageRef.current = false;
    return content;
  }, [lastCode, messages]);

  const sendMessage = useCallback(
    async (content: string, imageBase64?: string) => {
      if (isProcessing) return;
      doneRef.current = false;
      setProcessing(true);
      setStreamingText("Iniciando conexion...");

      const enriched = buildEnrichedMessage(content);
      const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content, timestamp: Date.now(), image: imageBase64 };
      addMessage(userMsg);

      let responseText = "";
      let attemptCount = 0;
      let currentTier: CadTier | undefined;

      try {
        const ws = await ensureConnection();
        if (!ws) {
          setStreamingText("");
          addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "No se pudo conectar al agente.", timestamp: Date.now() });
          return;
        }

        setStreamingText(WAITING_MESSAGES.default);
        ws.send(JSON.stringify({ message: enriched, image: imageBase64 || null, session_id: sessionIdRef.current, provider }));

        await new Promise<void>((resolve) => {
          let done = false;

          const fallbackTimeout = setTimeout(() => {
            if (!done) {
              done = true;
              setStreamingText("");
              addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "El agente tardo demasiado.", timestamp: Date.now() });
              resolve();
            }
          }, 1800000);

          const handler = (event: MessageEvent) => {
            if (doneRef.current) return;
            if (useCadStore.getState().cancelRequestKey !== cancelKeyRef.current) {
              doneRef.current = true;
              return;
            }
            try {
              const msg = JSON.parse(event.data);
              if (done) return;

              if (msg.type === "error") {
                done = true; clearTimeout(fallbackTimeout);
                setStreamingText("");
                setComplexModalOpen(false);
                addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: `Error: ${msg.error}`, timestamp: Date.now() });
                resolve();
                return;
              }

              if (msg.type === "face_pick_result") {
                const face: SelectedFace = {
                  faceIndex: msg.faceIndex,
                  description: msg.description || "",
                  selector: msg.selector || "",
                  confidence: msg.confidence || 0,
                  matches: msg.matches,
                  ambiguous: msg.ambiguous,
                };
                setSelectedFace(face);
                return;
              }

              if (msg.type === "done") {
                done = true; clearTimeout(fallbackTimeout);
                setStreamingText("");
                setComplexModalOpen(false);
                const tierFromDone = parseTier(msg.tier);
                if (tierFromDone) currentTier = tierFromDone;
                if (responseText) {
                  const finalMsg: ChatMessage = {
                    id: `msg_${Date.now()}_ai`,
                    role: "assistant",
                    content: responseText.trim(),
                    timestamp: Date.now(),
                  };
                  if (currentTier) finalMsg.tier = currentTier;
                  addMessage(finalMsg);
                } else {
                  setStreamingText("Proceso completado.");
                }
                ws.removeEventListener("message", handler);
                resolve();
                return;
              }

              if (msg.type === "agent_event") {
                const tierFromEvent = parseTier(msg.tier);
                if (tierFromEvent) currentTier = tierFromEvent;
                if (msg.tool_call) {
                  if (msg.tool_call.name === "run_cad_code") {
                    attemptCount++;
                    if (attemptCount > 2) setComplexModalOpen(true);
                    setStreamingText(`Generando geometria 3D (intento ${attemptCount})...`);
                  } else {
                    if (msg.tool_call.name === "read_reference") {
                      setComplexModalOpen(true);
                    }
                    setStreamingText(PROGRESS[msg.tool_call.name] || msg.tool_call.name);
                  }
                }

                if (msg.tool_result) {
                  const r = msg.tool_result;
                  if (r.name === "run_cad_code") {
                    try {
                      let data: Record<string, unknown>;
                      if (typeof r.response === "string") {
                        data = JSON.parse(r.response);
                      } else {
                        data = r.response;
                      }
                      if (data.ok) {
                        setStreamingText("Geometria generada correctamente!");
                        const base = getBackendUrl();
                        if (data.glb_url) setGlbUrl(`${base}${String(data.glb_url)}`);
                        if (data.step_url) setStepUrl(`${base}${String(data.step_url)}`);
                        if (data.stl_url) setStlUrl(`${base}${String(data.stl_url)}`);
                        if (data.code) setLastCode(String(data.code), {});
                        if (data.model_id) setCurrentModelId(String(data.model_id));
                      }
                    } catch {
                      const response = String(r.response || "");
                      const glbMatch = response.match(/glb_url["'\s:]+["']?(\/[^"'\s,}]+)/);
                      if (glbMatch) { setGlbUrl(`${getBackendUrl()}${glbMatch[1]}`); setStreamingText("Geometria generada correctamente!"); }
                    }
                  } else {
                    setStreamingText(WAITING_MESSAGES.model_processing);
                  }
                }

                if (msg.text) {
                  responseText += msg.text;
                  setStreamingText("Procesando respuesta...");
                }
              }
            } catch { /* ignore */ }
          };

          ws.addEventListener("message", handler);
        });
      } catch (err) {
        console.error("Chat error:", err);
        setStreamingText("");
        addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "Error de conexion.", timestamp: Date.now() });
      } finally {
        setProcessing(false);
        setStreamingText("");
        autoSaveConversation();
      }
    },
    [ addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, setLastCode, ensureConnection, buildEnrichedMessage, setComplexModalOpen, setCurrentModelId]
  );

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) { try { ws.close(); } catch {} }
      wsRef.current = null;
      sessionIdRef.current = "";
      firstMessageRef.current = true;
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch {}
    }
    wsRef.current = null;
    sessionIdRef.current = "";
    firstMessageRef.current = true;
    doneRef.current = true;
    setProcessing(false);
  }, [resetSessionKey, setProcessing]);

  return { messages, sendMessage, cancel, isProcessing, streamingText, sendFacePick, wsRef };
}
