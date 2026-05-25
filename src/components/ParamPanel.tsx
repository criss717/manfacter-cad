"use client";

import { useCallback, useState } from "react";
import { useCadStore } from "@/store/cadStore";
import { motion, AnimatePresence } from "framer-motion";

function applyParamChange(code: string, name: string, value: number): string {
  const lines = code.split("\n");
  const re = new RegExp(`^${name}\\s*=\\s*[\\d.]+\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      lines[i] = `${name} = ${value}`;
      break;
    }
  }
  return lines.join("\n");
}

async function regenerateWithParams(code: string): Promise<{ glb?: string; step?: string; stl?: string; error?: string }> {
  const res = await fetch("/api/chat/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json();
    return { error: err.error || `Error ${res.status}` };
  }
  return res.json();
}

interface ParamPanelProps {
  className?: string;
}

export default function ParamPanel({ className = "" }: ParamPanelProps) {
  const lastCode = useCadStore((s) => s.lastCode);
  const lastParams = useCadStore((s) => s.lastParams);
  const updateParam = useCadStore((s) => s.updateParam);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
  const isProcessing = useCadStore((s) => s.isProcessing);
  const setProcessing = useCadStore((s) => s.setProcessing);
  const [regenerating, setRegenerating] = useState(false);

  const paramEntries = Object.entries(lastParams);
  const hasParams = paramEntries.length > 0;

  const handleParamChange = useCallback(
    async (name: string, value: number) => {
      if (!lastCode) return;
      updateParam(name, value);
      const newCode = applyParamChange(lastCode, name, value);
      setRegenerating(true);
      setProcessing(true);
      const result = await regenerateWithParams(newCode);
      setProcessing(false);
      setRegenerating(false);
      if (result.glb) setGlbUrl(result.glb);
      if (result.step) setStepUrl(result.step);
      if (result.stl) setStlUrl(result.stl);
    },
    [lastCode, updateParam, setGlbUrl, setStepUrl, setStlUrl, setProcessing]
  );

  if (!hasParams) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className={`flex flex-col gap-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-caption font-semibold text-silver-mist/80 uppercase tracking-wider">Parametros</p>
          {regenerating && (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-silver-mist/20 border-t-azure animate-spin" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {paramEntries.map(([name, value]) => {
            const min = Math.max(0.5, value * 0.1);
            const max = value * 3;
            const step = value < 10 ? 0.5 : value < 50 ? 1 : 5;
            return (
              <div key={name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-silver-mist/70 font-medium">{name}</label>
                  <input
                    type="number"
                    value={value}
                    step={step}
                    min={min}
                    max={max}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) handleParamChange(name, v);
                    }}
                    className="w-16 h-5 rounded-md bg-obsidian/80 border border-silver-mist/20 text-[11px] text-snow text-right px-1.5 focus:outline-none focus:border-azure/50"
                  />
                </div>
                <input
                  type="range"
                  value={value}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) handleParamChange(name, v);
                  }}
                  className="w-full h-1 appearance-none bg-slate/60 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-azure [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
