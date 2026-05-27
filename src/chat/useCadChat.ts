"use client";

import { useCallback, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";
import { autoSaveConversation } from "@/store/autoSave";

const AGENT_URL = "ws://127.0.0.1:8002";
const BACKEND_URL = "http://127.0.0.1:8000";

const PROGRESS: Record<string, string> = {
  read_reference: "Consultando documentacion...",
  run_cad_code: "Generando geometria...",
  inspect_geometry: "Verificando medidas...",
  list_outputs: "Listando archivos...",
};

function extractParamsFromCode(code: string): Record<string, number> {
  const params: Record<string, number> = {};
  const re = /^(\w+)\s*=\s*([\d.]+)\s*$/gm;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    const val = parseFloat(m[2]);
    if (!isNaN(val) && !["math", "pi"].includes(name) && name.length > 1) {
      params[name] = val;
    }
  }
  return params;
}

export function useCadChat() {
  const messages = useCadStore((s) => s.messages);
  const addMessage = useCadStore((s) => s.addMessage);
  const setProcessing = useCadStore((s) => s.setProcessing);
  const isProcessing = useCadStore((s) => s.isProcessing);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
  const addUrls = useCadStore((s) => s.addUrls);
  const commitPendingGlb = useCadStore((s) => s.commitPendingGlb);
  const setLastCode = useCadStore((s) => s.setLastCode);
  const [streamingText, setStreamingText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  const cancel = useCallback(() => {
    cancelRef.current();
  }, []);

  const sendMessage = useCallback(
    async (content: string, imageBase64?: string) => {
      if (isProcessing) return;
      setProcessing(true);
      setStreamingText("Conectando con el agente...");

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
        image: imageBase64,
      };
      addMessage(userMsg);

      let responseText = "";
      let finalGlb: string | null = null;
      let finalStep: string | null = null;
      let finalStl: string | null = null;
      let runCadTotal = 0;
      let runCadOk = 0;
      let resolved = false;

      try {
        const ws = new WebSocket(AGENT_URL);
        wsRef.current = ws;

        cancelRef.current = () => {
          if (!resolved) {
            resolved = true;
            setStreamingText("");
            commitPendingGlb();
            try { ws.close(); } catch { /* ignore */ }
            setProcessing(false);
          }
        };

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), 5000);
          ws.onopen = () => {
            clearTimeout(timeout);
            ws.send(JSON.stringify({ message: content, image: imageBase64 || undefined }));
            resolve();
          };
          ws.onerror = () => { clearTimeout(timeout); reject(new Error("connection")); };
        });

        await new Promise<void>((resolve) => {
          let done = false;

          const fallbackTimeout = setTimeout(() => {
            if (!done) {
              done = true;
              resolved = true;
              setStreamingText("");
              commitPendingGlb();
              if (responseText) {
                addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: responseText.trim(), timestamp: Date.now() });
              }
              addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "El agente tardo demasiado. Intenta de nuevo.", timestamp: Date.now() });
              resolve();
            }
          }, 600000);

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (done) return;

              if (msg.type === "error") {
                done = true;
                resolved = true;
                clearTimeout(fallbackTimeout);
                setStreamingText("");
                commitPendingGlb();
                addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: `Error: ${msg.error}`, timestamp: Date.now() });
                resolve();
                return;
              }

              if (msg.type === "done") {
                done = true;
                resolved = true;
                clearTimeout(fallbackTimeout);
                setStreamingText("");
                if (finalGlb) {
                  setGlbUrl(finalGlb);
                  console.log("[CAD] Final GLB:", finalGlb);
                } else {
                  commitPendingGlb();
                  console.log("[CAD] No final GLB, committed pending");
                }
                if (finalStep) setStepUrl(finalStep);
                if (finalStl) setStlUrl(finalStl);
                if (responseText) {
                  addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: responseText.trim(), timestamp: Date.now() });
                }
                setTimeout(() => autoSaveConversation(), 100);
                resolve();
                return;
              }

              if (msg.type === "agent_event") {
                if (msg.tool_call) {
                  if (msg.tool_call.name === "run_cad_code") {
                    runCadTotal++;
                    setStreamingText(`Generando (${runCadTotal})...`);
                  } else {
                    const label = PROGRESS[msg.tool_call.name] || msg.tool_call.name;
                    if (runCadTotal === 0) setStreamingText(label);
                  }
                }

                if (msg.tool_result) {
                  const r = msg.tool_result;
                  if (r.name === "run_cad_code") {
                    setStreamingText(`Procesando geometria (${runCadOk + 1}/${runCadTotal})...`);
                    try {
                      const raw = r.response;
                      if (typeof raw !== "string") {
                        console.error("[CAD] tool_result no es string:", typeof raw);
                        setStreamingText("Procesando...");
                        return;
                      }
                      const data = JSON.parse(raw);
                      if (data.ok) {
                        runCadOk++;
                        if (data.glb_url) {
                          const url = String(data.glb_url);
                          const full = url.startsWith("http") ? url : `${BACKEND_URL}${url}`;
                          finalGlb = full;
                          addUrls(full, null, null);
                          console.log("[CAD] GLB URL:", full);
                        } else {
                          console.log("[CAD] run_cad_code OK but no glb_url");
                        }
                        if (data.step_url) {
                          finalStep = String(data.step_url).startsWith("http") ? String(data.step_url) : `${BACKEND_URL}${String(data.step_url)}`;
                          addUrls(null, finalStep, null);
                        }
                        if (data.stl_url) {
                          finalStl = String(data.stl_url).startsWith("http") ? String(data.stl_url) : `${BACKEND_URL}${String(data.stl_url)}`;
                          addUrls(null, null, finalStl);
                        }
                        if (data.code && typeof data.code === "string") {
                          setLastCode(data.code, extractParamsFromCode(data.code));
                        }
                        setStreamingText(`Geometria OK (${runCadOk}/${runCadTotal})`);
                      } else {
                        console.log("[CAD] run_cad_code FAIL:", data.error);
                        setStreamingText(`Reintentando (${runCadOk}/${runCadTotal})...`);
                      }
                    } catch (e) {
                      console.error("[CAD] JSON parse failed:", e, "raw:", String(r.response || "").slice(0, 200));
                      setStreamingText("Procesando...");
                    }
                  } else {
                    if (runCadTotal === 0) {
                      setStreamingText(PROGRESS[r.name] || `${r.name} completado`);
                    }
                  }
                }

                if (msg.text) {
                  responseText += msg.text;
                  if (runCadTotal > 0) {
                    setStreamingText(responseText.slice(-80) || "Respondiendo...");
                  } else {
                    setStreamingText(msg.text.slice(-120));
                  }
                }
              }
            } catch (e) {
              console.error("[CAD] Message parse error:", e);
            }
          };

          ws.onclose = () => {
            if (!done) {
              done = true;
              resolved = true;
              clearTimeout(fallbackTimeout);
              setStreamingText("");
              commitPendingGlb();
              if (responseText && !responseText.trim().startsWith("Error")) {
                addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: responseText.trim(), timestamp: Date.now() });
              }
              resolve();
            }
          };
        });
      } catch (err) {
        setStreamingText("");
        commitPendingGlb();
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
        if (!resolved) {
          commitPendingGlb();
        }
        try { wsRef.current?.close(); } catch { /* ignore */ }
        wsRef.current = null;
        cancelRef.current = () => {};
        setProcessing(false);
        setStreamingText("");
      }
    },
    [messages, addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, addUrls, commitPendingGlb, setLastCode]
  );

  return { messages, sendMessage, cancel, isProcessing, streamingText };
}
