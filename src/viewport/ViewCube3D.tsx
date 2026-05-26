"use client";

import { useCallback, useEffect, useState } from "react";
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

let _cam: THREE.PerspectiveCamera | null = null;
let _ctrl: { target: THREE.Vector3; update: () => void } | null = null;

function updateFromCamera() {
  const cam = _cam;
  if (!cam) return { face: "front" as string, rx: -20, ry: -35 };
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir).normalize();
  const viewDir = dir.clone().negate();

  let bestFace = "front";
  let bestDot = -Infinity;
  for (const face of FACES) {
    const fd = new THREE.Vector3(...face.dir).normalize();
    const dot = viewDir.dot(fd);
    if (dot > bestDot) { bestDot = dot; bestFace = face.id; }
  }
  const rx = Math.asin(-viewDir.y) * (180 / Math.PI);
  const ry = Math.atan2(-viewDir.x, -viewDir.z) * (180 / Math.PI);
  return { face: bestFace, rx, ry };
}

export const syncViewCube = (controls: { target: THREE.Vector3; update: () => void } | null) => {
  if (!controls) return;
  _ctrl = controls;
  const orig = controls as Record<string, unknown>;
  const cam = orig.object as THREE.PerspectiveCamera | undefined;
  if (cam) _cam = cam;
};

let _subscribers: Array<() => void> = [];
export function subscribeViewCube(fn: () => void) {
  _subscribers.push(fn);
  return () => { _subscribers = _subscribers.filter((s) => s !== fn); };
}
function notifySubscribers() {
  for (const fn of _subscribers) fn();
}

export default function ViewCube3D() {
  const [state, setState] = useState(() => updateFromCamera());

  useEffect(() => {
    const unsub = subscribeViewCube(() => setState(updateFromCamera()));
    let id: number;
    const loop = () => {
      if (_ctrl) {
        setState((prev) => {
          const next = updateFromCamera();
          if (next.face !== prev.face || Math.abs(next.rx - prev.rx) > 0.5 || Math.abs(next.ry - prev.ry) > 0.5) {
            return next;
          }
          return prev;
        });
        notifySubscribers();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      unsub();
      cancelAnimationFrame(id);
    };
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
    cam.up.set(0, 1, 0);
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
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    ctrl.update();
    setState(updateFromCamera());
  }, []);

  return (
    <div className="absolute bottom-6 right-6 z-10 select-none">
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
                  background: active ? "#0071e3" : "#e8e8ed",
                  color: active ? "#ffffff" : "#86868b",
                  border: active ? "1px solid #0071e3" : "1px solid #d2d2d7",
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
        className="mt-1.5 w-full h-6 rounded-md text-[8px] font-semibold tracking-wider transition-all border border-[#d2d2d7] bg-[#e8e8ed] text-[#86868b] hover:text-ink hover:bg-[#dcdce0]"
        title="Vista isometrica"
      >
        ISO
      </button>
    </div>
  );
}
