"use client";

import { useEffect, useRef } from "react";

const TEETH = 10;

export default function GearGame() {
  const gearRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const gear = gearRef.current;
    if (!gear) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = gear.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 180;
      const speed = Math.max(0, 1 - Math.min(dist / maxDist, 1)) * 10;
      const sign = dx > 0 ? 1 : -1;
      velocityRef.current += (speed * sign - velocityRef.current) * 0.15;
    };

    const animate = () => {
      rotationRef.current += velocityRef.current;
      gear.style.transform = `rotate(${rotationRef.current}deg)`;
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const teeth = Array.from({ length: TEETH }, (_, i) => {
    const angle = (i * 360) / TEETH;
    return (
      <div
        key={i}
        className="absolute w-5 h-2 bg-azure rounded-2xl"
        style={{
          top: "50%",
          left: "50%",
          marginLeft: -10,
          marginTop: -4,
          transformOrigin: "10px 4px",
          transform: `rotate(${angle}deg) translateX(30px)`,
        }}
      />
    );
  });

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <p className="text-caption text-graphite">Mueve el cursor para girar el engranaje</p>
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div ref={gearRef} className="relative w-16 h-16">
          {teeth}
          <div className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-silver-mist flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-azure" />
          </div>
        </div>
      </div>
    </div>
  );
}
