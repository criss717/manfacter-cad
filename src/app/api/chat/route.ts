import { generateText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { readFileSync } from "fs";
import { join } from "path";

const BACKEND_URL = "http://127.0.0.1:8000";

function loadRef(name: string): string {
  try {
    const p = join(process.cwd(), "..", "text-to-cad", "skills", "cad", name);
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

const SKILL_MD = loadRef("SKILL.md");
const MODELING_REF = loadRef("references/build123d-modeling.md");
const STEP_GEN_REF = loadRef("references/step-generation.md");
const POSITIONING_REF = loadRef("references/positioning.md");

const CAD_SYSTEM_PROMPT = `${SKILL_MD}

---

## build123d modeling reference

${MODELING_REF}

---

## Positioning reference

${POSITIONING_REF}

---

## STEP generation reference

${STEP_GEN_REF}

---

You are an expert CAD engineer. Generate build123d Python code with a gen_step() function.
Respond in spanish, 1-2 sentences describing the part, then the code between triple backtick python.

Critical build123d API:
- PREFER simple primitives (Box+Cylinder+boolean) over BuildPart/Hole. Only use BuildPart for complex multi-body parts.
- Box positioning: Box(X,Y,Z,align=(Align.MIN,Align.MIN,Align.MIN)).moved(Location((x,y,z)))
- Holes: Cylinder(r, depth).moved(Location(...)) then subtract with -
- Horizontal holes: Cylinder(r, L, rotation=(0,90,0)).moved(Location((x,y,z)))
- Gusset sketch pattern (must use close=True, make_face):
    with BuildSketch(Plane.XZ) as p:
        with BuildLine() as ln:
            Polyline((0,0), (-L,0), (0,H), close=True)
        make_face()
    gusset = extrude(p.sketch, amount=T)
- Plane(origin=..., z_dir=...) is NOT a context manager. Use Locations(plane, *pts) inside BuildPart.
- Make every polyline a CLOSED loop: either close=True or first != last point.
- Edge selection for fillet: edges().filter_by(Axis.Y).sort_by(Axis.Z)[:2]
- These do NOT exist: filter_by_position, filter_by_point, start_point, end_point, edge_at, tangent_at_start, tangent_at_end

VERIFIED working example (L-bracket with gussets, holes, fillet):
\`\`\`python
from build123d import *
def gen_step():
    base_l = 100.0; base_w = 50.0; base_t = 5.0
    wall_h = 60.0; wall_t = 5.0; hole_d = 4.5
    gusset_l = 30.0; gusset_h = 30.0
    base = Box(base_l, base_w, base_t, align=(Align.MIN, Align.MIN, Align.MIN))
    wall = Box(wall_t, base_w, wall_h, align=(Align.MIN, Align.MIN, Align.MIN))
    wall = wall.moved(Location((base_l - wall_t, 0, 0)))
    cuerpo = base + wall
    interior_edges = cuerpo.edges().filter_by(Axis.Y).sort_by(Axis.Z)[:2]
    cuerpo = fillet(interior_edges, 3.0)
    cuerpo -= Cylinder(hole_d/2, base_t+2).moved(Location((20, base_w/2, base_t/2)))
    cuerpo -= Cylinder(hole_d/2, base_t+2).moved(Location((80, base_w/2, base_t/2)))
    cuerpo -= Cylinder(hole_d/2, wall_t+2, rotation=(0,90,0)).moved(Location((base_l-wall_t/2, base_w/2, 15)))
    cuerpo -= Cylinder(hole_d/2, wall_t+2, rotation=(0,90,0)).moved(Location((base_l-wall_t/2, base_w/2, 45)))
    with BuildSketch(Plane.XZ) as perfil:
        with BuildLine() as ln:
            Polyline((0,0), (-gusset_l,0), (0,gusset_h), close=True)
        make_face()
    gusset = extrude(perfil.sketch, amount=wall_t)
    cuerpo += gusset.moved(Location((base_l-wall_t, 0, base_t)))
    cuerpo += gusset.moved(Location((base_l-wall_t, base_w-wall_t, base_t)))
    cuerpo.label = "Soporte L reforzado"
    return cuerpo
\`\`\``;


export async function callLLM(messages: CoreMessage[], provider: string) {
  let model;
  if (provider === "deepseek") {
    const c = createOpenAI({ baseURL: "https://api.opencode.go/v1", apiKey: process.env.OPENCODE_API_KEY ?? "" });
    model = c("deepseek-v4-pro");
  } else if (provider === "openai") {
    const c = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
    model = c("gpt-4o");
  } else {
    const c = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });
    model = c("gemini-2.5-flash");
  }

  const result = await generateText({ model, system: CAD_SYSTEM_PROMPT, messages });
  return result.text || "";
}

export function extractCode(text: string): string | null {
  const match = text.match(/```(?:python|py)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  if (text.includes("def gen_step")) return text.trim();
  return null;
}

export function extractParams(code: string): Record<string, number> {
  const params: Record<string, number> = {};
  const re = /^(\w+)\s*=\s*([\d.]+)\s*$/gm;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    const val = parseFloat(m[2]);
    if (!isNaN(val) && !["math", "pi"].includes(name) && name.length > 1) {
      params[name] = val;
    }
  }
  return params;
}

export async function runCadGeneration(code: string): Promise<{ ok: boolean; glb?: string; step?: string; stl?: string; error?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
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
  };
}

export async function POST(req: Request) {
  try {
    const { messages, provider: reqProvider } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid messages" }, { status: 400 });
    }

    const provider = reqProvider || process.env.LLM_PROVIDER || "gemini";
    const history = messages.slice(-10) as CoreMessage[];

    let text = await callLLM(history, provider);
    let code = extractCode(text);

    if (!code) {
      const retryMsg = [
        { role: "user" as const, content: messages[messages.length - 1]?.content || "" },
        { role: "assistant" as const, content: text },
        { role: "user" as const, content: "No veo codigo Python. Incluye el codigo entre triple backtick python." },
      ];
      text = await callLLM(retryMsg, provider);
      code = extractCode(text);
    }

    if (!code) {
      return Response.json({ text, hasCode: false, code: null });
    }

    let result = await runCadGeneration(code);
    let attempts = 1;

    while (!result.ok && attempts < 3) {
      const errorMsg = `Error al ejecutar: ${result.error}. Corrige el codigo Python y entregalo entre triple backtick python.`;
      const fixMessages: CoreMessage[] = [
        { role: "user", content: messages[messages.length - 1]?.content || "" },
        { role: "assistant", content: code },
        { role: "user", content: errorMsg },
      ];
      text = await callLLM(fixMessages, provider);
      code = extractCode(text);
      if (!code) break;
      result = await runCadGeneration(code);
      attempts++;
    }

    const cleanText = text.replace(/```[\s\S]*?```/g, "").trim();
    const params = code ? extractParams(code) : {};

    if (result.ok && result.glb) {
      return Response.json({
        text: cleanText,
        hasCode: true,
        code,
        params,
        glbUrl: result.glb,
        stepUrl: result.step,
        stlUrl: result.stl,
        attempts,
      });
    }

    return Response.json({
      text: cleanText || (result.error ? `Error tras ${attempts} intentos: ${result.error}` : "No se pudo generar geometria."),
      hasCode: false,
      code,
      params,
      error: result.error,
      attempts,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json({ text: "Error interno. Intenta de nuevo.", hasCode: false, code: null }, { status: 200 });
  }
}
