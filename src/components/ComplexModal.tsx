"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import GearGame from "./GearGame";

const NEWS_ITEMS = [
  {
    title: "Manfacter gana el Premio EmprendeXXI en Cantabria",
    desc: "Reconocida como la startup con mayor potencial de la región por CaixaBank y SODERCAN.",
    link: "https://www.cantabria.es/web/comunicados/w/manfacter-gana-el-premio-emprendexxi-como-la-startup-con-mayor-potencial-de-cantabria",
  },
  {
    title: "Manfacter gana los Premios EmprendeXXI en Cantabria",
    desc: "El Referente destaca a Manfacter como ganadora de los prestigiosos premios de innovación.",
    link: "https://elreferente.es/startups/manfacter-gana-los-premios-emprendexxi-en-cantabria/",
  },
  {
    title: "Manfacter gana el Premio EmprendeXXI CaixaBank-SODERCAN",
    desc: "El Diario Montañés cubre el galardón que reconoce el potencial innovador de Manfacter.",
    link: "https://www.eldiariomontanes.es/economia/manfacter-gana-premio-emprendexxi-caixabank-sodercan-20260429164255-nt.html",
  },
];

export default function ComplexModal() {
  const complexModalOpen = useCadStore((s) => s.complexModalOpen);
  const [newsIndex, setNewsIndex] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const prevNews = useCallback(() => {
    setNewsIndex((i) => (i > 0 ? i - 1 : NEWS_ITEMS.length - 1));
  }, []);

  const nextNews = useCallback(() => {
    setNewsIndex((i) => (i < NEWS_ITEMS.length - 1 ? i + 1 : 0));
  }, []);

  if (!complexModalOpen) return null;

  if (minimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 right-4 z-40 flex items-center gap-3 px-4 py-2.5 bg-snow rounded-buttons border border-silver-mist cursor-pointer"
        onClick={() => setMinimized(false)}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              className="w-1.5 h-1.5 rounded-full bg-azure"
            />
          ))}
        </div>
        <span className="text-caption text-graphite">Ingeniero IA trabajando...</span>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute bottom-4 right-4 z-40 w-80"
      >
        <div className="bg-snow rounded-3xl overflow-hidden border border-silver-mist">
          <div className="flex items-center justify-between px-5 py-3 border-b border-silver-mist">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-azure"
                  />
                ))}
              </div>
              <span className="text-body-sm font-medium text-ink">Ingeniero IA trabajando</span>
            </div>
            <button
              onClick={() => setMinimized(true)}
              className="w-6 h-6 rounded-full bg-fog text-graphite flex items-center justify-center hover:bg-silver-mist transition-colors cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
              </svg>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-silver-mist">
            <p className="text-body-sm text-graphite leading-relaxed">
              Esto puede tomar unos minutos. Mientras tanto, descubre más sobre Manfacter:
            </p>
          </div>

          <div className="px-5 py-3 flex gap-2">
            <a
              href="https://manfacter.com/sobre-manfacter/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-buttons bg-fog text-body-sm font-medium text-ink hover:bg-silver-mist transition-colors cursor-pointer no-underline"
            >
              Sobre nosotros
            </a>
            <a
              href="https://manfacter.com/guias-de-fabricacion/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-buttons bg-fog text-body-sm font-medium text-ink hover:bg-silver-mist transition-colors cursor-pointer no-underline"
            >
              Guías de fabricación
            </a>
          </div>

          <div className="px-5 py-3 border-t border-silver-mist">
            <div className="flex items-center justify-between mb-2">
              <span className="text-caption font-semibold text-ink">Noticias Manfacter</span>
              <div className="flex gap-1">
                <button
                  onClick={prevNews}
                  className="w-5 h-5 rounded-full bg-fog flex items-center justify-center hover:bg-silver-mist transition-colors cursor-pointer"
                >
                  <svg className="w-3 h-3 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextNews}
                  className="w-5 h-5 rounded-full bg-fog flex items-center justify-center hover:bg-silver-mist transition-colors cursor-pointer"
                >
                  <svg className="w-3 h-3 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <motion.a
              key={newsIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              href={NEWS_ITEMS[newsIndex].link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-fog rounded-xl p-3 hover:bg-silver-mist/50 transition-colors cursor-pointer no-underline"
            >
              <p className="text-body-sm font-medium text-ink">{NEWS_ITEMS[newsIndex].title}</p>
              <p className="text-caption text-graphite mt-0.5">{NEWS_ITEMS[newsIndex].desc}</p>
            </motion.a>
            <div className="flex justify-center gap-1.5 mt-2">
              {NEWS_ITEMS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === newsIndex ? "bg-azure" : "bg-silver-mist"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-silver-mist">
            <GearGame />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
