"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import { autoSaveConversation, loadAutoSaved } from "@/store/autoSave";

interface SavedProject {
  id: string;
  name: string;
  msgCount: number;
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
  const messages = useCadStore((s) => s.messages);
  const lastCode = useCadStore((s) => s.lastCode);
  const lastParams = useCadStore((s) => s.lastParams);
  const glbUrl = useCadStore((s) => s.glbUrl);
  const stepUrl = useCadStore((s) => s.stepUrl);
  const stlUrl = useCadStore((s) => s.stlUrl);
  const stepUrls = useCadStore((s) => s.stepUrls);
  const stlUrls = useCadStore((s) => s.stlUrls);
  const [projects, setProjects] = useState<SavedProject[]>(() => loadProjects());

  const saveCurrent = useCallback(() => {
    const msgs = messages.filter((m) => m.role !== "system");
    if (msgs.length <= 1) return;
    const id = `proj_${Date.now()}`;
    const proj: SavedProject = {
      id,
      name: `Conversacion ${projects.length + 1}`,
      msgCount: msgs.length,
      updatedAt: Date.now(),
    };

    const snapshot = {
      messages: msgs.slice(-50),
      lastCode,
      lastParams,
      glbUrl,
      stepUrl,
      stlUrl,
      stepUrls,
      stlUrls,
    };
    localStorage.setItem(`manfactercad_${id}`, JSON.stringify(snapshot));

    const updated = [proj, ...projects];
    setProjects(updated);
    saveProjectList(updated);
  }, [messages, lastCode, lastParams, glbUrl, stepUrl, stlUrl, stepUrls, stlUrls, projects]);

  const newConversation = useCallback(() => {
    const msgs = messages.filter((m) => m.role !== "system");
    if (msgs.length > 1) {
      saveCurrent();
    }
    useCadStore.getState().clearScene();
  }, [messages, saveCurrent]);

  const loadProject = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem(`manfactercad_${id}`);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      const store = useCadStore.getState();

      if (Array.isArray(snapshot.messages)) {
        const restored = snapshot.messages.map(
          (m: { role: string; content: string; timestamp?: number; image?: string }, idx: number) => ({
            id: `restore_${Date.now()}_${idx}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || Date.now(),
            image: m.image,
          })
        );

        useCadStore.setState({
          messages: restored,
          lastCode: snapshot.lastCode || null,
          lastParams: snapshot.lastParams || {},
          glbUrl: snapshot.glbUrl || null,
          stepUrl: snapshot.stepUrl || null,
          stlUrl: snapshot.stlUrl || null,
          stepUrls: snapshot.stepUrls || [],
          stlUrls: snapshot.stlUrls || [],
          shapes: {},
          isProcessing: false,
        });
      }
    } catch (e) {
      console.error("Failed to load project:", e);
    }
  }, []);

  const deleteProject = useCallback((id: string) => {
    localStorage.removeItem(`manfactercad_${id}`);
    const updated = projects.filter((p) => p.id !== id);
    setProjects(updated);
    saveProjectList(updated);
  }, [projects]);

  const canSave = messages.filter((m) => m.role !== "system").length > 1;

  return (
    <div className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden">
      <div className="px-6 py-4 border-b border-silver-mist flex items-center justify-between">
        <h2 className="text-body-sm font-semibold text-ink">Proyectos</h2>
        <button
          onClick={newConversation}
          className="w-7 h-7 rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link transition-colors text-sm"
          title="Nueva conversacion"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {canSave && (
          <button
            onClick={saveCurrent}
            className="w-full px-3 py-2 rounded-xl bg-azure/10 hover:bg-azure/20 text-azure text-body-sm font-medium transition-colors text-left"
          >
            Guardar conversacion actual
          </button>
        )}

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
                  {proj.msgCount} mensajes ·{" "}
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

        {projects.length === 0 && !canSave && (
          <p className="text-caption text-graphite text-center mt-6 px-2">
            Las conversaciones se guardan automaticamente. Crea una nueva con +
          </p>
        )}
      </div>
    </div>
  );
}
