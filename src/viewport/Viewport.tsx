"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useCadStore } from "@/store/cadStore";
import {
  ensureEngine,
  isEngineReady,
} from "@/cad";
import {
  buildSceneObjects,
} from "./sceneBuilder";
import type { SceneObject } from "./sceneBuilder";
import ViewCube, { ViewCubeSync } from "./ViewCube";
import { motion, AnimatePresence } from "framer-motion";

function ShapeMesh({ obj }: { obj: SceneObject }) {
  return (
    <mesh geometry={obj.geometry} visible={obj.visible}>
      <meshStandardMaterial
        color={obj.color}
        roughness={0.35}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SceneRenderer({ objects }: { objects: SceneObject[] }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />
      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#d2d2d7"
        cellColor="#3a3a3c"
        fadeDistance={100}
      />
      <Environment preset="studio" />
      {objects.map((obj) => (
        <ShapeMesh key={obj.id} obj={obj} />
      ))}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={2000}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function Viewport() {
  const shapes = useCadStore((s) => s.shapes);
  const [ready, setReady] = useState(isEngineReady());
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (ready) return;
    ensureEngine()
      .then(() => setReady(true))
      .catch((e) => {
        console.error("Kernel init error:", e);
        setError("Error al cargar el motor 3D. Recarga la página.");
      });
  }, [ready]);

  const sceneObjects = useMemo(() => {
    if (!ready) return [];
    return buildSceneObjects(shapes);
  }, [shapes, ready]);

  const shapeCount = Object.keys(shapes).length;

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-obsidian rounded-[28px]">
        <p className="text-snow text-body">{error}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: mounted ? 1 : 0 }}
      transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex-1 rounded-[28px] overflow-hidden bg-obsidian relative"
    >
      <Canvas
        camera={{ position: [120, 80, 120], fov: 50, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: "#1d1d1f" }}
      >
        <SceneRenderer objects={sceneObjects} />
        <ViewCubeSync />
      </Canvas>

      {ready && <ViewCube />}

      <AnimatePresence>
        {!ready && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian/90 gap-4"
          >
            <div className="w-10 h-10 rounded-full border-2 border-snow/20 border-t-azure animate-spin" />
            <p className="text-silver-mist text-body-sm">Iniciando motor 3D...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ready && shapeCount === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-silver-mist/60 text-body"
            >
              Escribe en el chat para crear tu primera pieza
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 right-4 text-[10px] text-silver-mist/50 font-medium tracking-wider uppercase">
        {shapeCount > 0 ? `${shapeCount} piezas` : "Manifold"}
      </div>
    </motion.div>
  );
}
