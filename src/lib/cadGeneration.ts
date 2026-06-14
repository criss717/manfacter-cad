/**
 * REST fallback for CAD generation.
 *
 * Routes to the new ForgeCAD endpoint (/api/generate) when CAD_ENGINE=manifold,
 * or falls back to the legacy Python backend during transition.
 */

function getRestUrl(): string {
  // New ForgeCAD engine — use Next.js API route
  const engine = process.env.NEXT_PUBLIC_CAD_ENGINE ?? "manifold";
  if (engine === "manifold") {
    return process.env.NEXT_PUBLIC_CAD_REST_URL ?? "/api/generate";
  }

  // Legacy build123d engine
  if (process.env.NEXT_PUBLIC_PROXY) return "";
  const host = process.env.NEXT_PUBLIC_BACKEND_HOST ?? "127.0.0.1";
  return `http://${host}:8000`;
}

export async function runCadGeneration(code: string): Promise<{
  ok: boolean;
  glb?: string;
  step?: string;
  stl?: string;
  facts?: Record<string, unknown>;
  params?: unknown[];
  code?: string;
  error?: string;
}> {
  const base = getRestUrl();
  const res = await fetch(`${base}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { ok: false, error: err.error || err.detail?.error || `Error ${res.status}` };
  }
  const data = await res.json();

  // Support both camelCase (new) and snake_case (legacy) response fields
  const glbUrl = data.glbUrl ?? data.glb_url;
  const stepUrl = data.stepUrl ?? data.step_url;
  const stlUrl = data.stlUrl ?? data.stl_url;

  return {
    ok: data.success ?? data.ok ?? true,
    glb: glbUrl || undefined,
    step: stepUrl || undefined,
    stl: stlUrl || undefined,
    facts: data.facts || undefined,
    params: data.params || undefined,
    code: data.code || undefined,
  };
}
