const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_HOST
  ? `http://${process.env.NEXT_PUBLIC_BACKEND_HOST}:8000`
  : "http://127.0.0.1:8000";

export async function runCadGeneration(code: string): Promise<{
  ok: boolean;
  glb?: string;
  step?: string;
  stl?: string;
  facts?: Record<string, unknown>;
  error?: string;
}> {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
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
    glb: data.glb_url ? `${BACKEND_URL}${data.glb_url}` : undefined,
    step: data.step_url ? `${BACKEND_URL}${data.step_url}` : undefined,
    stl: data.stl_url ? `${BACKEND_URL}${data.stl_url}` : undefined,
    facts: data.facts || undefined,
  };
}
