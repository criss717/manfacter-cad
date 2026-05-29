"use client";

import { useEffect, Suspense, useCallback, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import ViewCube3D, { syncViewCube } from "./ViewCube3D";

let _doZoom: (() => void) | null = null;

export function triggerViewportZoom() {
  if (_doZoom) { _doZoom(); return; }
  let attempts = 0;
  const retry = () => {
    if (_doZoom) _doZoom();
    else if (attempts < 20) { attempts++; setTimeout(retry, 100); }
  };
  retry();
}

function AutoZoom() {
  const { scene, camera, controls } = useThree() as {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };

  useEffect(() => {
    _doZoom = () => {
      if (!controls) return;
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const dist = maxDim * 2.2;
      const center = box.getCenter(new THREE.Vector3());
      camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
      controls.target.copy(center);
      controls.update();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => _doZoom?.());
    });

    return () => { _doZoom = null; };
  }, [scene, camera, controls]);

  return null;
}

function GlbModel({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat) {
            mat.roughness = 0.35;
            mat.metalness = 0.02;
            mat.color = new THREE.Color(color);
          }
        }
      });
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.set(-center.x, -center.y, -center.z);

      setTimeout(() => triggerViewportZoom(), 250);
    }
  }, [scene, color]);
  return scene ? <primitive object={scene} /> : null;
}

export default function CadExplorer() {
  const glbUrl = useCadStore((s) => s.glbUrl);
  const modelColor = useCadStore((s) => s.modelColor);
  const sceneBackground = useCadStore((s) => s.sceneBackground);
  const viewportFocusKey = useCadStore((s) => s.viewportFocusKey);
  const focusViewport = useCadStore((s) => s.focusViewport);
  const prevGlbRef = useRef<string | null>(null);

  useEffect(() => {
    triggerViewportZoom();
  }, [viewportFocusKey]);

  useEffect(() => {
    if (glbUrl && glbUrl !== prevGlbRef.current) {
      prevGlbRef.current = glbUrl;
      setTimeout(() => triggerViewportZoom(), 400);
    }
    if (!glbUrl) prevGlbRef.current = null;
  }, [glbUrl]);

  const handleFocus = useCallback(() => {
    focusViewport();
  }, [focusViewport]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex-1 rounded-3xl overflow-hidden relative"
    >
      <Canvas
        key={glbUrl || "empty"}
        camera={{ position: [120, 80, 120], fov: 50, near: 0.1, far: 5000, up: [0, 0, 1] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: sceneBackground }}
      >
        <hemisphereLight intensity={0.5} groundColor="#b0b0b4" />
        <ambientLight intensity={0.4} />
        <directionalLight position={[60, 80, 100]} intensity={1.0} />
        <directionalLight position={[-50, 30, -40]} intensity={0.3} />
        <directionalLight position={[0, 20, -80]} intensity={0.2} />

        <Environment preset="studio" background={false} />

        {glbUrl && (
          <Suspense fallback={null}>
            <GlbModel url={glbUrl} color={modelColor} />
            <AutoZoom />
          </Suspense>
        )}

        <OrbitControls
          makeDefault
          ref={syncViewCube}
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={10000}
          target={[0, 0, 0]}
        />
      </Canvas>

      {glbUrl && (
        <>
          <ViewCube3D />
          <button
            onClick={handleFocus}
            className="absolute bottom-13 cursor-pointer right-23 z-10 w-8 h-8 rounded-lg bg-snow/90 backdrop-blur-sm border border-silver-mist flex items-center justify-center hover:bg-snow transition-colors shadow-sm"
            title="Enfocar pieza"
          >
            <svg className="w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        </>
      )}

      {!glbUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: sceneBackground }}>
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
            className={sceneBackground === "#f5f5f7" || sceneBackground === "#ffffff" || sceneBackground === "#fff" ? "text-ink/25 text-body text-center leading-relaxed" : "text-white/40 text-body text-center leading-relaxed"}
          >
            Describe tu pieza en el chat<br />para verla aqui en 3D
          </motion.p>
        </div>
      )}
    </motion.div>
  );
}
