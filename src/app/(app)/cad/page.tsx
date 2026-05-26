"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CadExplorer from "@/viewport/CadExplorer";
import ChatPanel from "@/chat/ChatPanel";
import ProjectSidebar from "@/components/ProjectSidebar";
import ExportPanel from "@/export/ExportButton";
import PropertyPanel from "@/components/PropertyPanel";
import { useCadStore } from "@/store/cadStore";
import Link from "next/link";
import Image from "next/image";

export default function CadPage() {
  const glbUrl = useCadStore((s) => s.glbUrl);
  const [mounted, setMounted] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showProperties, setShowProperties] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  if (!mounted) {
    return (
      <div className="flex flex-1 h-screen overflow-hidden bg-fog">
        <div className="w-95 shrink-0 p-4">
          <ChatPanel />
        </div>
        <div className="flex-1 p-4 pl-0 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="ManfacterCAD" width={28} height={28} className="rounded-lg" />
              <div>
                <h1 className="text-heading-sm font-bold text-ink tracking-tight">ManfacterCAD</h1>
                <p className="text-caption text-graphite -mt-0.5">Describe tu pieza para empezar</p>
              </div>
            </div>
          </div>
          <CadExplorer />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-fog">
      <AnimatePresence>
        {showProjects && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="shrink-0 overflow-hidden p-4 pr-0"
          >
            <ProjectSidebar />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-95 shrink-0 p-4"
      >
        <ChatPanel />
      </motion.div>

      <div className="flex-1 p-4 pl-0 flex flex-col min-w-0">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
          className="flex items-center justify-between mb-3 px-1"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProjects(!showProjects)}
              className="w-9 h-9 rounded-xl bg-snow flex items-center justify-center hover:bg-silver-mist/50 transition-colors"
              title="Proyectos"
            >
              <svg className="w-4 h-4 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <Image src="/logo.png" alt="ManfacterCAD" width={28} height={28} className="rounded-lg" />
            <div>
              <h1 className="text-heading-sm font-bold text-ink tracking-tight">ManfacterCAD</h1>
              <p className="text-caption text-graphite -mt-0.5">
                {glbUrl ? "Modelo cargado" : "Describe tu pieza para empezar"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportPanel />
            <button
              onClick={() => setShowProperties(!showProperties)}
              className={`rounded-full text-caption font-medium px-4 py-1.5 transition-colors duration-100 ${
                showProperties
                  ? "bg-azure text-snow"
                  : "bg-snow text-ink hover:bg-silver-mist/50"
              }`}
            >
              Propiedades
            </button>
            <Link
              href="/"
              className="rounded-full bg-snow text-ink text-caption font-medium px-4 py-1.5 hover:bg-silver-mist/50 transition-colors duration-100"
            >
              Salir
            </Link>
          </div>
        </motion.div>

        <div className="flex flex-1 gap-0 min-h-0">
          <CadExplorer />

          <AnimatePresence>
            {showProperties && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="shrink-0 overflow-hidden pl-4"
              >
                <PropertyPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
