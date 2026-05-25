"use client";

import { useCallback, useState } from "react";
import { useCadStore } from "@/store/cadStore";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Reemplaza el valor de un parámetro en el código Python de forma simple.
 * @param code Código fuente original.
 * @param name Nombre del parámetro a reemplazar.
 * @param value Nuevo valor numérico.
 * @returns El código fuente modificado.
 */
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

/**
 * Envía una petición de regeneración al backend.
 * @param code Código fuente con los nuevos parámetros.
 */
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

/**
 * Componente para modificar parámetros de un modelo build123d.
 */
export default function ParamPanel({ className = "" }: ParamPanelProps) {
  const lastCode = useCadStore((s) => s.lastCode);
  const lastParams = useCadStore((s) => s.lastParams);
  const updateParam = useCadStore((s) => s.updateParam);
  const setLastCode = useCadStore((s) => s.setLastCode);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
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

      if (!result.error) {
        const newParams = { ...lastParams, [name]: value };
        setLastCode(newCode, newParams);
        if (result.glb) setGlbUrl(result.glb);
        if (result.step) setStepUrl(result.step);
        if (result.stl) setStlUrl(result.stl);
      }
    },
    [lastCode, lastParams, updateParam, setLastCode, setGlbUrl, setStepUrl, setStlUrl, setProcessing]
  );

  if (!hasParams) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className={`flex flex-col gap-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-caption font-semibold text-graphite uppercase tracking-wider">Parámetros del Agente</p>
          {regenerating && (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-azure/20 border-t-azure animate-spin" />
          )}
        </div>
        <div className="flex flex-col gap-3">
          {paramEntries.map(([name, value]) => {
            const min = Math.max(0.5, value * 0.1);
            const max = value * 3;
            const step = value < 10 ? 0.5 : value < 50 ? 1 : 5;
            return (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-caption text-graphite font-medium">{name}</label>
                  <div className="flex items-center gap-1.5">
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
                      className="w-20 h-7 rounded-lg bg-fog border border-silver-mist text-body-sm text-ink text-right px-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
                    />
                    <span className="text-[10px] text-graphite">mm</span>
                  </div>
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
                  className="w-full h-1 appearance-none bg-silver-mist rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-azure [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
