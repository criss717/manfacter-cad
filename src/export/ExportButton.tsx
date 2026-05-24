"use client";

import { useCadStore } from "@/store/cadStore";

export default function ExportPanel() {
  const stepUrl = useCadStore((s) => s.stepUrl);
  const stlUrl = useCadStore((s) => s.stlUrl);
  const hasModel = !!stepUrl;

  return (
    <div className="flex items-center gap-2">
      <a
        href={stlUrl || "#"}
        download
        className={`rounded-full text-caption font-medium px-4 py-1.5 transition-colors duration-100 ${
          hasModel
            ? "bg-snow text-ink hover:bg-silver-mist/50 cursor-pointer"
            : "bg-fog text-graphite cursor-not-allowed opacity-40 pointer-events-none"
        }`}
      >
        STL
      </a>
      <a
        href={stepUrl || "#"}
        download
        className={`rounded-full text-caption font-medium px-4 py-1.5 transition-colors duration-100 ${
          hasModel
            ? "bg-azure text-snow hover:bg-cobalt-link cursor-pointer"
            : "bg-fog text-graphite cursor-not-allowed opacity-40 pointer-events-none"
        }`}
      >
        STEP
      </a>
    </div>
  );
}
