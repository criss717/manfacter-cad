"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CadExplorer from "@/viewport/CadExplorer";
import ChatPanel from "@/chat/ChatPanel";
import ProjectSidebar from "@/components/ProjectSidebar";
import { loadAutoSaved } from "@/store/autoSave";
import ExportPanel from "@/export/ExportButton";
import InspectorPanel from "@/components/InspectorPanel";
import { useCadStore } from "@/store/cadStore";
import Link from "next/link";
import Image from "next/image";
import ComplexModal from "@/components/ComplexModal";

function MobileDrawer({
  open,
  onClose,
  onChat,
  onViewport,
  hasModel,
}: {
  open: boolean;
  onClose: () => void;
  onChat: () => void;
  onViewport: () => void;
  hasModel: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-ink/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-0 top-0 bottom-0 w-[280px] bg-snow rounded-r-3xl z-50 flex flex-col shadow-none"
          >
            <div className="flex-1 overflow-y-auto">
              <ProjectSidebar onClose={() => { onClose(); }} />
            </div>
            <div className="border-t border-silver-mist p-4 space-y-2">
              <button
                onClick={() => { onChat(); onClose(); }}
                className="w-full cursor-pointer flex items-center gap-3 px-4 py-2.5 rounded-xl bg-fog text-body-sm text-ink font-medium hover:bg-silver-mist/50 transition-colors"
              >
                <svg className="w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Chat
              </button>
              {hasModel && (
                <button
                  onClick={() => { onViewport(); onClose(); }}
                  className="w-full cursor-pointer flex items-center gap-3 px-4 py-2.5 rounded-xl bg-fog text-body-sm text-ink font-medium hover:bg-silver-mist/50 transition-colors"
                >
                  <svg className="w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Ver pieza
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function CadPage() {
  const glbUrl = useCadStore((s) => s.glbUrl);
  const [mounted, setMounted] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "viewport">("chat");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setMounted(true);
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowProjects(window.innerWidth >= 1040);
        setShowInspector(window.innerWidth >= 1270);
      }
      if (mobile) setMobileView("chat");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    loadAutoSaved();
  }, []);

  useEffect(() => {
    if (isMobile && glbUrl && mobileView === "chat") {
      setMobileView("viewport");
    }
  }, [glbUrl, isMobile, mobileView]);

  if (!mounted) {
    return (
      <div className="flex flex-1 h-screen overflow-hidden bg-fog">
        <div className="w-full md:w-100 shrink-0 p-4">
          <ChatPanel />
        </div>
        <div className="hidden md:flex flex-1 p-4 pl-0 flex-col min-w-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-3">
              <div className="relative w-30 h-12 shrink-0">
                <Image src="/logo.png" alt="Manfacter" fill className="rounded-lg object-contain" sizes="82px" />
              </div>
              <div>
                <h1 className="text-heading-sm font-bold text-manfacter tracking-tight">Studio</h1>
                <p className="text-caption text-graphite -mt-0.5">Describe tu pieza para empezar</p>
              </div>
            </div>
          </div>
          <CadExplorer />
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-1 h-screen overflow-hidden bg-fog flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-snow/90 backdrop-blur-sm border-b border-silver-mist shrink-0">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="w-9 h-9 cursor-pointer rounded-xl bg-fog flex items-center justify-center hover:bg-silver-mist/50 transition-colors"
            title="Menu"
          >
            <svg className="w-4 h-4 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="relative w-18 h-7 shrink-0">
              <Image src="/logo.png" alt="Manfacter" fill className="rounded-lg object-contain" sizes="72px" />
            </div>
            <h1 className="text-heading-sm font-bold text-[#1848a3] tracking-tight">Studio</h1>
          </div>
          <div className="flex items-center gap-1">
            <ExportPanel />
            <button
              onClick={() => setShowInspector(!showInspector)}
              className={`rounded-full cursor-pointer text-caption font-medium px-3 py-1.5 transition-colors duration-100 ${
                showInspector
                  ? "bg-azure text-snow"
                  : "bg-snow text-ink hover:bg-silver-mist/50"
              }`}
            >
              Ajustes
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <AnimatePresence mode="wait">
            {mobileView === "chat" ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ChatPanel />
              </motion.div>
            ) : (
              <motion.div
                key="viewport"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col"
              >
                <div className="flex-1 relative">
                  <CadExplorer />
                  <ComplexModal />
                  <button
                    onClick={() => setMobileView("chat")}
                    className="absolute top-3 left-3 z-10 cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-snow/90 backdrop-blur-sm border border-silver-mist text-caption text-ink font-medium hover:bg-snow transition-colors shadow-none"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Chat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showInspector && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 bg-ink/10 z-20"
                  onClick={() => setShowInspector(false)}
                />
                <motion.div
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-[260px] bg-snow rounded-l-3xl z-30 overflow-hidden shadow-none"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-silver-mist">
                    <h3 className="text-body-sm font-semibold text-ink">Propiedades</h3>
                    <button
                      onClick={() => setShowInspector(false)}
                      className="w-7 h-7 cursor-pointer rounded-full bg-fog flex items-center justify-center hover:bg-silver-mist/50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <InspectorPanel />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <MobileDrawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          onChat={() => setMobileView("chat")}
          onViewport={() => setMobileView("viewport")}
          hasModel={!!glbUrl}
        />
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
            <ProjectSidebar onClose={() => setShowProjects(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-100 shrink-0 p-4"
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
              className="w-9 h-9 cursor-pointer border-blue-400 border-2 rounded-xl bg-snow flex items-center justify-center hover:bg-silver-mist/50 transition-colors"
              title="Proyectos"
            >
              <svg className="w-4 h-4 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div className="relative w-18 h-7 shrink-0">
              <Image src="/logo.png" alt="Manfacter" fill className="rounded-lg object-contain" sizes="72px" />
            </div>
            <div className="hidden lg:block">
              <h1 className="text-heading-sm font-bold text-[#1848a3] tracking-tight">Studio</h1>
              <p className="text-caption text-graphite -mt-0.5">
                {glbUrl ? "Modelo cargado" : "Describe tu pieza para empezar"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportPanel />
            <button
              onClick={() => setShowInspector(!showInspector)}
              className={`rounded-full cursor-pointer text-caption font-medium px-4 py-1.5 transition-colors duration-100 ${
                showInspector
                  ? "bg-azure text-snow"
                  : "bg-snow text-ink hover:bg-silver-mist/50"
              }`}
            >
              Propiedades
            </button>
            <Link
              href="/"
              className="rounded-full cursor-pointer bg-snow text-ink text-caption font-medium px-4 py-1.5 hover:bg-silver-mist/50 transition-colors duration-100"
            >
              Salir
            </Link>
          </div>
        </motion.div>

        <div className="flex flex-1 gap-0 min-h-0 relative">
          <CadExplorer />
          <ComplexModal />

          <AnimatePresence>
            {showInspector && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 260, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="shrink-0 overflow-hidden pl-4"
              >
                <InspectorPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
