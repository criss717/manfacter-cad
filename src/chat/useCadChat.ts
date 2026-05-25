"use client";

import { useCallback, useRef, useState } from "react";
import { useCadStore, type ChatMessage } from "@/store/cadStore";
import { useSettingsStore } from "@/store/settingsStore";

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

  const sendMessage = useCallback(
    async (content: string) => {
      if (isProcessing) return;
      setProcessing(true);
      setStreamingText("");

      const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content, timestamp: Date.now() };
      addMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...messages.slice(-10), userMsg].map((m) => ({ role: m.role, content: m.content }));

        setStreamingText("Diseñando pieza...");

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, provider }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const data = await res.json();
        setStreamingText("");

        if (data.text) {
          addMessage({ id: `msg_${Date.now()}_ai`, role: "assistant", content: data.text, timestamp: Date.now() });
        }

        if (data.glbUrl) setGlbUrl(data.glbUrl);
        if (data.stepUrl) setStepUrl(data.stepUrl);
        if (data.stlUrl) setStlUrl(data.stlUrl);
        if (data.code && data.params) setLastCode(data.code, data.params);

        if (!data.hasCode && data.error) {
          addMessage({
            id: `msg_${Date.now()}_err`,
            role: "assistant",
            content: `No se pudo generar: ${data.error}${data.attempts ? ` (${data.attempts} intentos)` : ""}`,
            timestamp: Date.now(),
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        addMessage({
          id: `msg_${Date.now()}_err`,
          role: "assistant",
          content: `Error de conexión. Verifica que los servidores estén corriendo.`,
          timestamp: Date.now(),
        });
      } finally {
        setProcessing(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [messages, addMessage, setProcessing, isProcessing, setGlbUrl, setStepUrl, setStlUrl, provider]
  );

  return { messages, sendMessage, cancel: () => abortRef.current?.abort(), isProcessing, streamingText };
}
