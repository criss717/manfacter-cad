"use client";

import { useEffect, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { useCadStore } from "@/store/cadStore";
import ViewCube3D, { syncViewCube } from "./ViewCube3D";

function AutoZoom() {
  const { scene, camera, controls } = useThree() as {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    if (!scene.children.length || !controls) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim * 2.2;
    const center = box.getCenter(new THREE.Vector3());
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    controls.target.copy(center);
    controls.update();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FloorPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <shadowMaterial transparent opacity={0.08} />
    </mesh>
  );
}

function GlbModel({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
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
    }
  }, [scene, color]);
  return scene ? <primitive object={scene} /> : null;
}

export default function CadExplorer() {
  const glbUrl = useCadStore((s) => s.glbUrl);
  const modelColor = useCadStore((s) => s.modelColor);
  const sceneBackground = useCadStore((s) => s.sceneBackground);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.344, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex-1 rounded-3xl overflow-hidden relative"
    >
      <Canvas
        key={glbUrl || "empty"}
        camera={{ position: [120, 80, 120], fov: 50, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: sceneBackground }}
        shadows
      >
        <hemisphereLight intensity={0.4} groundColor="#d1d1d6" />
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[60, 100, 80]}
          intensity={0.9}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={500}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
        />
        <directionalLight position={[-40, 30, -20]} intensity={0.25} />
        <directionalLight position={[0, 20, -80]} intensity={0.15} />

        <FloorPlane />

        <Environment preset="studio" background={false} />

        {glbUrl && (
          <Suspense fallback={null}>
            <GlbModel url={glbUrl} color={modelColor} />
            <AutoZoom />
          </Suspense>
        )}

        <ContactShadows
          position={[0, -0.04, 0]}
          opacity={0.15}
          scale={150}
          blur={2.5}
          far={10}
        />

        <OrbitControls
          ref={syncViewCube}
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={2000}
          target={[0, 0, 0]}
        />
      </Canvas>

      {glbUrl && <ViewCube3D />}

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
