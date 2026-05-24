"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-caption mb-1">
        <span className="text-graphite">{label}</span>
        <span className="text-ink font-medium tabular-nums">{value} mm</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-silver-mist rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-azure [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-caption text-graphite w-6">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-20 h-7 px-2 rounded-lg bg-fog text-body-sm text-ink text-right outline-none focus:ring-2 focus:ring-azure/30"
      />
      <span className="text-caption text-graphite w-6 text-right">mm</span>
    </div>
  );
}

export default function PropertyPanel() {
  const shapes = useCadStore((s) => s.shapes);
  const updateShape = useCadStore((s) => s.updateShape);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const primitiveList = Object.values(shapes).filter((s) => s.type === "primitive");
  const selected = selectedId ? shapes[selectedId] : null;

  return (
    <div className="flex flex-col h-full bg-snow rounded-[28px] overflow-hidden">
      <div className="px-6 py-4 border-b border-silver-mist">
        <h2 className="text-body-sm font-semibold text-ink">Propiedades</h2>
      </div>
      <div className="px-4 py-3 border-b border-silver-mist">
        <select
          value={selectedId || ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="w-full h-9 px-3 rounded-xl bg-fog text-body-sm text-ink outline-none cursor-pointer"
        >
          <option value="">Seleccionar pieza...</option>
          {primitiveList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.primitiveType})
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {selected?.primitiveType === "box" && (
            <motion.div key="box" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {(["W", "D", "H"] as const).map((dim) => {
                const key = dim.toLowerCase() as "w" | "d" | "h";
                const val = selected.dimensions?.[key] ?? 0;
                return (
                  <NumberInput
                    key={dim}
                    label={dim}
                    value={val}
                    onChange={(v) =>
                      updateShape(selected.id, { dimensions: { ...selected.dimensions, [key]: v } })
                    }
                  />
                );
              })}
              <div className="mt-4 border-t border-silver-mist pt-4">
                {(["W", "D", "H"] as const).map((dim) => {
                  const key = dim.toLowerCase() as "w" | "d" | "h";
                  const val = selected.dimensions?.[key] ?? 0;
                  return (
                    <SliderField
                      key={dim}
                      label={`${dim === "W" ? "Ancho" : dim === "D" ? "Prof." : "Altura"} (${dim})`}
                      value={val}
                      min={1}
                      max={500}
                      step={1}
                      onChange={(v) =>
                        updateShape(selected.id, { dimensions: { ...selected.dimensions, [key]: v } })
                      }
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {selected?.primitiveType === "cylinder" && (
            <motion.div key="cyl" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <NumberInput
                label="H"
                value={selected.dimensions?.height ?? 0}
                onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, height: v } })}
              />
              <NumberInput
                label="R"
                value={selected.dimensions?.r ?? 0}
                onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, r: v } })}
              />
              <div className="mt-4 border-t border-silver-mist pt-4">
                <SliderField
                  label="Altura"
                  value={selected.dimensions?.height ?? 0}
                  min={1}
                  max={500}
                  step={1}
                  onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, height: v } })}
                />
                <SliderField
                  label="Radio"
                  value={selected.dimensions?.r ?? 0}
                  min={0.5}
                  max={250}
                  step={0.5}
                  onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, r: v } })}
                />
              </div>
            </motion.div>
          )}

          {selected?.primitiveType === "sphere" && (
            <motion.div key="sph" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <NumberInput
                label="R"
                value={selected.dimensions?.r ?? 0}
                onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, r: v } })}
              />
              <SliderField
                label="Radio"
                value={selected.dimensions?.r ?? 0}
                min={0.5}
                max={250}
                step={0.5}
                onChange={(v) => updateShape(selected.id, { dimensions: { ...selected.dimensions, r: v } })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {selected && (
          <div className="mt-4 border-t border-silver-mist pt-4">
            <label className="text-caption text-graphite block mb-1.5">Color</label>
            <input
              type="color"
              value={selected.color}
              onChange={(e) => updateShape(selected.id, { color: e.target.value })}
              className="w-full h-8 rounded-lg cursor-pointer border border-silver-mist"
            />
          </div>
        )}

        {!selected && primitiveList.length > 0 && (
          <p className="text-caption text-graphite text-center mt-8">Selecciona una pieza para editar</p>
        )}
        {primitiveList.length === 0 && (
          <p className="text-caption text-graphite text-center mt-8">Crea una pieza desde el chat</p>
        )}
      </div>
    </div>
  );
}
