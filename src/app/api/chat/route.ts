import { generateText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { readFileSync } from "fs";
import { join } from "path";

const BACKEND_URL = "http://127.0.0.1:8000";
const LLM_TIMEOUT_MS = 180_000;

function loadRef(name: string): string {
  try {
    const p = join(process.cwd(), "references", name);
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

const SKILL_MD        = loadRef("SKILL.md");
const MODELING_REF    = loadRef("build123d-modeling.md");
const STEP_GEN_REF    = loadRef("step-generation.md");
const POSITIONING_REF = loadRef("positioning.md");
const REPAIR_LOOP     = loadRef("repair-loop.md");
const INSPECT_REF     = loadRef("inspection-and-validation.md");
const PARAMS_REF      = loadRef("parameters.md");
const NL_SPECS_REF    = loadRef("natural-language-specs.md");
const RENDER_REF      = loadRef("render-review.md");
const DXF_REF         = loadRef("dxf.md");
const EXPORTS_REF     = loadRef("supported-exports.md");

const CAD_SYSTEM_PROMPT = `Eres un ingeniero CAD experto en build123d + OpenCASCADE. Tu objetivo: generar codigo Python 3D valido y preciso para fabricacion (impresion 3D, CNC, mecanizado).

---

## REGLAS CRITICAS (violar esto = error garantizado)

1. Unidades: milimetros. Eje Z hacia ARRIBA. Plano base: XY.
2. TODO script debe empezar con: from build123d import *
3. TODO script debe definir: def gen_step(): return shape
4. Plane.XY, Plane.YZ, Plane.XZ SOLO esos. NUNCA Plane.XN, XP, YN, YP, ZN, ZP.
5. edges() y faces() son METODOS con parentesis: shape.edges() no shape.edges
6. Usa shape.moved(Location((x, y, z))) para posicionar, NO Pos() solo.
7. Agujeros: Cylinder(r, h).moved(Location((x,y,z))) y restar con -
8. Cilindros horizontales: Cylinder(r, L, rotation=(0, 90, 0)).moved(Location((x,y,z)))
9. Box alineada a esquina: Box(X, Y, Z, align=(Align.MIN, Align.MIN, Align.MIN))
10. Prefiere primitivas + booleanos sobre BuildPart/BuildSketch cuando sea posible.
11. Chamfer/Fillet: sobre el solido final, usa edges().filter_by(Axis.X) para seleccionar aristas.
12. Respondes en espanol. 1-2 frases describiendo la pieza. Codigo entre triple backtick python.

---

## REFERENCIA COMPLETA DE BUILD123D

${SKILL_MD}

---

## BUILD123D MODELING (API completa)

${MODELING_REF}

---

## GENERACION DE STEP

${STEP_GEN_REF}

---

## POSICIONAMIENTO Y JOINTS

${POSITIONING_REF}

---

## INSPECCION Y VALIDACION

${INSPECT_REF}

---

## PARAMETROS

${PARAMS_REF}

---

## ESPECIFICACIONES EN LENGUAJE NATURAL

${NL_SPECS_REF}

---

## ESTRATEGIAS DE REPARACION

${REPAIR_LOOP}

---

## REVISION DE RENDER

${RENDER_REF}

---

## DXF

${DXF_REF}

---

## EXPORTACIONES SOPORTADAS

${EXPORTS_REF}`;


function llmErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (lower.includes("other side closed") || lower.includes("socket") || lower.includes("und_err")) {
    return "Error de conexion con el modelo de IA. El servidor remoto cerro la conexion. Verifica tu conexion a internet, la clave API, o intenta con otro proveedor.";
  }
  if (lower.includes("timeout") || lower.includes("abort")) {
    return "El modelo de IA tardo demasiado en responder (timeout). Intenta de nuevo o cambia de proveedor en el selector.";
  }
  if (lower.includes("429") || lower.includes("rate") || lower.includes("quota")) {
    return "Limite de cuota alcanzado con el proveedor de IA. Espera unos minutos o cambia de proveedor.";
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("key")) {
    return "Error de autenticacion con el proveedor de IA. Verifica tu clave API en las variables de entorno.";
  }
  if (lower.includes("400") || lower.includes("invalid") && lower.includes("model")) {
    return "El modelo de IA especificado no es valido o no esta disponible. Prueba con otro proveedor.";
  }
  return `Error inesperado del modelo IA: ${msg}. Intenta de nuevo o cambia de proveedor.`;
}


export async function callLLM(messages: CoreMessage[], provider: string) {
  const opencodeKey = process.env.OPENCODE_API_KEY ?? "";
  let model: ReturnType<ReturnType<typeof createOpenAICompatible>> | ReturnType<ReturnType<typeof createOpenAI>> | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  if (provider === "deepseek" || provider === "glm" || provider === "kimi") {
    const c = createOpenAICompatible({
      name: "opencode-go",
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: { Authorization: `Bearer ${opencodeKey}` },
    });
    if (provider === "deepseek") model = c("deepseek-v4-pro");
    else if (provider === "glm") model = c("glm-5.1");
    else model = c("kimi-k2.6");
  } else if (provider === "openai") {
    const c = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
    model = c("gpt-4o");
  } else {
    const c = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });
    model = c("gemini-3.5-flash");
  }
  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system: CAD_SYSTEM_PROMPT,
    messages,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
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


function classifyError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("attributeerror")) {
    if (e.includes("plane")) return "ERROR: Plane.XN/XP/YN/YP/ZN/ZP no existen. Usa Plane.XY, Plane.YZ, o Plane.XZ.";
    if (e.includes("edges") || e.includes("faces")) return "ERROR: edges() y faces() son METODOS (con parentesis), no atributos. Usa shape.edges() no shape.edges.";
    return `ERROR: ${error}. Revisa la referencia build123d-modeling.md para la API correcta.`;
  }
  if (e.includes("typeerror")) {
    if (e.includes("cylinder") || e.includes("cylind")) return "ERROR: Cylinder acepta ambas formas: Cylinder(radio, altura) posicional, o Cylinder(radius=radio, height=altura) con keywords. NO existen parametros 'r' ni 'h'. Usa radius= y height= o pásalos posicionales.";
    if (e.includes("context manager") || e.includes("__enter__")) return "ERROR: Ese objeto no es context manager. No uses 'with' con el. Consulta build123d-modeling.md.";
    if (e.includes("not callable")) return "ERROR: Llamaste algo como funcion que no lo es. Revisa parentesis vs atributos.";
    return `ERROR: ${error}. Revisa los tipos de los argumentos.`;
  }
  if (e.includes("syntaxerror")) return "ERROR de sintaxis Python. Revisa imports, indentacion, parentesis.";
  if (e.includes("importerror") || e.includes("modulenotfound")) return "ERROR: Falta 'from build123d import *' al inicio del script.";
  if (e.includes("fillet") || e.includes("chamfer")) {
    if (e.includes("multiple values for") || e.includes("argument")) {
      return "ERROR: En build123d, la firma de fillet en solido es shape.fillet(radius, [edges]). Pasa los edges como LISTA: [edge], no como edge suelto. Si usas BuildPart/BuildLine, la funcion global fillet toma (objects, radius=value).";
    }
    return "ERROR: Reduce el radio/longitud o usa max_fillet() para encontrar el maximo permitido. Aplica filetes ANTES de restar agujeros cuando sea posible. Selecciona aristas con edges().filter_by(Axis.X).sort_by(Axis.X)[indice].";
  }
  if (e.includes("boolean") || e.includes("fuse") || e.includes("cut")) return "ERROR: Operacion booleana fallida. Verifica que las shapes tengan volumen solapado. Para cortes, la herramienta debe atravesar el objetivo completamente.";
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

    type IncomingMessage = { role?: string; content?: string; name?: string; image?: string };

    const conversation: CoreMessage[] = messages.map((m: IncomingMessage) => {
      const role = m.role as string;
      if (role === "tool") {
        return { role: "tool", name: m.name || "tool", content: m.content } as unknown as CoreMessage;
      }
      const chatRole = role === "system" || role === "user" || role === "assistant" ? role : "user";

      if (m.image && chatRole === "user" && provider === "gemini") {
        const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }> = [];
        parts.push({ type: "image", image: m.image, mimeType: "image/png" });
        if (m.content) {
          parts.push({ type: "text", text: m.content });
        } else {
          parts.push({ type: "text", text: "Analiza esta imagen. Describe las dimensiones que ves y genera el codigo CAD build123d para fabricar esta pieza. Pide las medidas que no puedas determinar de la imagen." });
        }
        return { role: "user", content: parts } as unknown as CoreMessage;
      }

      if (m.image && chatRole === "user") {
        const text = m.content || "Analiza esta imagen y genera el codigo CAD build123d para esta pieza.";
        return { role: "user", content: `[Imagen adjunta - usa tu capacidad de vision para analizarla]\n\n${text}` } as CoreMessage;
      }

      return { role: chatRole, content: m.content } as CoreMessage;
    });

    const MANUFACTURING_CONTEXT = `Eres un ingeniero de manufactura e impresion 3D de Manfacter. Tu conocimiento incluye:

- **Materiales FDM**: PLA (facil, rigido, no calor), PETG (resistente, funcional), ABS (tenaz, alta temp), ASA (UV, exterior), TPU (flexible), Nylon (industrial).
- **Tolerancias impresion 3D**: press fit 0.1-0.15mm, ajuste deslizante 0.2-0.3mm, ajuste holgado 0.4-0.5mm. Agujeros salen subdimensionados: agrega 0.2-0.4mm.
- **Diseño**: pared minima 1.2mm, voladizos <45°, relleno 15-20% prototipos, 40-60% funcional, 2-3 perimetros.
- **Orientacion de impresion**: eje Z es el mas debil. Alinea la carga principal con el plano XY.
- **Radio de filete interno**: minimo 1mm, ideal 2-4mm. Reduce concentracion de tension.
- **Referencias**: https://manfacter.com/tecnologia-impresion-3d/ (materiales) y https://manfacter.com/errores-de-impresion-3d/

Cuando el usuario pregunte sobre materiales, tolerancias, orientacion o cualquier aspecto de fabricacion, responde como el ingeniero experto que eres. Cuando te pidan generar una pieza, genera el codigo build123d. Responde siempre en español.`;

    if (conversation.length > 0 && conversation[0].role === "user") {
      conversation.unshift({ role: "system", content: MANUFACTURING_CONTEXT } as CoreMessage);
    }

    if (currentCode && typeof currentCode === "string") {
      const lastIndex = conversation.length - 1;
      if (lastIndex >= 0 && conversation[lastIndex].role === "user") {
        conversation[lastIndex].content = `El codigo Python CAD actual de la pieza es:\n\`\`\`python\n${currentCode}\n\`\`\`\n\nModificalo segun esta peticion:\n\n${conversation[lastIndex].content}`;
      }
    }

    let text: string;
    try {
      text = await callLLM(conversation, provider);
    } catch (llmError) {
      return Response.json({
        text: llmErrorMessage(llmError),
        hasCode: false,
        code: null,
        error: "llm_connection_error",
      }, { status: 200 });
    }

    let code = extractCode(text);

    if (!code) {
      conversation.push({ role: "assistant", content: text });
      conversation.push({ role: "user", content: "No veo codigo Python. Incluye el codigo entre triple backtick python." });
      try {
        text = await callLLM(conversation, provider);
      } catch {
        return Response.json({ text, hasCode: false, code: null });
      }
      code = extractCode(text);
    }

    if (!code) {
      return Response.json({ text, hasCode: false, code: null });
    }

    let result = await runCadGeneration(code);
    let attempts = 1;

    while (!result.ok && attempts < 8) {
      const hint = classifyError(result.error || "");
      const errorMsg = `El codigo anterior fallo:\n\n${result.error}\n\n${hint}\n\nCorrige el codigo y entregalo entre triple backtick python.`;

      conversation.push({ role: "assistant", content: `\`\`\`python\n${code}\n\`\`\`` });
      conversation.push({ role: "user", content: errorMsg });

      try {
        text = await callLLM(conversation, provider);
      } catch {
        break;
      }
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
    return Response.json({
      text: `Error interno del servidor. ${error instanceof Error ? error.message : ""}`,
      hasCode: false,
      code: null,
      error: "internal_error",
    }, { status: 200 });
  }
}
