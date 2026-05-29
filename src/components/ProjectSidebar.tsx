"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import {
  loadProject,
  deleteProject,
  newConversation,
  getProjects,
  getCurrentProjectId,
} from "@/store/autoSave";
import ConfirmModal from "./ConfirmModal";

export default function ProjectSidebar({ onClose }: { onClose?: () => void }) {
  useCadStore((s) => s.projectRefreshKey);
  const isProcessing = useCadStore((s) => s.isProcessing);
  const bumpCancelRequest = useCadStore((s) => s.bumpCancelRequest);
  const focusChatInput = useCadStore((s) => s.focusChatInput);
  const bumpResetSession = useCadStore((s) => s.bumpResetSession);
  const projects = getProjects();
  const activeId = getCurrentProjectId();
  const [confirm, setConfirm] = useState<{ type: "load" | "new"; id?: string } | null>(null);

  const handleNew = () => {
    if (isProcessing) {
      setConfirm({ type: "new" });
      return;
    }
    bumpCancelRequest();
    newConversation();
    bumpResetSession();
    useCadStore.getState().clearScene();
  };

  const handleLoad = (id: string) => {
    if (isProcessing) {
      setConfirm({ type: "load", id });
      return;
    }
    bumpCancelRequest();
    loadProject(id);
    bumpResetSession();
    focusChatInput();
  };

  const confirmAction = () => {
    if (confirm?.type === "new") {
      bumpCancelRequest();
      newConversation();
      bumpResetSession();
      useCadStore.getState().clearScene();
    } else if (confirm?.type === "load" && confirm.id) {
      bumpCancelRequest();
      loadProject(confirm.id);
      bumpResetSession();
      focusChatInput();
    }
    setConfirm(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProject(id);
    useCadStore.getState().bumpProjectRefresh();
  };

  return (
    <div className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden">
      <div className="px-4 py-4 border-b border-silver-mist flex items-center justify-between">
        <h2 className="text-body-sm font-semibold text-ink">Conversaciones</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNew}
            className="w-7 h-7 cursor-pointer rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link transition-colors text-sm"
            title="Nueva conversacion"
          >
            +
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 cursor-pointer rounded-full bg-fog text-graphite flex items-center justify-center hover:bg-silver-mist transition-colors"
              title="Ocultar proyectos"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <AnimatePresence>
          {projects.map((proj) => (
            <motion.div
              key={proj.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                activeId === proj.id
                  ? "bg-azure/10 ring-1 ring-azure/20"
                  : "hover:bg-fog"
              }`}
              onClick={() => handleLoad(proj.id)}
            >
              <div className="min-w-0">
                <p className={`text-body-sm font-medium truncate ${activeId === proj.id ? "text-azure" : "text-ink"}`}>{proj.name}</p>
                <p className="text-caption text-graphite">
                  {proj.msgCount} mensajes ·{" "}
                  {new Date(proj.updatedAt).toLocaleDateString("es")}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(proj.id, e)}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-silver-mist text-graphite flex items-center justify-center text-[10px] hover:bg-caution hover:text-snow transition-all"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {projects.length === 0 && (
          <p className="text-caption text-graphite text-center mt-6 px-2">
            Habla con el agente y tus conversaciones apareceran aqui automaticamente
          </p>
        )}
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal
            title="¿Cambiar de chat?"
            message="El ingeniero IA está procesando tu solicitud. Si cambias de chat, el proceso actual se cancelará."
            confirmLabel="Cambiar de chat"
            onConfirm={confirmAction}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
