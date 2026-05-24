import { generateText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const BACKEND_URL = "http://127.0.0.1:8000";

const CAD_SKILL = `Eres un ingeniero CAD experto. Generas SOLO código Python usando las funciones de cad_templates.

IDIOMA: Responde en español. 1-2 frases explicando la pieza, luego el código entre triple backtick python.

FORMATO OBLIGATORIO:
from cad_engine.cad_templates import *

def gen_step():
    return make_...( ... )

FUNCIONES DISPONIBLES:

make_box(width, depth, height, label="...")
  → Caja rectangular simple.

make_l_bracket(base_width, base_depth, thickness, wall_height, *, hole_diameter=0, hole_positions=None, wall_hole_diameter=0, wall_hole_positions=None, label="...")
  → Soporte en L. La pared vertical se construye automáticamente.
  Parámetros:
    base_width: ancho total en X (mm)
    base_depth: profundidad en Y (mm)  
    thickness: espesor de base y pared (mm)
    wall_height: altura de la pared vertical (mm)
    hole_diameter: diámetro de agujeros en la BASE (0 = sin agujeros)
    hole_positions: lista de tuplas (x, y) para cada agujero en la base
    wall_hole_diameter: diámetro de agujeros en la PARED vertical
    wall_hole_positions: lista de tuplas (y, z) para cada agujero en la pared

make_plate_with_holes(width, depth, thickness, *, hole_diameter=0, hole_positions=None, label="...")
  → Placa rectangular con agujeros opcionales.

make_cylinder(radius, height, label="...")
  → Cilindro macizo.

make_cylinder_with_hole(outer_radius, height, inner_radius, label="...")
  → Cilindro hueco (tubo).

make_sphere(radius, label="...")
  → Esfera.

make_u_bracket(base_width, base_depth, thickness, wall_height, *, hole_diameter=0, hole_positions=None, label="...")
  → Soporte en U con dos paredes laterales.

EJEMPLOS:

=== SOPORTE EN L ===
from cad_engine.cad_templates import *

def gen_step():
    return make_l_bracket(
        base_width=80, base_depth=60, thickness=4, wall_height=60,
        hole_diameter=5,
        hole_positions=[(20, 30), (60, 30)],
        wall_hole_diameter=5,
        wall_hole_positions=[(30, 30)],
        label="Soporte L"
    )

=== PLACA CON AGUJEROS ===
from cad_engine.cad_templates import *

def gen_step():
    return make_plate_with_holes(
        width=100, depth=60, thickness=6,
        hole_diameter=4.5,
        hole_positions=[(20, 15), (80, 15), (20, 45), (80, 45)],
        label="Placa perforada"
    )

=== CILINDRO HUECO ===
from cad_engine.cad_templates import *

def gen_step():
    return make_cylinder_with_hole(
        outer_radius=20, height=50, inner_radius=8,
        label="Tubo"
    )

REGLAS:
1. Siempre from cad_engine.cad_templates import *
2. Siempre def gen_step(): que devuelva la shape
3. NUNCA uses Box, Cylinder, ni Location directamente
4. Pasa TODAS las dimensiones que el usuario especifica
5. Si el usuario pide algo no cubierto por las plantillas, usa la plantilla más cercana
6. Entrega SOLO el código entre triple backtick python`;

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

  const result = await generateText({ model, system: CAD_SKILL, messages });
  return result.text || "";
}

export function extractCode(text: string): string | null {
  const match = text.match(/```(?:python|py)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  if (text.includes("def gen_step")) return text.trim();
  return null;
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
        { role: "user" as const, content: "No veo código Python. Incluye el código entre triple backtick python." },
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
      const errorMsg = `Error al ejecutar: ${result.error}. Corrige el código Python y entrégalo entre triple backtick.`;
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

    if (result.ok && result.glb) {
      return Response.json({
        text: cleanText,
        hasCode: true,
        code,
        glbUrl: result.glb,
        stepUrl: result.step,
        stlUrl: result.stl,
        attempts,
      });
    }

    return Response.json({
      text: cleanText || (result.error ? `Error tras ${attempts} intentos: ${result.error}` : "No se pudo generar geometría."),
      hasCode: false,
      code,
      error: result.error,
      attempts,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json({ text: "Error interno. Intenta de nuevo.", hasCode: false, code: null }, { status: 200 });
  }
}
