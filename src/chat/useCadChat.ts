"use client";

import { useCallback, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";

const AGENT_URL = "ws://127.0.0.1:8002";
const BACKEND_URL = "http://127.0.0.1:8000";

const PROGRESS: Record<string, string> = {
  read_reference: "Leyendo documentacion...",
  run_cad_code: "Generando geometria 3D...",
  inspect_geometry: "Verificando medidas...",
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
  const [streamingText, setStreamingText] = useState("");

  const sendMessage = useCallback(
    async (content: string, _imageBase64?: string) => {
      if (isProcessing) return;
      setProcessing(true);
      setStreamingText("Agente iniciando...");

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      let responseText = "";
      let ws: WebSocket | null = null;

      try {
        ws = new WebSocket(AGENT_URL);

        await new Promise<void>((resolve, reject) => {
          if (!ws) { reject(new Error("No WebSocket")); return; }
          const timeout = setTimeout(() => reject(new Error("timeout")), 5000);
          ws.onopen = () => { clearTimeout(timeout); ws!.send(JSON.stringify({ message: content })); resolve(); };
          ws.onerror = () => { clearTimeout(timeout); reject(new Error("connection")); };
        });

        if (!ws) return;

        await new Promise<void>((resolve) => {
          let done = false;
          if (!ws) { resolve(); return; }

          const fallbackTimeout = setTimeout(() => {
            if (!done) {
              done = true;
              setStreamingText("");
              addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "El agente tardo demasiado. Intenta de nuevo.", timestamp: Date.now() });
              resolve();
            }
          }, 600000);

          ws!.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (done) return;

              if (msg.type === "error") {
                done = true;
                clearTimeout(fallbackTimeout);
                setStreamingText("");
                addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: `Error: ${msg.error}`, timestamp: Date.now() });
                resolve();
                return;
              }

              if (msg.type === "done") {
                done = true;
                clearTimeout(fallbackTimeout);
                setStreamingText("");
                if (responseText) {
                  addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: responseText.trim(), timestamp: Date.now() });
                }
                resolve();
                return;
              }

              if (msg.type === "agent_event") {
                if (msg.tool_call) {
                  const label = PROGRESS[msg.tool_call.name] || `Ejecutando ${msg.tool_call.name}...`;
                  setStreamingText(label);
                }

                if (msg.tool_result) {
                  const r = msg.tool_result;
                  if (r.name === "run_cad_code") {
                    setStreamingText("Procesando geometria...");
                    try {
                      let data: Record<string, unknown>;
                      if (typeof r.response === "string") {
                        data = JSON.parse(r.response);
                      } else {
                        data = r.response;
                      }
                      if (data.glb_url) {
                        const url = String(data.glb_url);
                        setGlbUrl(url.startsWith("http") ? url : `${BACKEND_URL}${url}`);
                      }
                      if (data.step_url) {
                        const url = String(data.step_url);
                        setStepUrl(url.startsWith("http") ? url : `${BACKEND_URL}${url}`);
                      }
                      if (data.stl_url) {
                        const url = String(data.stl_url);
                        setStlUrl(url.startsWith("http") ? url : `${BACKEND_URL}${url}`);
                      }
                      if (data.ok) setStreamingText("Geometria generada!");
                    } catch {
                      const response = String(r.response || "");
                      const glbMatch = response.match(/glb_url["'\s:]+["']?(\/[^"'\s,}]+)/);
                      if (glbMatch) {
                        setGlbUrl(`${BACKEND_URL}${glbMatch[1]}`);
                        setStreamingText("Geometria generada!");
                      }
                    }
                  } else {
                    setStreamingText(PROGRESS[r.name] || `${r.name} completado`);
                  }
                }

                if (msg.text) {
                  responseText += msg.text;
                  setStreamingText(msg.text.slice(-120));
                }
              }
            } catch { /* ignore malformed */ }
          };

          ws!.onclose = () => {
            if (!done) {
              done = true;
              clearTimeout(fallbackTimeout);
              setStreamingText("");
              resolve();
            }
          };
        });
      } catch (err) {
        setStreamingText("");
        const msg = err instanceof Error ? err.message : "";
        addMessage({
          id: `msg_${Date.now()}_err`,
          role: "assistant",
          content: msg.includes("timeout")
            ? "El agente no responde. Arranca: python -m agent.server"
            : msg.includes("connection")
            ? "No se pudo conectar al agente (puerto 8002)."
            : "Error de conexion.",
          timestamp: Date.now(),
        });
      } finally {
        if (ws) { try { ws.close(); } catch { /* ignore */ } }
        setProcessing(false);
        setStreamingText("");
      }
    },
    [messages, addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl]
  );

  return { messages, sendMessage, cancel: () => {}, isProcessing, streamingText };
}
