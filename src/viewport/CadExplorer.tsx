"use client";

import { useEffect, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import ViewCube3D, { viewRefs } from "./ViewCube3D";
import { useThree } from "@react-three/fiber";

function ViewCubeSync() {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void };
  };
  useEffect(() => {
    viewRefs.camera = camera;
    viewRefs.controls = controls;
  }, [camera, controls]);
  return null;
}

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat) {
            mat.roughness = 0.4;
            mat.metalness = 0.05;
            mat.side = THREE.DoubleSide;
          }
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

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (glbUrl) setKey((k) => k + 1);
  }, [glbUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: mounted ? 1 : 0 }}
      transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex-1 rounded-[28px] overflow-hidden relative"
    >
      <Canvas
        key={key}
        camera={{ position: [120, 80, 120], fov: 50, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: "#3a3a3c" }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 10]} intensity={1} castShadow />
        <directionalLight position={[-5, -5, -5]} intensity={0.2} />
        <Grid
          infiniteGrid
          cellSize={5}
          cellThickness={0.5}
          sectionSize={50}
          sectionThickness={1.5}
          sectionColor="#555"
          cellColor="#444"
          fadeDistance={120}
        />
        <Environment preset="city" background={false} />
        {glbUrl && (
          <Suspense fallback={null}>
            <GlbModel url={glbUrl} />
          </Suspense>
        )}
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={2000}
          target={[0, 0, 0]}
        />
        <ViewCubeSync />
      </Canvas>

      {glbUrl && <ViewCube3D />}

      {!glbUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "#3a3a3c" }}>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-white/50 text-body text-center leading-relaxed"
          >
            Describe tu pieza en el chat<br />para verla aqui en 3D
          </motion.p>
        </div>
      )}

      <div className="absolute bottom-4 left-4 text-[10px] text-white/30 font-medium tracking-wider uppercase">
        {glbUrl ? "OpenCASCADE" : ""}
      </div>
    </motion.div>
  );
}

