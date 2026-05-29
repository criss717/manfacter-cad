"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";
import { autoSaveConversation } from "@/store/autoSave";

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
  read_reference: "Consultando documentacion...",
  run_cad_code: "Generando geometria 3D...",
  inspect_geometry: "Verificando medidas...",
  make_snapshot: "Renderizando vista previa...",
  list_outputs: "Listando archivos...",
};

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

  const getAgentUrl = useCallback(() => {
    return provider === "gemini" ? getWsUrl("/ws/gemini", "8002") : getWsUrl("/ws/openai", "8003");
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
      setStreamingText("Conectando...");

      const enriched = buildEnrichedMessage(content);
      const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content, timestamp: Date.now(), image: imageBase64 };
      addMessage(userMsg);

      let responseText = "";
      let attemptCount = 0;

      try {
        const ws = await ensureConnection();
        if (!ws) {
          setStreamingText("");
          addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "No se pudo conectar al agente.", timestamp: Date.now() });
          return;
        }

        setStreamingText("Analizando...");
        ws.send(JSON.stringify({ message: enriched, image: imageBase64 || null, session_id: sessionIdRef.current }));

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
                if (responseText) {
                  addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: responseText.trim(), timestamp: Date.now() });
                }
                ws.removeEventListener("message", handler);
                resolve();
                return;
              }

              if (msg.type === "agent_event") {
                if (msg.tool_call) {
                  if (msg.tool_call.name === "run_cad_code") {
                    attemptCount++;
                    if (attemptCount > 2) setComplexModalOpen(true);
                    setStreamingText(`Generando (intento ${attemptCount})...`);
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
                        setStreamingText("Geometria lista!");
                        const base = getBackendUrl();
                        if (data.glb_url) setGlbUrl(`${base}${String(data.glb_url)}`);
                        if (data.step_url) setStepUrl(`${base}${String(data.step_url)}`);
                        if (data.stl_url) setStlUrl(`${base}${String(data.stl_url)}`);
                        if (data.code) setLastCode(String(data.code), {});
                      }
                    } catch {
                      const response = String(r.response || "");
                      const glbMatch = response.match(/glb_url["'\s:]+["']?(\/[^"'\s,}]+)/);
                      if (glbMatch) { setGlbUrl(`${getBackendUrl()}${glbMatch[1]}`); setStreamingText("Geometria lista!"); }
                    }
                  }
                }

                if (msg.text) {
                  responseText += msg.text;
                  setStreamingText(msg.text.slice(-150));
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
    [ addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, setLastCode, ensureConnection, buildEnrichedMessage, setComplexModalOpen]
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
