"use client";

import { useEffect, useState, Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import ViewCube, { ViewCubeSync } from "./ViewCube";

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.set(-center.x, -center.y, -center.z);
    }
  }, [scene]);
  return scene ? <primitive object={scene} /> : null;
}

export default function CadExplorer() {
  const glbUrl = useCadStore((s) => s.glbUrl);
  const [mounted, setMounted] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (glbUrl) setKey((k) => k + 1);
  }, [glbUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: mounted ? 1 : 0 }}
      transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex-1 rounded-[28px] overflow-hidden bg-obsidian relative"
    >
      <Canvas
        key={key}
        camera={{ position: [120, 80, 120], fov: 50, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: "#1d1d1f" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />
        <Grid
          infiniteGrid
          cellSize={5}
          cellThickness={0.5}
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#444"
          cellColor="#2a2a2c"
          fadeDistance={120}
          position={[0, -0.5, 0]}
        />
        <Environment preset="studio" />
        <Suspense>{glbUrl && <GlbModel url={glbUrl} />}</Suspense>
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={2000}
          target={[0, 20, 0]}
        />
        <ViewCubeSync />
      </Canvas>

      {mounted && <ViewCube />}

      {!glbUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-silver-mist/60 text-body text-center leading-relaxed"
          >
            Describe tu pieza en el chat<br />para verla aquí en 3D
          </motion.p>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-[10px] text-silver-mist/50 font-medium tracking-wider uppercase">
        {glbUrl ? "OpenCASCADE" : ""}
      </div>
    </motion.div>
  );
}
