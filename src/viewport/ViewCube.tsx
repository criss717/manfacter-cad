"use client";

import { useCallback, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";

type Face = "front" | "back" | "left" | "right" | "top" | "bottom";

const faceDirections: Record<Face, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

const cameraRef = { current: null as THREE.PerspectiveCamera | null };
const controlsRef = {
  current: null as {
    target: THREE.Vector3;
    update: () => void;
  } | null,
};

export function updateCameraRef(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void }
) {
  cameraRef.current = camera;
  controlsRef.current = controls;
}

export default function ViewCube() {
  const lookAt = useCallback((face: Face) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    const dir = faceDirections[face];
    const dist = 100;
    const t = ctrl.target.clone();

    cam.position.set(t.x - dir[0] * dist, t.y - dir[1] * dist, t.z - dir[2] * dist);
    cam.lookAt(t);
    ctrl.update();
  }, []);

  const lookIso = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const dist = 120;
    const t = ctrl.target.clone();
    cam.position.set(t.x + dist * 0.6, t.y + dist * 0.4, t.z + dist * 0.6);
    cam.lookAt(t);
    ctrl.update();
  }, []);

  const faceStyle =
    "w-6 h-6 rounded-sm text-[8px] font-semibold flex items-center justify-center transition-all duration-[0.1s]";
  const activeFace = "bg-slate/80 text-snow";
  const inactiveFace = "bg-slate/40 text-silver-mist/60 hover:bg-slate/60 hover:text-snow";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="absolute bottom-4 left-4 z-10"
    >
      <div className="rounded-xl bg-obsidian/80 backdrop-blur-sm border border-silver-mist/20 p-1.5 flex flex-col items-center gap-0.5">
        <button onClick={() => lookAt("top")} className={`${faceStyle} ${inactiveFace}`}>
          T
        </button>
        <div className="flex gap-0.5">
          <button onClick={() => lookAt("left")} className={`${faceStyle} ${inactiveFace}`}>
            L
          </button>
          <button onClick={() => lookAt("front")} className={`${faceStyle} ${activeFace}`}>
            F
          </button>
          <button onClick={() => lookAt("right")} className={`${faceStyle} ${inactiveFace}`}>
            R
          </button>
          <button onClick={() => lookAt("back")} className={`${faceStyle} ${inactiveFace}`}>
            B
          </button>
        </div>
        <button onClick={() => lookAt("bottom")} className={`${faceStyle} ${inactiveFace}`}>
          D
        </button>
        <button
          onClick={lookIso}
          className="w-full h-5 rounded-sm text-[8px] font-semibold text-silver-mist/50 hover:bg-slate/40 hover:text-snow transition-all mt-0.5"
        >
          ISO
        </button>
      </div>
    </motion.div>
  );
}

export function ViewCubeSync() {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void };
  };

  useEffect(() => {
    updateCameraRef(camera, controls);
  }, [camera, controls]);

  return null;
}
