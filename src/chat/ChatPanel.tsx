"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useCadChat } from "./useCadChat";
import { useSettingsStore } from "@/store/settingsStore";
import { useCadStore } from "@/store/cadStore";

const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek V4 Pro" },
  { id: "glm", label: "GLM 5.1" },
  { id: "kimi", label: "Kimi K2.6" },
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "GPT-4o" },
] as const;

export default function ChatPanel() {
  const { messages, sendMessage, cancel, isProcessing, streamingText } = useCadChat();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const focusKey = useCadStore((s) => s.chatInputFocusKey);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    if (!isProcessing) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isProcessing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const submitWithImage = useCallback(
    (text: string, imageBase64?: string) => {
      sendMessage(text, imageBase64);
      setPreviewImage(null);
      if (inputRef.current) inputRef.current.value = "";
    },
    [sendMessage]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const text = input.value.trim();
    if (!text && !previewImage) return;
    submitWithImage(text || "Describe esta pieza y genera el CAD", previewImage || undefined);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => setPreviewImage(reader.result as string);
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result as string);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const clearImage = () => setPreviewImage(null);

  const visibleMessages = messages.filter((m) => m.role !== "system");

  return (
    <div className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden">
      <div className="px-7 py-5 border-b border-silver-mist">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-body font-semibold text-ink tracking-tight">Chat CAD</h2>
            <p className="text-caption text-graphite mt-0.5">
              Describe la pieza o pega una imagen
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
          {visibleMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-fl text-body-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-azure text-snow rounded-br-md"
                    : "bg-fog text-ink rounded-bl-md"
                }`}
              >
                {msg.image && (
                  <Image
                    src={msg.image}
                    alt="Uploaded"
                    width={200}
                    height={200}
                    unoptimized
                    className="rounded-lg mb-2 object-contain"
                  />
                )}
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
              <div className="flex items-center gap-3 max-w-[85%] px-4 py-3 rounded-xl rounded-bl-md bg-fog text-ink">
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
        {visibleMessages.length === 0 && !isProcessing && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-20">
            <div className="w-16 h-16 rounded-3xl bg-fog flex items-center justify-center mb-4">
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
            <p className="text-caption text-graphite mt-1 max-w-65">
              Describe la pieza o pega una imagen (Ctrl+V) para empezar
            </p>
          </div>
        )}
      </div>

      {previewImage && (
        <div className="px-5 py-2 flex items-center gap-2 border-t border-silver-mist">
          <Image src={previewImage} alt="Preview" width={48} height={48} unoptimized className="rounded-lg object-cover" />
          <span className="text-caption text-graphite flex-1 truncate">Imagen lista para enviar</span>
          <button onClick={clearImage} className="text-caption text-graphite hover:text-ink transition-colors">
            Quitar
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`px-5 py-4 border-t border-silver-mist flex items-center gap-3 relative transition-colors ${isDragOver ? "bg-azure/5" : ""}`}
      >
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-azure/10 rounded-b-3xl pointer-events-none z-10">
            <p className="text-body font-semibold text-azure">Suelta la imagen aqui</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-11 w-11 cursor-pointer rounded-full bg-fog flex items-center justify-center hover:bg-silver-mist/50 transition-colors shrink-0"
          title="Adjuntar imagen"
        >
          <svg className="w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Describe tu pieza o pega una imagen (Ctrl+V)..."
          disabled={isProcessing}
          onPaste={handlePaste}
          className="flex-1 h-11 px-4 rounded-md bg-fog text-body-sm text-ink placeholder:text-graphite outline-none focus:ring-2 focus:ring-azure/30 transition-shadow duration-100"
        />
        {isProcessing ? (
          <button
            type="button"
            onClick={cancel}
            className="h-11 w-11 rounded-full bg-ink text-snow flex items-center justify-center hover:bg-ash transition-colors duration-100 shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className="h-11 w-11 cursor-pointer rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link transition-colors duration-100 shrink-0"
            title={previewImage ? "Enviar imagen y texto" : "Enviar"}
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
