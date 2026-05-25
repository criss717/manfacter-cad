import { runCadGeneration } from "../route";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return Response.json({ error: "Code is required" }, { status: 400 });
    }

    const result = await runCadGeneration(code);

    if (!result.ok) {
      return Response.json({ error: result.error || "Generation failed" }, { status: 422 });
    }

    return Response.json({
      glb: result.glb,
      step: result.step,
      stl: result.stl,
    });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
