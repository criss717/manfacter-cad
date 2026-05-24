"use client";

import { useSettingsStore, type LLMProvider } from "@/store/settingsStore";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";

const providers: { id: LLMProvider; label: string; icon: string }[] = [
  { id: "gemini", label: "Gemini 2.5 Flash", icon: "⚡" },
  { id: "deepseek", label: "DeepSeek V4 Pro", icon: "🔍" },
  { id: "openai", label: "OpenAI GPT-4o", icon: "🧠" },
];

export default function ModelSelector() {
  const { provider, setProvider } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = providers.find((p) => p.id === provider) || providers[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full bg-snow text-ink text-caption font-medium px-3 py-1.5 hover:bg-silver-mist/50 transition-colors duration-[0.1s]"
      >
        <span>{current.icon}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-snow border border-silver-mist shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden z-50"
          >
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-body-sm transition-colors duration-[0.1s] ${
                  p.id === provider
                    ? "bg-fog text-ink font-medium"
                    : "text-graphite hover:bg-fog/50 hover:text-ink"
                }`}
              >
                <span className="text-base">{p.icon}</span>
                <span>{p.label}</span>
                {p.id === provider && (
                  <svg
                    className="w-4 h-4 ml-auto text-azure"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
