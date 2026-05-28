"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import {
  loadProject,
  deleteProject,
  newConversation,
  getProjects,
  getCurrentProjectId,
} from "@/store/autoSave";

export default function ProjectSidebar() {
  useCadStore((s) => s.projectRefreshKey);
  const focusChatInput = useCadStore((s) => s.focusChatInput);
  const projects = getProjects();
  const activeId = getCurrentProjectId();

  const handleNew = () => {
    newConversation();
    useCadStore.getState().clearScene();
  };

  const handleLoad = (id: string) => {
    loadProject(id);
    focusChatInput();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProject(id);
    useCadStore.getState().bumpProjectRefresh();
  };

  return (
    <div className="flex flex-col h-full bg-snow rounded-3xl overflow-hidden">
      <div className="px-6 py-4 border-b border-silver-mist flex items-center justify-between">
        <h2 className="text-body-sm font-semibold text-ink">Conversaciones</h2>
        <button
          onClick={handleNew}
          className="w-8 h-8 cursor-pointer rounded-full bg-azure text-snow flex items-center justify-center hover:bg-cobalt-link transition-colors text-sm"
          title="Nueva conversacion"
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
    </div>
  );
}
