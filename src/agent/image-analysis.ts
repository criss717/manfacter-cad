/**
 * Dual image analysis pipeline.
 *
 * Sends uploaded images to two vision models in parallel:
 * - Kimi GO (chat/completions format)
 * - MiniMax M3 GO (Anthropic /messages format)
 *
 * Results are merged with headers so the CAD agent can use consensus.
 * Ported from openai_server.py _analyze_image / _analyze_image_anthropic.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primary image analyzer — Kimi GO via chat/completions. */
const IMAGE_ANALYZER = 'kimi-go';

/** Secondary image analyzer — MiniMax M3 GO via Anthropic /messages. */
const IMAGE_ANALYZER_B = 'minimax-m3-go';

/** Models that natively accept images — skip the analysis pipeline. */
export const MODELS_WITH_VISION: ReadonlySet<string> = new Set([
  'gemini-pro',
  'minimax-m3-go',
]);

const ZEN_BASE = 'https://opencode.ai/zen/v1';
const ZEN_GO_BASE = 'https://opencode.ai/zen/go/v1';

const IMAGE_ANALYSIS_PROMPT = `Eres un ingeniero mecánico experto analizando una fotografía de una pieza fabricada.

Describe la pieza con MÁXIMO DETALLE siguiendo esta estructura EXACTA:

## MATERIAL
- Material aparente (latón, acero, aluminio, plástico, etc.)
- Acabado superficial (mecanizado, fundido, pulido, anodizado)
- Color y textura

## FORMA GENERAL
- Forma de la pieza (cilíndrica, rectangular, en L, irregular, etc.)
- ¿Es una sola pieza o varias?

## DIMENSIONES (en MILÍMETROS)
- Ancho, alto, profundidad totales ESTIMADOS
- Espesor de paredes, placas, bases
- Diámetro de elementos circulares
- Menciona cómo estimas (relativo a objetos en la foto o proporciones)

## CARACTERÍSTICAS (enumera CADA una)
Para cada característica visible describe:
- Tipo: agujero, ranura, saliente, refuerzo, filete, chaflán, rosca, canal, chavetero
- Posición relativa (centro, borde, a X mm del borde)
- Dimensiones: diámetro, profundidad, largo, ancho
- Patrón: ¿hay varios? ¿en círculo, línea, a qué ángulos?
- Avellanado: ¿el agujero es plano o cónico en la entrada?

## ROSCAS
- ¿Hay agujeros o ejes roscados?
- Tipo de rosca si es visible (fina/gruesa, métrica)
- Diámetro aproximado

## BORDES Y ESQUINAS
- ¿Hay filetes (redondeos) o chaflanes (biselados)?
- Tamaño aproximado

## MÉTODO DE FABRICACIÓN
- ¿Cómo se fabricó? (CNC, torno, fundición, impresión 3D, estampado)
- ¿Marcas de herramienta visibles?

## DIMENSIONES CRÍTICAS A PREGUNTAR
Si NO puedes determinar una dimensión crítica de la foto, indícalo brevemente.

REGLAS IMPORTANTES:
1. Usa MILÍMETROS para TODAS las medidas
2. Sé preciso pero indica cuando estás estimando
3. Describe lo que VES, no inventes características
4. Si algo no está claro, dilo explícitamente
5. Céntrate en la GEOMETRÍA — esta descripción se usará para generar CAD
6. Si el usuario ya dio medidas en su mensaje, ÚSALAS como referencia
7. NO generes código — SOLO describe la pieza`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a data URL like `data:image/png;base64,...` into (mediaType, base64).
 */
function parseImageDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  if (dataUrl.includes(',')) {
    const [header, b64] = dataUrl.split(',', 1);
    const mediaType = header.includes(':')
      ? header.split(';')[0].split(':').pop() ?? 'image/png'
      : 'image/png';
    return { mediaType, base64: b64 };
  }
  return { mediaType: 'image/png', base64: dataUrl };
}

/**
 * Get the OpenCode API key from environment.
 */
function getApiKey(): string {
  return process.env.OPENCODE_API_KEY ?? '';
}

// ---------------------------------------------------------------------------
// Kimi GO analyzer (chat/completions)
// ---------------------------------------------------------------------------

/**
 * Send an image to Kimi GO for engineering analysis.
 * Uses OpenAI-compatible chat/completions format via Zen.
 */
export async function analyzeImageKimi(
  imageData: string,
  userText: string
): Promise<string | null> {
  const { mediaType, base64 } = parseImageDataUrl(imageData);
  const apiKey = getApiKey();
  const endpoint = `${ZEN_GO_BASE}/chat/completions`;

  const body = {
    model: 'kimi-k2.6',
    messages: [
      { role: 'system' as const, content: IMAGE_ANALYSIS_PROMPT },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: ${userText}`,
          },
          {
            type: 'image_url' as const,
            image_url: { url: `data:${mediaType};base64,${base64}` },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`[IMAGE-A] Kimi FAILED: HTTP ${resp.status} — ${text.slice(0, 300)}`);
      return null;
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const description = data.choices?.[0]?.message?.content ?? '';
    console.log(`[IMAGE-A] Kimi: ${description.slice(0, 120)}...`);
    return description || null;
  } catch (err) {
    console.error(`[IMAGE-A] Kimi FAILED:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// MiniMax M3 GO analyzer (Anthropic /messages)
// ---------------------------------------------------------------------------

/**
 * Send an image to MiniMax M3 GO for engineering analysis.
 * Uses Anthropic /messages format via Zen Go.
 */
export async function analyzeImageMiniMax(
  imageData: string,
  userText: string
): Promise<string | null> {
  const { mediaType, base64 } = parseImageDataUrl(imageData);
  const apiKey = getApiKey();
  const endpoint = `${ZEN_GO_BASE}/messages`;

  const body = {
    model: 'minimax-m3',
    system: IMAGE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: ${userText}`,
          },
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType, data: base64 },
          },
        ],
      },
    ],
    max_tokens: 2048,
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`[IMAGE-B] MiniMax FAILED: HTTP ${resp.status} — ${text.slice(0, 300)}`);
      return null;
    }

    const data = (await resp.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textBlocks = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '');
    const description = textBlocks.join(' ');
    console.log(`[IMAGE-B] MiniMax: ${description.slice(0, 120)}...`);
    return description || null;
  } catch (err) {
    console.error(`[IMAGE-B] MiniMax FAILED:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pipeline decision
// ---------------------------------------------------------------------------

/**
 * Determine whether the image analysis pipeline should run.
 * Returns true when the provider can't handle images natively AND an image is present.
 */
export function needsImagePipeline(provider: string, hasImage: boolean): boolean {
  if (!hasImage) return false;
  if (MODELS_WITH_VISION.has(provider)) return false;
  // Skip if the provider IS one of the analyzers (would be redundant)
  if (provider === IMAGE_ANALYZER || provider === IMAGE_ANALYZER_B) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Dual analysis orchestrator
// ---------------------------------------------------------------------------

/**
 * Run both image analyzers in parallel and merge results.
 * Returns the merged description augmented text, or null if both fail.
 */
export async function analyzeImageDual(
  imageData: string,
  userText: string
): Promise<{ merged: string; augmentedText: string } | null> {
  console.log(`[IMAGE] Dual analysis with ${IMAGE_ANALYZER} + ${IMAGE_ANALYZER_B}...`);

  const [descA, descB] = await Promise.all([
    analyzeImageKimi(imageData, userText),
    analyzeImageMiniMax(imageData, userText),
  ]);

  const mergedParts: string[] = [];
  if (descA) mergedParts.push(`## Ingeniero A (Kimi):\n${descA}`);
  if (descB) mergedParts.push(`## Ingeniero B (MiniMax):\n${descB}`);

  if (mergedParts.length === 0) {
    console.error('[IMAGE] Both analyzers failed');
    return null;
  }

  const merged =
    '[ANÁLISIS COMBINADO — DOS INGENIEROS]\n' +
    mergedParts.join('\n\n') +
    '\n\n[CONSENSO — Usa AMBOS análisis para generar el CAD más preciso]';

  const augmentedText =
    `${merged}\n\n` +
    `Petición del usuario: ${userText}\n\n` +
    'IMPORTANTE: genera el CAD DIRECTAMENTE basado en el consenso. ' +
    'No repitas las descripciones — el usuario ya las conoce. Sé conciso.';

  return { merged, augmentedText };
}
