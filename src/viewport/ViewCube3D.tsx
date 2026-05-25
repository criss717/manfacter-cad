"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const FACES = [
  { id: "front",  label: "FRONT",  dir: [ 0,  0,  1], cssRotate: "rotateX(0deg)",    transform: "translateZ(22px)" },
  { id: "back",   label: "BACK",   dir: [ 0,  0, -1], cssRotate: "rotateX(180deg)",  transform: "translateZ(22px)" },
  { id: "right",  label: "RIGHT",  dir: [ 1,  0,  0], cssRotate: "rotateY(90deg)",   transform: "translateZ(22px)" },
  { id: "left",   label: "LEFT",   dir: [-1,  0,  0], cssRotate: "rotateY(-90deg)",  transform: "translateZ(22px)" },
  { id: "top",    label: "TOP",    dir: [ 0,  1,  0], cssRotate: "rotateX(-90deg)",  transform: "translateZ(22px)" },
  { id: "bottom", label: "BOTTOM", dir: [ 0, -1,  0], cssRotate: "rotateX(90deg)",   transform: "translateZ(22px)" },
];

const ISO_DIR = new THREE.Vector3(0.577, 0.333, 0.577).normalize();

interface ViewRefs {
  camera: THREE.PerspectiveCamera | null;
  controls: { target: THREE.Vector3; update: () => void } | null;
}

export const viewRefs: ViewRefs = { camera: null, controls: null };

export default function ViewCube3D() {
  const [activeFace, setActiveFace] = useState<string>("front");
  const [cubeRotation, setCubeRotation] = useState({ x: -20, y: -35 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const cam = viewRefs.camera;
      if (!cam) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }
      const camDir = new THREE.Vector3();
      cam.getWorldDirection(camDir);
      camDir.normalize();

      let bestFace = "front";
      let bestDot = -Infinity;
      for (const face of FACES) {
        const fd = new THREE.Vector3(...face.dir).normalize();
        const dot = camDir.dot(fd);
        if (dot > bestDot) { bestDot = dot; bestFace = face.id; }
      }

      const rx = Math.asin(-camDir.y) * (180 / Math.PI) * 0.5;
      const ry = Math.atan2(camDir.x, camDir.z) * (180 / Math.PI) * 0.5;
      setCubeRotation({ x: rx, y: ry });
      setActiveFace(bestFace);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const goToFace = useCallback((faceId: string) => {
    const cam = viewRefs.camera;
    const ctrl = viewRefs.controls;
    if (!cam || !ctrl) return;
    const face = FACES.find(f => f.id === faceId);
    if (!face) return;
    const dir = new THREE.Vector3(...face.dir);
    const t = ctrl.target.clone();
    const dist = cam.position.distanceTo(t) || 120;
    cam.position.copy(t.clone().addScaledVector(dir, -dist));
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    ctrl.update();
  }, []);

  const goIso = useCallback(() => {
    const cam = viewRefs.camera;
    const ctrl = viewRefs.controls;
    if (!cam || !ctrl) return;
    const t = ctrl.target.clone();
    const dist = cam.position.distanceTo(t) || 140;
    cam.position.copy(t.clone().addScaledVector(ISO_DIR, -dist));
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    ctrl.update();
  }, []);

  return (
    <div className="absolute bottom-6 right-6 z-10 select-none">
      <div className="relative" style={{ width: 64, height: 64, perspective: "200px" }}>
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${cubeRotation.x}deg) rotateY(${cubeRotation.y}deg)`,
            transition: "transform 0.1s linear",
          }}
        >
          {FACES.map((face) => (
            <button
              key={face.id}
              onClick={() => goToFace(face.id)}
              className={`absolute inset-0 flex items-center justify-center cursor-pointer border backdrop-blur-[1px] ${
                activeFace === face.id
                  ? "border-azure/60 bg-azure/15 text-snow"
                  : "border-silver-mist/20 bg-obsidian/80 text-silver-mist/60 hover:bg-slate/60 hover:text-snow"
              }`}
              style={{ transform: `${face.cssRotate} ${face.transform}`, borderRadius: 4, fontSize: 8, fontWeight: 600, letterSpacing: "0.04em" }}
              title={`Vista ${face.label}`}
            >
              {face.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={goIso}
        className="mt-1.5 w-full h-7 rounded-md text-[8px] font-semibold tracking-wider transition-all border border-silver-mist/10 bg-obsidian/80 text-silver-mist/40 hover:text-snow hover:bg-slate/40"
        title="Vista isometrica"
      >
        ISO
      </button>
    </div>
  );
}
