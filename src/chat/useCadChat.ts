"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";

const SHELL_URL = "ws://127.0.0.1:8001";
const BACKEND_URL = "http://127.0.0.1:8000";
const MAX_RETRIES = 5;

interface ShellMsg {
  type: string;
  ok?: boolean;
  error?: string;
  glb?: string;
  step?: string;
  stl?: string;
  facts?: Record<string, unknown>;
  stdout?: string;
  traceback?: string;
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
  const shellReadyRef = useRef<boolean>(false);
  const pendingShellRef = useRef<Array<(msg: ShellMsg) => void>>([]);

  const connectShell = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      try {
        const ws = new WebSocket(SHELL_URL);
        wsRef.current = ws;
        ws.onopen = () => {
          shellReadyRef.current = true;
          resolve(true);
        };
        ws.onmessage = (event) => {
          try {
            const msg: ShellMsg = JSON.parse(event.data);
            if (pendingShellRef.current.length > 0) {
              const cb = pendingShellRef.current.shift()!;
              cb(msg);
            }
          } catch {}
        };
        ws.onclose = () => { shellReadyRef.current = false; wsRef.current = null; };
        ws.onerror = () => { shellReadyRef.current = false; resolve(false); };
        setTimeout(() => resolve(false), 3000);
      } catch {
        resolve(false);
      }
    });
  }, []);

  const shellSend = useCallback((cmd: string, payload: Record<string, unknown> = {}): Promise<ShellMsg> => {
    return new Promise((resolve) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve({ type: "error", error: "Shell not connected" });
        return;
      }
      ws.send(JSON.stringify({ cmd, ...payload }));
      pendingShellRef.current.push(resolve);
      setTimeout(() => {
        const idx = pendingShellRef.current.indexOf(resolve);
        if (idx >= 0) { pendingShellRef.current.splice(idx, 1); resolve({ type: "error", error: "Shell timeout" }); }
      }, 60000);
    });
  }, []);

  const httpGenerate = useCallback(async (code: string) => {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { ok: false, error: err.detail?.error || `Error ${res.status}` };
    }
    const data = await res.json();
    return {
      ok: true,
      glb: data.glb_url ? `${BACKEND_URL}${data.glb_url}` : undefined,
      step: data.step_url ? `${BACKEND_URL}${data.step_url}` : undefined,
      stl: data.stl_url ? `${BACKEND_URL}${data.stl_url}` : undefined,
      facts: data.facts,
    };
  }, []);

  const executeCode = useCallback(async (code: string) => {
    const shellConnected = await connectShell();

    if (shellConnected) {
      setStreamingText("Shell: ejecutando...");
      const result = await shellSend("step", { code });
      if (result.ok && result.glb) {
        return {
          ok: true,
          glb: `${BACKEND_URL}${result.glb}`,
          step: result.step ? `${BACKEND_URL}${result.step}` : undefined,
          stl: result.stl ? `${BACKEND_URL}${result.stl}` : undefined,
          facts: result.facts,
          error: undefined,
        };
      }
      return {
        ok: false,
        error: result.error || result.stdout || "Shell error",
      };
    }

    setStreamingText("HTTP: ejecutando...");
    return httpGenerate(code);
  }, [connectShell, shellSend, httpGenerate]);

  const sendMessage = useCallback(
    async (content: string, _imageBase64?: string) => {
      if (isProcessing) return;
      setProcessing(true);
      setStreamingText("");

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const history = [...messages.slice(-10), userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        setStreamingText("IA pensando...");

        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, provider }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!chatRes.ok) throw new Error(`Error ${chatRes.status}`);

        const chatData = await chatRes.json();
        setStreamingText("");

        if (chatData.text) {
          addMessage({
            id: `msg_${Date.now()}_ai`,
            role: "assistant",
            content: chatData.text,
            timestamp: Date.now(),
          });
        }

        let code = chatData.code;
        if (!code) {
          addMessage({
            id: `msg_${Date.now()}_err`,
            role: "assistant",
            content: "No se pudo extraer codigo Python de la respuesta.",
            timestamp: Date.now(),
          });
          return;
        }

        let result = await executeCode(code);
        let attempts = 1;

        while (!result.ok && attempts < MAX_RETRIES) {
          const errorMsg = `Error al ejecutar el codigo:\n${result.error}\n\nCorrige el codigo Python y entregalo entre triple backtick python.`;

          setStreamingText("Corrigiendo...");

          const fixRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "user", content },
                { role: "assistant", content: code },
                { role: "user", content: errorMsg },
              ],
              provider,
              skipGeneration: true,
            }),
            signal: controller.signal,
          });

          setStreamingText("");

          if (!fixRes.ok) break;
          const fixData = await fixRes.json();
          code = fixData.code;
          if (!code) break;

          result = await executeCode(code);
          attempts++;
        }

        if (result.ok && result.glb) {
          setGlbUrl(result.glb);
          if (result.step) setStepUrl(result.step);
          if (result.stl) setStlUrl(result.stl);
          if (code) setLastCode(code, {});
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
        addMessage({
          id: `msg_${Date.now()}_err`,
          role: "assistant",
          content: "Error de conexion. Verifica que los servidores esten corriendo.",
          timestamp: Date.now(),
        });
      } finally {
        setProcessing(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [
      messages, addMessage, setProcessing, isProcessing,
      setGlbUrl, setStepUrl, setStlUrl, setLastCode,
      provider, executeCode,
    ]
  );

  return {
    messages,
    sendMessage,
    cancel: () => abortRef.current?.abort(),
    isProcessing,
    streamingText,
  };
}
