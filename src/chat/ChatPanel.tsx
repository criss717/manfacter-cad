"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadChat } from "./useCadChat";
import { useSettingsStore } from "@/store/settingsStore";

const PROVIDERS = [
  { id: "openai", label: "GPT-4o" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "gemini", label: "Gemini" },
] as const;

export default function ChatPanel() {
  const { messages, sendMessage, cancel, isProcessing, streamingText } = useCadChat();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    sendMessage(input.value.trim());
    input.value = "";
  };

  return (
    <div className="flex flex-col h-full bg-snow rounded-[28px] overflow-hidden">
      <div className="px-7 py-5 border-b border-silver-mist">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-body font-semibold text-ink tracking-tight">Chat CAD</h2>
            <p className="text-caption text-graphite mt-0.5">
              Describe la pieza que quieres crear
            </p>
          </div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className="h-8 rounded-lg bg-fog border border-silver-mist text-caption text-ink px-2 focus:outline-none focus:border-azure/50 cursor-pointer"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <AnimatePresence>
          {messages
            .filter((m) => m.role !== "system")
            .map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-[20px] text-body-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-azure text-snow rounded-br-md"
                      : "bg-fog text-ink rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
          {streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-3 max-w-[85%] px-4 py-3 rounded-[20px] rounded-bl-md bg-fog text-ink">
                <div className="flex gap-1">
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                    className="w-1.5 h-1.5 rounded-full bg-azure"
                  />
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-azure"
                  />
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                    className="w-1.5 h-1.5 rounded-full bg-azure"
                  />
                </div>
                <span className="text-body-sm text-graphite">{streamingText}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {messages.length === 0 && !isProcessing && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-20">
            <div className="w-16 h-16 rounded-[28px] bg-fog flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-azure"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </div>
            <p className="text-body font-medium text-ink">
              ¿Qué pieza necesitas crear?
            </p>
            <p className="text-caption text-graphite mt-1 max-w-[260px]">
              Ej: &quot;Un soporte en L de 80x60mm, espesor 4mm, con 2 agujeros de 5mm&quot;
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-5 py-4 border-t border-silver-mist flex items-center gap-3"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Describe tu pieza..."
          disabled={isProcessing}
          className="flex-1 h-11 px-4 rounded-[14px] bg-fog text-body-sm text-ink placeholder:text-graphite outline-none focus:ring-2 focus:ring-azure/30 transition-shadow duration-[0.1s]"
        />
        {isProcessing ? (
          <button
            type="button"
            onClick={cancel}
            className="h-11 w-11 rounded-full bg-ink text-snow flex items-center justify-center hover:bg-ash transition-colors duration-[0.1s] shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className="h-11 w-11 rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link transition-colors duration-[0.1s] shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
