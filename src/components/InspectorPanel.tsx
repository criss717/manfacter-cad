"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";

function replaceParamValue(code: string, name: string, value: number): string {
  const re = new RegExp(`^(${name}\\s*=\\s*)[\\d.]+`, "m");
  return code.replace(re, `$1${value}`);
}

export default function InspectorPanel() {
  const lastCode = useCadStore((s) => s.lastCode);
  const lastParams = useCadStore((s) => s.lastParams);
  const updateParam = useCadStore((s) => s.updateParam);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
  const setLastCode = useCadStore((s) => s.setLastCode);
  const modelColor = useCadStore((s) => s.modelColor);
  const setModelColor = useCadStore((s) => s.setModelColor);
  const sceneBackground = useCadStore((s) => s.sceneBackground);
  const setSceneBackground = useCadStore((s) => s.setSceneBackground);

  const [generating, setGenerating] = useState(false);
  const paramEntries = Object.entries(lastParams).filter(([, v]) => typeof v === "number");

  const handleParamChange = useCallback(
    (name: string, value: number) => {
      updateParam(name, value);
    },
    [updateParam]
  );

  const handleRegenerate = useCallback(
    async (name: string, value: number) => {
      if (!lastCode || generating) return;
      setGenerating(true);
      try {
        const newCode = replaceParamValue(lastCode, name, value);
        setLastCode(newCode, { ...lastParams, [name]: value });

        const res = await fetch("/api/chat/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: newCode }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.glb) setGlbUrl(data.glb);
          if (data.step) setStepUrl(data.step);
          if (data.stl) setStlUrl(data.stl);
        }
      } catch {
        // silent fail, user can retry
      } finally {
        setGenerating(false);
      }
    },
    [lastCode, lastParams, generating, setLastCode, setGlbUrl, setStepUrl, setStlUrl]
  );

  const paramMax = (v: number) => v > 100 ? v * 2 : v > 10 ? v * 3 : v * 4;
  const paramMin = (v: number) => v > 100 ? v * 0.25 : v > 10 ? v * 0.1 : v * 0.2;
  const paramStep = (v: number) => v > 100 ? 1 : v > 10 ? 0.5 : 0.1;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-silver-mist">
        <h2 className="text-body font-semibold text-ink tracking-tight">Propiedades</h2>
        <p className="text-caption text-graphite mt-0.5">Ajusta los parametros de la pieza</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {paramEntries.length > 0 && (
          <div>
            <h3 className="text-footnote font-semibold text-graphite uppercase tracking-wider mb-3">Medidas (mm)</h3>
            <div className="space-y-3">
              {paramEntries.map(([name, value]) => {
                const min = paramMin(value);
                const max = paramMax(value);
                const step = paramStep(value);
                const pct = ((value - min) / (max - min)) * 100;
                return (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-caption font-medium text-ink capitalize">{name.replace(/_/g, " ")}</label>
                      <span className="text-footnote text-graphite tabular-nums">{value}{Number.isInteger(value) ? ".0" : ""} mm</span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(e) => handleParamChange(name, parseFloat(e.target.value))}
                        onMouseUp={() => handleRegenerate(name, lastParams[name])}
                        onTouchEnd={() => handleRegenerate(name, lastParams[name])}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #0071e3 0%, #0071e3 ${pct}%, #e8e8ed ${pct}%, #e8e8ed 100%)`,
                          accentColor: "#0071e3",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-footnote font-semibold text-graphite uppercase tracking-wider mb-3">Apariencia</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-caption font-medium text-ink">Color del modelo</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={modelColor}
                  onChange={(e) => setModelColor(e.target.value)}
                  className="w-7 h-7 rounded-md border border-silver-mist cursor-pointer p-0"
                />
                <span className="text-footnote text-graphite tabular-nums">{modelColor}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-caption font-medium text-ink">Fondo de escena</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={sceneBackground}
                  onChange={(e) => setSceneBackground(e.target.value)}
                  className="w-7 h-7 rounded-md border border-silver-mist cursor-pointer p-0"
                />
                <span className="text-footnote text-graphite tabular-nums">{sceneBackground}</span>
              </div>
            </div>
          </div>
        </div>

        {!lastCode && (
          <div className="text-center py-8">
            <p className="text-caption text-graphite">Genera una pieza primero para ver sus propiedades aqui.</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-silver-mist">
        <p className="text-footnote text-graphite/60 text-center">
          {generating ? "Regenerando..." : lastCode ? "Desliza un parametro para regenerar" : "Sin pieza activa"}
        </p>
      </div>
    </motion.div>
  );
}
