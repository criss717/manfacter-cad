"use client";

import { useCadStore } from "@/store/cadStore";

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("not found");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(url, "_blank");
  }
}

export default function ExportPanel() {
  const stepUrl = useCadStore((s) => s.stepUrl);
  const stlUrl = useCadStore((s) => s.stlUrl);
  const isProcessing = useCadStore((s) => s.isProcessing);
  const hasModel = !!stepUrl;

  if (!hasModel) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-fog text-graphite cursor-not-allowed opacity-40 pointer-events-none text-caption font-medium px-4 py-1.5">
          {isProcessing ? "Generando..." : "STL"}
        </span>
        <span className="rounded-full bg-fog text-graphite cursor-not-allowed opacity-40 pointer-events-none text-caption font-medium px-4 py-1.5">
          {isProcessing ? "" : "STEP"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => stlUrl && downloadFile(stlUrl, "modelo.stl")}
        className="rounded-full bg-snow text-ink hover:bg-silver-mist/50 text-caption font-medium px-4 py-1.5 transition-colors cursor-pointer"
      >
        STL
      </button>
      <button
        onClick={() => downloadFile(stepUrl!, "modelo.step")}
        className="rounded-full bg-azure text-snow hover:bg-cobalt-link text-caption font-medium px-4 py-1.5 transition-colors cursor-pointer"
      >
        STEP
      </button>
    </div>
  );
}
