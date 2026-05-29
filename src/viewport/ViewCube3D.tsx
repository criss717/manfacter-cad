"use client";

import { useCallback, useEffect, useState } from "react";
import * as THREE from "three";

const FACES = [
  { id: "arriba",  label: "ARRIBA",  dir: [ 0,  0, -1], cssRotate: "rotateY(180deg)",  transform: "translateZ(22px)" },
  { id: "abajo",   label: "ABAJO",   dir: [ 0,  0,  1], cssRotate: "rotateX(0deg)",    transform: "translateZ(22px)" },
  { id: "frente",  label: "FRENTE",  dir: [ 0,  1,  0], cssRotate: "rotateX(-90deg)",  transform: "translateZ(22px)" },
  { id: "atras",   label: "ATRAS",   dir: [ 0, -1,  0], cssRotate: "rotateX(90deg)",   transform: "translateZ(22px)" },
  { id: "der",     label: "DER",     dir: [ 1,  0,  0], cssRotate: "rotateY(90deg)",   transform: "translateZ(22px)" },
  { id: "izq",     label: "IZQ",     dir: [-1,  0,  0], cssRotate: "rotateY(-90deg)",  transform: "translateZ(22px)" },
];

const ISO_DIR = new THREE.Vector3(-0.577, -0.577, -0.577).normalize();

let _cam: THREE.PerspectiveCamera | null = null;
let _ctrl: { target: THREE.Vector3; update: () => void } | null = null;
let _currentFace = "abajo";

function updateFromCamera() {
  const cam = _cam;
  if (!cam) return { face: "abajo", rx: -25, ry: -40 };
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir).normalize();

  let bestFace = "abajo";
  let bestDot = -Infinity;
  for (const face of FACES) {
    const fd = new THREE.Vector3(...face.dir).normalize();
    const dot = dir.dot(fd);
    if (dot > bestDot) { bestDot = dot; bestFace = face.id; }
  }

  if (bestFace !== _currentFace) {
    const cur = FACES.find((f) => f.id === _currentFace);
    if (cur) {
      const curDot = dir.dot(new THREE.Vector3(...cur.dir).normalize());
      if (bestDot - curDot < 0.02) {
        bestFace = _currentFace;
      }
    }
  }
  _currentFace = bestFace;

  const rx = Math.asin(dir.y) * (180 / Math.PI);
  const ry = -Math.atan2(dir.x, dir.z) * (180 / Math.PI);

  return { face: bestFace, rx, ry };
}

export const syncViewCube = (controls: { target: THREE.Vector3; update: () => void } | null) => {
  if (!controls) return;
  _ctrl = controls;
  const orig = (controls as Record<string, unknown>);
  const cam = orig.object as THREE.PerspectiveCamera | undefined;
  if (cam) _cam = cam;
};

let _subscribers: Array<() => void> = [];
function subscribe(fn: () => void) {
  _subscribers.push(fn);
  return () => { _subscribers = _subscribers.filter((s) => s !== fn); };
}
function notify() {
  for (const fn of _subscribers) fn();
}

if (typeof window !== "undefined") {
  setInterval(() => {
    if (_ctrl) notify();
  }, 100);
}

export default function ViewCube3D() {
  const [state, setState] = useState(() => updateFromCamera());

  useEffect(() => {
    return subscribe(() => setState(updateFromCamera()));
  }, []);

  const goToFace = useCallback((faceId: string) => {
    const cam = _cam;
    const ctrl = _ctrl;
    if (!cam || !ctrl) return;
    const face = FACES.find((f) => f.id === faceId);
    if (!face) return;
    const dir = new THREE.Vector3(...face.dir);
    const t = ctrl.target.clone();
    const dist = cam.position.distanceTo(t) || 120;
    cam.position.copy(t.clone().addScaledVector(dir, -dist));

    switch (faceId) {
      case "arriba":
        cam.up.set(0, -1, 0);
        break;
      case "abajo":
        cam.up.set(0, 1, 0);
        break;
      case "frente":
      case "atras":
        cam.up.set(0, 0, 1);
        break;
      default:
        cam.up.set(0, 0, 1);
    }

    cam.lookAt(t);
    ctrl.update();
    setState(updateFromCamera());
  }, []);

  const goIso = useCallback(() => {
    const cam = _cam;
    const ctrl = _ctrl;
    if (!cam || !ctrl) return;
    const t = ctrl.target.clone();
    const dist = cam.position.distanceTo(t) || 140;
    cam.position.copy(t.clone().addScaledVector(ISO_DIR, -dist));
    cam.up.set(0, 0, 1);
    cam.lookAt(t);
    ctrl.update();
    setState(updateFromCamera());
  }, []);

  return (
    <div className="absolute bottom-14 right-6 z-10 select-none">
      <div className="relative" style={{ width: 60, height: 60, perspective: "200px" }}>
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${state.rx}deg) rotateY(${state.ry}deg)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          {FACES.map((face) => {
            const active = state.face === face.id;
            return (
              <button
                key={face.id}
                onClick={() => goToFace(face.id)}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                style={{
                  transform: `${face.cssRotate} ${face.transform}`,
                  borderRadius: 4,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  background: active ? "#0071e3" : "#ffffff",
                  color: active ? "#ffffff" : "#86868b",
                  border: active ? "1px solid #0071e3" : "1px solid #e8e8ed",
                }}
                title={`Vista ${face.label}`}
              >
                {face.label}
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={goIso}
        className="mt-8 w-full h-6 cursor-pointer rounded-md text-[8px] font-semibold tracking-wider transition-all border border-silver-mist bg-snow/90 backdrop-blur-sm text-ink hover:bg-snow"
        title="Vista isometrica"
      >
        ISO
      </button>
    </div>
  );
}
