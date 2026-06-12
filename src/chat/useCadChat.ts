"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCadStore, type CadTier, type ChatMessage } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";
import { autoSaveConversation } from "@/store/autoSave";

// ---------------------------------------------------------------------------
// WS URL resolution
// ---------------------------------------------------------------------------

/**
 * Feature flag: CAD_ENGINE controls which backend to use.
 * - "manifold" (default): New TypeScript backend via Next.js WS
 * - "build123d": Legacy Python backend (fallback during transition)
 */
function getCadEngine(): string {
  return process.env.NEXT_PUBLIC_CAD_ENGINE ?? "manifold";
}

function getWsUrl(): string {
  const engine = getCadEngine();

  // New ForgeCAD engine — single WS endpoint via Next.js
  if (engine === "manifold") {
    const configured = process.env.NEXT_PUBLIC_CAD_WS_URL;
    if (configured) return configured;
    // Fallback: same-origin WebSocket
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.host}/api/cad/ws`;
    }
    return "ws://localhost:3000/api/cad/ws";
  }

  // Legacy build123d engine — multi-port routing
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/openai`;
}

// ---------------------------------------------------------------------------
// Tool name mapping (snake_case ↔ camelCase) for backward compat
// ---------------------------------------------------------------------------

const TOOL_NAMES: Record<string, string> = {
  // Old → new
  run_cad_code: "runCadCode",
  inspect_geometry: "inspectCadModel",
  make_snapshot: "inspectCadModel", // snapshots now auto-generated
  list_outputs: "listOutputs",
  read_reference: "readReference",
  analyze_image: "analyze_image",
  // New names (pass-through)
  runCadCode: "runCadCode",
  inspectCadModel: "inspectCadModel",
  listOutputs: "listOutputs",
  readReference: "readReference",
};

function normalizeToolName(name: string): string {
  return TOOL_NAMES[name] ?? name;
}

// ---------------------------------------------------------------------------
// Progress / status messages
// ---------------------------------------------------------------------------

const PROGRESS: Record<string, string> = {
  // New camelCase tool names
  readReference: "Leyendo documentacion de referencia...",
  runCadCode: "Generando codigo CAD...",
  inspectCadModel: "Inspeccionando modelo...",
  listOutputs: "Listando archivos generados...",
  analyze_image: "Analizando la imagen...",
  // Old snake_case (backward compat during transition)
  read_reference: "Leyendo documentacion de referencia...",
  run_cad_code: "Generando codigo CAD...",
  inspect_geometry: "Verificando medidas y calidad...",
  make_snapshot: "Renderizando vista previa...",
  list_outputs: "Listando archivos generados...",
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

  const ensureConnection = useCallback(async (): Promise<WebSocket | null> => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) return existing;

    const wsUrl = getWsUrl();

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
  }, []);

  const buildEnrichedMessage = useCallback((content: string): string => {
    if (firstMessageRef.current && lastCode) {
      firstMessageRef.current = false;
      const userMessages = messages.filter((m) => m.role === "user");
      if (userMessages.length >= 1) {
        return `Actualmente tienes esta pieza CAD generada:\n\`\`\`javascript\n${lastCode}\n\`\`\`\n\nAhora el usuario pide: ${content}`;
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
                  const toolName = normalizeToolName(msg.tool_call.name);
                  if (toolName === "runCadCode") {
                    attemptCount++;
                    if (attemptCount > 2) setComplexModalOpen(true);
                    setStreamingText(`Generando geometria 3D (intento ${attemptCount})...`);
                  } else {
                    if (toolName === "readReference") {
                      setComplexModalOpen(true);
                    }
                    setStreamingText(PROGRESS[toolName] || PROGRESS[msg.tool_call.name] || toolName);
                  }
                }

                if (msg.tool_result) {
                  const toolName = normalizeToolName(msg.tool_result.name);
                  const r = msg.tool_result;
                  if (toolName === "runCadCode") {
                    try {
                      let data: Record<string, unknown>;
                      if (typeof r.response === "string") {
                        data = JSON.parse(r.response);
                      } else {
                        data = r.response;
                      }
                      if (data.ok) {
                        setStreamingText("Geometria generada correctamente!");
                        // Support both camelCase (new) and snake_case (legacy) fields
                        const glbPath = (data.glbUrl ?? data.glb_url) as string | undefined;
                        const stepPath = (data.stepUrl ?? data.step_url) as string | undefined;
                        const stlPath = (data.stlUrl ?? data.stl_url) as string | undefined;
                        // For manifold engine, URLs are already relative paths (/api/cad/output/...)
                        // No base URL prefix needed — Next.js serves them from same origin
                        if (glbPath) setGlbUrl(glbPath);
                        if (stepPath) setStepUrl(stepPath);
                        if (stlPath) setStlUrl(stlPath);
                        if (data.code) setLastCode(String(data.code), {});
                      }
                    } catch {
                      const response = String(r.response || "");
                      // Support both camelCase and snake_case in raw text
                      const glbMatch = response.match(/(?:glbUrl|glb_url)["'\s:]+["']?(\/[^"'\s,}]+)/);
                      if (glbMatch) { setGlbUrl(glbMatch[1]); setStreamingText("Geometria generada correctamente!"); }
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
    [ addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, setLastCode, ensureConnection, buildEnrichedMessage, setComplexModalOpen, provider]
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

  return { messages, sendMessage, cancel, isProcessing, streamingText };
}
