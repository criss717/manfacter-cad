"use client";

import { useState} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";

interface SavedProject {
  id: string;
  name: string;
  shapesCount: number;
  updatedAt: number;
}

const STORAGE_KEY = "manfactercad_projects";

function loadProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProjectList(list: SavedProject[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function ProjectSidebar() {
  const shapes = useCadStore((s) => s.shapes);
  const messages = useCadStore((s) => s.messages);
  const currentUnit = useCadStore((s) => s.currentUnit);
  const [projects, setProjects] = useState<SavedProject[]>(() => {
    if (typeof window === "undefined") return [];
    return loadProjects();
  });

  const saveCurrent = () => {
    if (Object.keys(shapes).length === 0) return;
    const id = `proj_${Date.now()}`;
    const project: SavedProject = {
      id,
      name: `Proyecto ${projects.length + 1}`,
      shapesCount: Object.keys(shapes).length,
      updatedAt: Date.now(),
    };

    const snapshot = {
      shapes,
      messages: messages.slice(-10),
      currentUnit,
    };
    localStorage.setItem(`manfactercad_${id}`, JSON.stringify(snapshot));

    const updated = [project, ...projects];
    setProjects(updated);
    saveProjectList(updated);
  };

  const loadProject = (id: string) => {
    try {
      const raw = localStorage.getItem(`manfactercad_${id}`);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      if (snapshot.shapes) {
        useCadStore.getState().setShapes?.(snapshot.shapes);
      }
    } catch {
      // ignore
    }
  };

  const deleteProject = (id: string) => {
    localStorage.removeItem(`manfactercad_${id}`);
    const updated = projects.filter((p) => p.id !== id);
    setProjects(updated);
    saveProjectList(updated);
  };

  const shapeCount = Object.keys(shapes).length;

  return (
    <div className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden">
      <div className="px-6 py-4 border-b border-silver-mist flex items-center justify-between">
        <h2 className="text-body-sm font-semibold text-ink">Proyectos</h2>
        <button
          onClick={saveCurrent}
          disabled={shapeCount === 0}
          className="w-7 h-7 rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
          title="Guardar proyecto"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <AnimatePresence>
          {projects.map((proj) => (
            <motion.div
              key={proj.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="group flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-fog cursor-pointer transition-colors"
              onClick={() => loadProject(proj.id)}
            >
              <div className="min-w-0">
                <p className="text-body-sm text-ink font-medium truncate">{proj.name}</p>
                <p className="text-caption text-graphite">
                  {proj.shapesCount} piezas ·{" "}
                  {new Date(proj.updatedAt).toLocaleDateString("es")}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteProject(proj.id);
                }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-silver-mist text-graphite flex items-center justify-center text-[10px] hover:bg-caution hover:text-snow transition-all"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {projects.length === 0 && (
          <p className="text-caption text-graphite text-center mt-6 px-2">
            Guarda tu primer proyecto con el botón +
          </p>
        )}
      </div>
    </div>
  );
}
