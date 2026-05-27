"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import { autoSaveConversation } from "@/store/autoSave";

function extractAllParams(code: string): Record<string, number> {
  const params: Record<string, number> = {};

  // 1. Named variables: width = 100.0 (with optional leading whitespace)
  const namedRe = /^\s*(\w+)\s*=\s*([\d.]+)\s*$/gm;
  let m;
  while ((m = namedRe.exec(code)) !== null) {
    const name = m[1];
    const val = parseFloat(m[2]);
    if (!isNaN(val) && !["from", "import", "def", "return", "math", "pi", "with", "for", "in", "if", "as"].includes(name)) {
      params[name] = val;
    }
  }

  // 2. Box(100.0, 60.0, 20.0) — only if no named vars found
  if (Object.keys(params).length === 0) {
    const boxRe = /Box\(\s*((?:[\d.]+|[\w.]+))\s*,\s*((?:[\d.]+|[\w.]+))\s*,\s*((?:[\d.]+|[\w.]+))/g;
    while ((m = boxRe.exec(code)) !== null) {
      const names = ["box_length", "box_width", "box_height"];
      for (let i = 1; i <= 3; i++) {
        const val = parseFloat(m[i]);
        if (!isNaN(val)) params[names[i - 1]] = val;
      }
    }
  }

  // 3. Cylinder(8.0, 50.0)
  if (Object.keys(params).length === 0) {
    const cylRe = /Cylinder\(\s*((?:radius\s*=\s*)?([\d.]+))\s*,\s*((?:height\s*=\s*)?([\d.]+))/g;
    while ((m = cylRe.exec(code)) !== null) {
      const r = parseFloat(m[2] || m[1]);
      const h = parseFloat(m[4] || m[3]);
      if (!isNaN(r)) params["cyl_radius"] = r;
      if (!isNaN(h)) params["cyl_height"] = h;
    }
  }

  return params;
}

function replaceNumberInCode(code: string, paramName: string, newValue: number): string {
  const isInteger = /(teeth|count|num|segments|sides)/i.test(paramName);
  const val = isInteger ? Math.round(newValue) : newValue;

  const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedRe = new RegExp(`^(\\s*${escaped}\\s*=\\s*)[\\d.]+`, "m");
  const result = code.replace(namedRe, `$1${val}`);
  if (result !== code) return result;

  // Fallback: Box params
  if (paramName === "box_length" || paramName === "box_width" || paramName === "box_height") {
    const idx = paramName === "box_length" ? 1 : paramName === "box_width" ? 2 : 3;
    const boxRe = /(Box\()([\d.\s,]+)(\))/g;
    return code.replace(boxRe, (full, prefix, args, suffix) => {
      const parts = args.split(",").map((s: string) => s.trim());
      let nth = 0;
      const newParts = parts.map((p: string) => {
        const num = parseFloat(p);
        if (!isNaN(num)) { nth++; if (nth === idx) return String(newValue); }
        return p;
      });
      return `${prefix}${newParts.join(", ")}${suffix}`;
    });
  }

  // Fallback: Cylinder params
  if (paramName === "cyl_radius" || paramName === "cyl_height") {
    const idx = paramName === "cyl_radius" ? 1 : 2;
    const cylRe = /(Cylinder\()([\d.\s,]+)(\))/g;
    return code.replace(cylRe, (full, prefix, args, suffix) => {
      const parts = args.split(",").map((s: string) => s.trim());
      let nth = 0;
      const newParts = parts.map((p: string) => {
        const num = parseFloat(p);
        if (!isNaN(num)) { nth++; if (nth === idx) return String(newValue); }
        return p;
      });
      return `${prefix}${newParts.join(", ")}${suffix}`;
    });
  }

  return code;
}

export default function InspectorPanel() {
  const lastCode = useCadStore((s) => s.lastCode);
  const setGlbUrl = useCadStore((s) => s.setGlbUrl);
  const setStepUrl = useCadStore((s) => s.setStepUrl);
  const setStlUrl = useCadStore((s) => s.setStlUrl);
  const setLastCode = useCadStore((s) => s.setLastCode);
  const modelColor = useCadStore((s) => s.modelColor);
  const setModelColor = useCadStore((s) => s.setModelColor);
  const sceneBackground = useCadStore((s) => s.sceneBackground);
  const setSceneBackground = useCadStore((s) => s.setSceneBackground);
  const [dragValues, setDragValues] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCode = !!lastCode;

  const allParams = useMemo(() => lastCode ? extractAllParams(lastCode) : {}, [lastCode]);
  const paramEntries = Object.entries(allParams).filter(([, v]) => typeof v === "number");

  const paramMax = (v: number) => v > 100 ? v * 2 : v > 10 ? v * 3 : v * 4;
  const paramMin = (v: number) => v > 100 ? v * 0.25 : v > 10 ? v * 0.1 : v * 0.2;
  const paramStep = (v: number) => v > 100 ? 1.0 : v > 10 ? 0.5 : 0.1;

  const handleRegenerate = useCallback(
    async (name: string, value: number) => {
      if (!lastCode || generating) return;
      setGenerating(true);
      try {
        const newCode = replaceNumberInCode(lastCode, name, value);
        console.log("[REGEN]", name, value, "→ code len:", newCode.length);

        const res = await fetch("/api/chat/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: newCode }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log("[REGEN] OK:", data.glb ? "got GLB" : "no GLB", data.step ? "got STEP" : "no STEP");
          if (data.glb) setGlbUrl(data.glb);
          if (data.step) setStepUrl(data.step);
          if (data.stl) setStlUrl(data.stl);
          setLastCode(newCode, extractAllParams(newCode));
          setTimeout(() => autoSaveConversation(), 100);
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          console.error("[REGEN] FAIL:", err);
        }
      } catch (e) {
        console.error("[REGEN] error:", e);
      } finally {
        setGenerating(false);
      }
    },
    [lastCode, generating, setLastCode, setGlbUrl, setStepUrl, setStlUrl]
  );

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
        {hasCode && !generating && paramEntries.length > 0 && (
          <div>
            <h3 className="text-footnote font-semibold text-graphite uppercase tracking-wider mb-3">Medidas (mm)</h3>
            <div className="space-y-3">
              {paramEntries.map(([name, value]) => {
                const min = paramMin(value);
                const max = paramMax(value);
                const step = paramStep(value);
                const displayVal = dragValues[name] ?? value;
                const pct = ((displayVal - min) / (max - min)) * 100;
                return (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-caption font-medium text-ink capitalize">{name.replace(/_/g, " ")}</label>
                      <span className="text-footnote text-graphite tabular-nums">{dragValues[name] ?? value}{Number.isInteger(dragValues[name] ?? value) ? ".0" : ""} mm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={step}
                          value={dragValues[name] ?? value}
                          onChange={(e) => setDragValues({ ...dragValues, [name]: parseFloat(e.target.value) })}
                          onMouseUp={() => { const v = dragValues[name]; if (v !== undefined && v !== value) handleRegenerate(name, v); }}
                          onTouchEnd={() => { const v = dragValues[name]; if (v !== undefined && v !== value) handleRegenerate(name, v); }}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #0071e3 0%, #0071e3 ${pct}%, #e8e8ed ${pct}%, #e8e8ed 100%)`,
                            accentColor: "#0071e3",
                          }}
                        />
                      </div>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={dragValues[name] ?? value}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) {
                            setDragValues({ ...dragValues, [name]: v });
                            if (debounceRef.current) clearTimeout(debounceRef.current);
                            debounceRef.current = setTimeout(() => {
                              handleRegenerate(name, v);
                            }, 600);
                          }
                        }}
                        className="w-16 h-7 rounded-lg bg-fog text-body-sm text-ink text-right px-2 outline-none focus:ring-2 focus:ring-azure/30"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasCode && paramEntries.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-caption text-graphite">Sin parametros detectados en el codigo.</p>
            <p className="text-caption text-graphite/60">Genera una pieza con dimensiones claras.</p>
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
                  onChange={(e) => { setModelColor(e.target.value); }}
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
                  onChange={(e) => { setSceneBackground(e.target.value); }}
                  className="w-7 h-7 rounded-md border border-silver-mist cursor-pointer p-0"
                />
                <span className="text-footnote text-graphite tabular-nums">{sceneBackground}</span>
              </div>
            </div>
          </div>
        </div>

        {!hasCode && (
          <div className="text-center py-8">
            <p className="text-caption text-graphite">Genera una pieza primero para ver sus propiedades aqui.</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-silver-mist">
        <p className="text-footnote text-graphite/60 text-center">
          {generating ? "Regenerando..." : hasCode && paramEntries.length > 0 ? "Desliza para regenerar" : ""}
        </p>
      </div>
    </motion.div>
  );
}
