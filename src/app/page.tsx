"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-fog flex flex-col">
      <motion.header
        initial={{ y: -44 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="h-11 flex items-center justify-between px-5 bg-fog/80 backdrop-blur-md border-b border-silver-mist sticky top-0 z-50"
      >
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="ManfacterCAD" width={22} height={22} className="rounded-md" />
          <span className="text-body-sm font-semibold text-ink tracking-tight">ManfacterCAD</span>
        </div>
        <Link
          href="/cad"
          className="rounded-full bg-azure text-snow text-caption font-medium px-4 py-1.5 hover:bg-cobalt-link transition-colors duration-[0.1s]"
        >
          Comenzar
        </Link>
      </motion.header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
          className="max-w-[680px] text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="mb-8"
          >
            <Image
              src="/logo.png"
              alt="ManfacterCAD"
              width={72}
              height={72}
              className="mx-auto rounded-[20px]"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="text-subheading font-semibold text-ink tracking-tight mb-3"
          >
            Diseño 3D con IA para fabricación
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-display font-bold text-ink tracking-[-0.022em] leading-[1.04] mb-6"
          >
            Crea piezas
            <br />
            hablando
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="text-body text-graphite max-w-[460px] mx-auto mb-12 leading-relaxed"
          >
            Describe la pieza que necesitas fabricar en lenguaje natural.
            La IA la modela al instante con medidas exactas en milímetros.
            Exporta a STL, STEP y más.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.0 }}
          >
            <Link
              href="/cad"
              className="inline-flex rounded-full bg-azure text-snow text-body px-7 py-3 hover:bg-cobalt-link transition-colors duration-[0.1s] font-medium shadow-[0_0_0_4px_rgba(0,113,227,0.12)]"
            >
              Empezar ahora
            </Link>
          </motion.div>
        </motion.div>
      </main>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
        className="py-8 text-center text-caption text-graphite border-t border-silver-mist"
      >
        Manfacter — Servicios de fabricación 3D
      </motion.footer>
    </div>
  );
}
