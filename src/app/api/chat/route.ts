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

const SKILL_MD           = loadRef("SKILL.md");
const MODELING_REF       = loadRef("references/build123d-modeling.md");
const STEP_GEN_REF       = loadRef("references/step-generation.md");
const POSITIONING_REF    = loadRef("references/positioning.md");
const REPAIR_LOOP        = loadRef("references/repair-loop.md");
const INSPECT_REF        = loadRef("references/inspection-and-validation.md");
const PARAMS_REF         = loadRef("references/parameters.md");
const NL_SPECS_REF       = loadRef("references/natural-language-specs.md");
const RENDER_REF         = loadRef("references/render-review.md");
const DXF_REF            = loadRef("references/dxf.md");
const EXPORTS_REF        = loadRef("references/supported-exports.md");

const CAD_SYSTEM_PROMPT = `${SKILL_MD}

---

## BUILD123D MODELING

${MODELING_REF}

---

## STEP GENERATION

${STEP_GEN_REF}

---

## POSITIONING & JOINTS

${POSITIONING_REF}

---

## INSPECTION & VALIDATION

${INSPECT_REF}

---

## PARAMETERS

${PARAMS_REF}

---

## NATURAL LANGUAGE SPECS

${NL_SPECS_REF}

---

## REPAIR STRATEGIES

${REPAIR_LOOP}

---

## RENDER REVIEW

${RENDER_REF}

---

## DXF

${DXF_REF}

---

## SUPPORTED EXPORTS

${EXPORTS_REF}

---

You are a CAD engineer agent with full access to the build123d + OpenCASCADE skill system.
Read the references above carefully before writing code. They contain everything you need.

Core rules:
- Units: millimeters. Z is UP. Base plane: XY.
- Every script must have: from build123d import *
- Every script must define: def gen_step(): return shape
- Prefer simple primitives + boolean ops over BuildPart/BuildSketch when possible.
- For holes: Cylinder(r, depth).moved(Location((x,y,z))) then subtract with -
- For horizontal cylinders: Cylinder(r, L, rotation=(0,90,0)).moved(...)
- For positioning: shape.moved(Location((x,y,z)))
- For chamfer/fillet: chamfer(edges().filter_by(...), length) or fillet(edges(...), radius)
- Box at corner: Box(X,Y,Z, align=(Align.MIN, Align.MIN, Align.MIN))
- Plane names: Plane.XY, Plane.YZ, Plane.XZ only. No XN, XP, YN, YP, ZN, ZP.
- edges() and faces() are METHODS: shape.edges() not shape.edges
- Closed profiles with close=True for sketches.

Respond in spanish. 1-2 sentences describing the part. Code between triple backtick python.`;


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
    model = c("gemini-3.5-flash");
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


export async function runCadGeneration(code: string): Promise<{ ok: boolean; glb?: string; step?: string; stl?: string; facts?: Record<string, unknown>; error?: string }> {
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
    facts: data.facts || undefined,
  };
}


function classifyError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("attributeerror")) {
    if (e.includes("plane")) return "ERROR: Plane.XN/XP/YN/YP/ZN/ZP no existen. Usa Plane.XY, Plane.YZ, o Plane.XZ.";
    if (e.includes("edges") || e.includes("faces")) return "ERROR: edges() y faces() son METODOS (con parentesis), no atributos. Usa shape.edges() no shape.edges.";
    return `ERROR: ${error}. Revisa la referencia build123d-modeling.md para la API correcta.`;
  }
  if (e.includes("typeerror")) {
    if (e.includes("context manager") || e.includes("__enter__")) return "ERROR: Ese objeto no es context manager. No uses 'with' con el. Consulta build123d-modeling.md.";
    if (e.includes("not callable")) return "ERROR: Llamaste algo como funcion que no lo es. Revisa parentesis vs atributos.";
    return `ERROR: ${error}. Revisa los tipos de los argumentos.`;
  }
  if (e.includes("syntaxerror")) return "ERROR de sintaxis Python. Revisa imports, indentacion, parentesis.";
  if (e.includes("importerror") || e.includes("modulenotfound")) return "ERROR: Falta 'from build123d import *' al inicio del script.";
  if (e.includes("fillet") || e.includes("chamfer")) {
    if (e.includes("multiple values for") || e.includes("argument")) {
      return "ERROR: En build123d, si aplicas chamfer()/fillet() directamente sobre un objeto Shape/Part (ej. shape.chamfer(...)), la firma es shape.chamfer(length, length2, edges). Si estás en un bloque context 'with BuildPart()', la función global es chamfer(edges, length). Asegúrate de no confundirlas ni pasar 'edges' como primer argumento al llamar al método de la instancia.";
    }
    return "ERROR: Reduce el radio/longitud. Usa edges().filter_by(Axis.X) para seleccionar aristas. Aplica filetes al final del modelo.";
  }
  if (e.includes("boolean") || e.includes("fuse") || e.includes("cut")) return "ERROR: Operacion booleana fallida. Verifica que las shapes tengan volumen solapado. Para cortes, la herramienta debe atravesar el objetivo.";
  if (e.includes("polyline") || e.includes("buildline") || e.includes("buildsketch")) return "ERROR: Polyline solo funciona dentro de BuildLine, no BuildSketch. Patron correcto: with BuildLine(): Polyline(...).";
  if (e.includes("sweep") || e.includes("loft") || e.includes("revolve")) return "ERROR en sweep/loft/revolve. Verifica que el perfil y el path/trayectoria sean validos. El perfil debe ser una Face para sweep.";
  return `ERROR: ${error}. Consulta las referencias para la API correcta y corrige.`;
}


export async function POST(req: Request) {
  try {
    const { messages, provider: reqProvider, currentCode } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid messages" }, { status: 400 });
    }

    const provider = reqProvider || process.env.LLM_PROVIDER || "gemini";

    // Incoming message shape from the client
    type IncomingMessage = {
      role?: string;
      content?: string;
      name?: string;
    };

    // Map history to CoreMessage structures (ensure proper discriminated unions)
    const conversation: CoreMessage[] = messages.map((m: IncomingMessage) => {
      const role = m.role as string;
      if (role === "tool") {
        // Cast via unknown because `CoreToolMessage` expects a different `content` shape
        return ({
          role: "tool",
          name: m.name || "tool",
          content: m.content,
        } as unknown) as CoreMessage;
      }

      // Fallback to known chat roles
      const chatRole = role === "system" || role === "user" || role === "assistant" ? role : "user";
      return {
        role: chatRole,
        content: m.content,
      } as CoreMessage;
    });

    // Inject the active code into the user's latest instruction if available
    if (currentCode && typeof currentCode === "string") {
      const lastIndex = conversation.length - 1;
      if (lastIndex >= 0 && conversation[lastIndex].role === "user") {
        conversation[lastIndex].content = `El código Python CAD actual de la pieza es:\n\`\`\`python\n${currentCode}\n\`\`\`\n\nBasándote en este código actual, realiza los cambios necesarios para cumplir con la siguiente petición:\n\n${conversation[lastIndex].content}`;
      } else {
        conversation.push({
          role: "system",
          content: `El código Python CAD actual de la pieza es:\n\`\`\`python\n${currentCode}\n\`\`\``,
        });
      }
    }

    let text = await callLLM(conversation, provider);
    let code = extractCode(text);

    if (!code) {
      conversation.push({ role: "assistant", content: text });
      conversation.push({ role: "user", content: "No veo codigo Python. Incluye el codigo entre triple backtick python." });
      text = await callLLM(conversation, provider);
      code = extractCode(text);
    }

    if (!code) {
      return Response.json({ text, hasCode: false, code: null });
    }

    let result = await runCadGeneration(code);
    let attempts = 1;

    while (!result.ok && attempts < 8) {
      const hint = classifyError(result.error || "");
      const errorMsg = `El codigo anterior fallo con este error:\n\n${result.error}\n\n${hint}\n\nCorrige el codigo y entregalo entre triple backtick python.`;

      conversation.push({ role: "assistant", content: `\`\`\`python\n${code}\n\`\`\`` });
      conversation.push({ role: "user", content: errorMsg });

      text = await callLLM(conversation, provider);
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
        facts: result.facts || null,
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
