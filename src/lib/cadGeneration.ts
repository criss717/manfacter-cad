function getBackendUrl(): string {
  const host = process.env.NEXT_PUBLIC_BACKEND_HOST;
  if (host) {
    return `http://${host}:8000`;
  }
  return "";
}

export async function runCadGeneration(code: string): Promise<{
  ok: boolean;
  glb?: string;
  step?: string;
  stl?: string;
  facts?: Record<string, unknown>;
  error?: string;
}> {
  const base = getBackendUrl();
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.json();
    return { ok: false, error: err.detail?.error || `Error ${res.status}` };
  }
  const data = await res.json();
  return {
    ok: true,
    glb: data.glb_url ? `${base}${data.glb_url}` : undefined,
    step: data.step_url ? `${base}${data.step_url}` : undefined,
    stl: data.stl_url ? `${base}${data.stl_url}` : undefined,
    facts: data.facts || undefined,
  };
}
