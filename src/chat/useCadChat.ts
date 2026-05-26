"use client";

import { useCallback, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";

const SHELL_URL = "ws://127.0.0.1:8001";
const BACKEND_URL = "http://127.0.0.1:8000";

interface ShellMsg {
  type: string; ok?: boolean; error?: string;
  glb?: string; step?: string; stl?: string;
  facts?: Record<string, unknown>; stdout?: string;
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
  const provider = useSettingsStore((s) => s.provider);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const shellExec = useCallback((code: string): Promise<ShellMsg> => {
    return new Promise((resolve) => {
      const done = (msg: ShellMsg) => resolve(msg);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ cmd: "step", code }));
        const handler = (e: MessageEvent) => {
          const msg: ShellMsg = JSON.parse(e.data);
          if (msg.type === "step_result") {
            wsRef.current?.removeEventListener("message", handler);
            done(msg);
          }
        };
        wsRef.current.addEventListener("message", handler);
        setTimeout(() => { wsRef.current?.removeEventListener("message", handler); done({ type: "error", error: "Shell timeout" }); }, 60000);
        return;
      }

      try {
        const ws = new WebSocket(SHELL_URL);
        ws.onopen = () => {
          wsRef.current = ws;
          ws.send(JSON.stringify({ cmd: "step", code }));
          const handler = (e: MessageEvent) => {
            const msg: ShellMsg = JSON.parse(e.data);
            if (msg.type === "step_result") {
              ws.removeEventListener("message", handler);
              done(msg);
            }
          };
          ws.addEventListener("message", handler);
          setTimeout(() => { ws.removeEventListener("message", handler); done({ type: "error", error: "Shell timeout" }); }, 60000);
        };
        ws.onerror = () => done({ type: "error", error: "Shell connection error" });
        ws.onclose = () => { wsRef.current = null; };
        setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) done({ type: "error", error: "Shell connection timeout" }); }, 5000);
      } catch {
        done({ type: "error", error: "Shell unavailable" });
      }
    });
  }, []);

  const generate = useCallback(async (code: string) => {
    setStreamingText("Shell: ejecutando...");
    const r = await shellExec(code);

    if (r.ok && r.glb) {
      return {
        ok: true,
        glb: `${BACKEND_URL}${r.glb}`,
        step: r.step ? `${BACKEND_URL}${r.step}` : undefined,
        stl: r.stl ? `${BACKEND_URL}${r.stl}` : undefined,
      };
    }

    setStreamingText("HTTP: ejecutando...");
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { ok: false, error: err.detail?.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      ok: true,
      glb: data.glb_url ? `${BACKEND_URL}${data.glb_url}` : undefined,
      step: data.step_url ? `${BACKEND_URL}${data.step_url}` : undefined,
      stl: data.stl_url ? `${BACKEND_URL}${data.stl_url}` : undefined,
    };
  }, [shellExec]);

  const sendMessage = useCallback(
    async (content: string, _imageBase64?: string) => {
      if (isProcessing) return;
      setProcessing(true);
      setStreamingText("IA pensando...");

      const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content, timestamp: Date.now() };
      addMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        const history = [...messages.slice(-10), userMsg].map((m) => ({ role: m.role, content: m.content }));

        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, provider, skipGeneration: true }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!chatRes.ok) {
          addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: `Error (${chatRes.status})`, timestamp: Date.now() });
          setStreamingText("");
          return;
        }

        const chatData = await chatRes.json();

        if (chatData.text) {
          addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: chatData.text, timestamp: Date.now() });
        }

        const code = chatData.code;
        if (!code) {
          setStreamingText("");
          return;
        }

        setLastCode(code, chatData.params || {});

        let result = await generate(code);
        let attempts = 1;

        while (!result.ok && attempts < 5) {
          const errorMsg = `Error al ejecutar:\n${result.error}\n\nCorrige el codigo Python entre triple backtick python.`;
          setStreamingText("Corrigiendo...");

          const fixRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content }, { role: "assistant", content: code }, { role: "user", content: errorMsg }],
              provider, skipGeneration: true,
            }),
            signal: controller.signal,
          });

          if (!fixRes.ok) break;
          const fixData = await fixRes.json();
          const newCode = fixData.code;
          if (!newCode) break;

          result = await generate(newCode);
          attempts++;
        }

        setStreamingText("");

        if (result.ok && result.glb) {
          setGlbUrl(result.glb);
          if (result.step) setStepUrl(result.step);
          if (result.stl) setStlUrl(result.stl);
        } else if (result.error) {
          addMessage({
            id: `msg_${Date.now()}_err`,
            role: "assistant",
            content: `No se pudo generar tras ${attempts} intentos. Error: ${result.error}`,
            timestamp: Date.now(),
          });
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") return;
        addMessage({ id: `msg_${Date.now()}_err`, role: "assistant", content: "Error de conexión. Verifica los servidores.", timestamp: Date.now() });
        setStreamingText("");
      } finally {
        setProcessing(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [messages, addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, setLastCode, provider, generate]
  );

  return { messages, sendMessage, cancel: () => abortRef.current?.abort(), isProcessing, streamingText };
}
