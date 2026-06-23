"""
ManfacterCAD OpenAI Agent Server — WebSocket server supporting multiple providers
via OpenCode Zen:
  - chat/completions      (minimax, glm, kimi, deepseek)
  - Anthropic messages    (claude-sonnet, claude-opus, qwen)
  - Google AI SDK         (gemini-3.1-pro via Zen :generateContent endpoint)

Follows the same session / tier / expected-dims pattern as server.py (ADK).
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
import signal

sys.path.insert(0, str(Path(__file__).parent.parent))


def handle_exit(*args):
    print(f"[OPENAI] Received exit signal ({args}), shutting down...")
    sys.exit(0)


signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

# Load .env from project root
_env_file = Path(__file__).parent.parent.parent / ".env"
if _env_file.exists():
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key not in os.environ:
                    os.environ[key] = value

# Google API key (supports both env var names)
if not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")

# NVIDIA API key
_NVIDIA_KEY = os.environ.get("NVIDIA_API_KEY", "")

import websockets
from websockets.asyncio.server import serve
from openai import AsyncOpenAI

from agent.tools import (
    run_cad_code,
    inspect_geometry,
    read_reference,
    list_outputs,
    make_snapshot,
    make_snapshots,
    pick_face_on_model,
    _attempt_counts,
    _current_session_id,
    _current_tier,
    release_session_resources,
    set_expected_dims,
)
from agent.prompt import CAD_AGENT_PROMPT, SIMPLE_CAD_PROMPT, assemble_prompt

# ── Zen base URLs ──────────────────────────────────────────────────────────────
ZEN_BASE    = "https://opencode.ai/zen/v1"
ZEN_GO_BASE = "https://opencode.ai/zen/go/v1"

# ── Model registry ─────────────────────────────────────────────────────────────
# api: "chat"     → OpenAI-compatible /chat/completions
#      "messages" → Anthropic /messages  (Claude, Qwen)
#      "gemini"   → Google AI SDK :generateContent via Zen (gemini-pro)
MODEL_CONFIGS: dict[str, dict] = {
    # ── Chat / completions ──────────────────────────────────────────────
    "minimax":               {"model": "minimax-m2.7",             "api": "chat"},
    "glm":                   {"model": "glm-5.1",                  "api": "chat"},
    "kimi":                  {"model": "kimi-k2.6",                "api": "chat"},
    "deepseek":              {"model": "deepseek-v4-flash",        "api": "chat"},
    # ── Free Zen models (OpenAI-compatible) ───────────────────────────
    "mimo-v2.5-free":        {"model": "mimo-v2.5-free",           "api": "chat"},
    "deepseek-v4-flash-free":{"model": "deepseek-v4-flash-free",   "api": "chat"},
    "nemotron-3-ultra-free": {"model": "nemotron-3-ultra-free",    "api": "chat"},
    # ── Anthropic Messages API ───────────────────────────────────────────
    "sonnet":   {"model": "claude-sonnet-4-6",  "api": "messages"},
    "opus":     {"model": "claude-opus-4-8",    "api": "messages"},
    "qwen":     {"model": "qwen3.7-max",         "api": "messages"},
    # ── Gemini via OpenCode Zen (Google AI SDK protocol) ─────────────────
    "gemini-pro": {"model": "gemini-3.1-pro",   "api": "gemini"},
    # ── OpenCode Go (subscription, $10/mo) ──────────────────────────────
    #    All use OpenAI-compatible /chat/completions or Anthropic /messages
    "deepseek-v4-pro-go": {"model": "deepseek-v4-pro", "api": "chat",     "base_url": ZEN_GO_BASE},
    "mimo-v2.5-pro-go":   {"model": "mimo-v2.5-pro",   "api": "chat",     "base_url": ZEN_GO_BASE},
    "kimi-go":            {"model": "kimi-k2.6",         "api": "chat",     "base_url": ZEN_GO_BASE},
    "kimi-go-2.7":        {"model": "kimi-k2.7-code",          "api": "chat",     "base_url": ZEN_GO_BASE, "temperature": 1.0},
    "glm-go":             {"model": "glm-5.1",           "api": "chat",     "base_url": ZEN_GO_BASE},
    "glm5.2-go":          {"model": "glm-5.2",           "api": "chat",     "base_url": ZEN_GO_BASE},
    "qwen3.7-max-go":     {"model": "qwen3.7-max",       "api": "messages", "base_url": ZEN_GO_BASE},
    "minimax-m3-go":      {"model": "minimax-m3",        "api": "messages", "base_url": ZEN_GO_BASE},
    # ── NVIDIA (free tier, OpenAI-compatible, physics/geometry expert) ─────
    "nvidia-cosmos":      {"model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "api": "chat", "base_url": "https://integrate.api.nvidia.com/v1", "api_key_env": "NVIDIA_API_KEY", "auth_header": "Bearer"},
}

DEFAULT_PROVIDER = "glm"

# ── Image analysis pipeline ─────────────────────────────────────────────────────
# Models that natively process images for CAD generation
MODELS_WITH_VISION: set[str] = {
    "gemini-pro", "minimax-m3-go", "kimi-go-2.7", "kimi-go",
    "nvidia-cosmos",  # multimodal, physics/geometry expert
}

# ── Google Gemini direct (REST API, no Zen) ────────────────────────────────────
GEMINI_VISION_MODEL = "gemini-3.1-pro-preview"  # best balance: fast, good vision, cheap
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# ── Image analysis fallback (tried in order in _analyze_image_with_fallback) ──

# Legacy: primary analyzer kept for the chat fallback
IMAGE_ANALYZER = "kimi-go-2.7"  # best CAD reasoning, but slower than Gemini

# Second analyzer for dual-analysis consensus (Anthropic /messages format) — DEPRECATED, kept for fallback
IMAGE_ANALYZER_B = "minimax-m3-go"

IMAGE_ANALYSIS_PROMPT = """Eres un ingeniero mecánico analizando una imagen para generación CAD con build123d.

Describe SOLO la geometría — esto se usará para generar código CAD 3D.

## FORMA GENERAL
- Tipo de pieza (eje, brida, soporte, carcasa, etc.)
- ¿Es una pieza de revolución, prismática, o combinación?
- ¿Es una sola pieza o ensamblaje?

## DIMENSIONES (en MILÍMETROS)
- Dimensiones totales: ancho × alto × profundidad
- Diámetros de elementos cilíndricos
- Espesores de pared, placa, base
- Si estimás, indica "estimado ~X mm"

## CARACTERÍSTICAS GEOMÉTRICAS (enumera CADA una)
Para cada feature visible:
- Tipo: agujero (pasante/ciego), ranura, saliente/boss, nervio, cavidad, chavetero
- Forma: circular, rectangular, irregular
- Posición relativa: centrado, a X mm del borde, sobre cara superior/inferior/lateral
- Dimensiones exactas en mm: diámetro × profundidad, largo × ancho × profundidad
- Cantidad y patrón: ¿cuántos? ¿en línea, círculo, matriz? ¿a qué separación?

## PERFIL DE REVOLUCIÓN (si aplica)
- Si es una pieza torneada: describí los tramos en orden (de izquierda a derecha)
- Diámetro y longitud de cada tramo
- Transiciones entre tramos: ¿escalón recto, chaflán, filete/radio?

## AGUJEROS Y ROSCAS
- ¿Pasantes o ciegos? ¿Profundidad?
- ¿Avellanado o avellanado plano? ¿Ángulo del avellanado (90°)?
- ¿Roscados? ¿Métrica (M8, M10)? ¿Paso fino o grueso?

## BORDES Y ESQUINAS
- Filetes (redondeos): ¿en qué aristas? ¿radio en mm?
- Chaflanes (biseles): ¿en qué aristas? ¿distancia × ángulo? (ej: 2×45°)

## REGLAS
1. SOLO geometría — no describas material, color, acabado, ni método de fabricación
2. MILÍMETROS para todas las medidas
3. Sé preciso pero marcá estimaciones con "~"
4. NO inventes features que no ves
5. Si el usuario dio medidas, USALAS
6. NO generes código — solo describí geometría
"""
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_reference",
            "description": "Read a build123d reference document. ONLY use for unfamiliar errors or complex assemblies needing positioning.md.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Filename (e.g. 'build123d-modeling.md', 'repair-loop.md')"}
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_cad_code",
            "description": "Execute build123d Python code. Returns STEP/STL/GLB URLs + facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code with gen_step()"}
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_geometry",
            "description": "Inspect a generated STEP file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "step_path": {"type": "string", "description": "Path to .step relative to output dir"}
                },
                "required": ["step_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_outputs",
            "description": "List all generated output files.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_snapshot",
            "description": "Render a PNG screenshot of a generated model for visual inspection.",
            "parameters": {
                "type": "object",
                "properties": {
                    "step_path": {"type": "string", "description": "Path to .step file (e.g. 'abc123/abc123.step')"}
                },
                "required": ["step_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_snapshots",
            "description": "Render 5 canonical-view PNGs (front, back, left, right, bottom) of a generated model for detailed visual inspection. Use when you need to verify geometry from multiple angles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "step_path": {"type": "string", "description": "Path to .step file (e.g. 'abc123/abc123.step')"}
                },
                "required": ["step_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pick_face_on_model",
            "description": "Match a 3D click position + normal against OCP model faces. Returns face identity (index, selector, confidence). Use when the user clicks a face in the 3D viewer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "position_x": {"type": "number", "description": "X hit position in CAD mm"},
                    "position_y": {"type": "number", "description": "Y hit position in CAD mm"},
                    "position_z": {"type": "number", "description": "Z hit position in CAD mm"},
                    "normal_x": {"type": "number", "description": "X surface normal"},
                    "normal_y": {"type": "number", "description": "Y surface normal"},
                    "normal_z": {"type": "number", "description": "Z surface normal"},
                    "scale": {"type": "number", "description": "GLB-to-CAD scale (default 1000)"},
                },
                "required": ["position_x", "position_y", "position_z", "normal_x", "normal_y", "normal_z"],
            },
        },
    },
]

TOOL_MAP = {
    "run_cad_code":     lambda args: run_cad_code(args["code"]),
    "inspect_geometry": lambda args: json.dumps(inspect_geometry(args["step_path"]), default=str),
    "read_reference":   lambda args: read_reference(args["name"]),
    "list_outputs":     lambda args: json.dumps(list_outputs(), default=str),
    "make_snapshot":    lambda args: json.dumps(make_snapshot(args["step_path"]), default=str),
    "make_snapshots":   lambda args: json.dumps(make_snapshots(args["step_path"]), default=str),
    "pick_face_on_model": lambda args: pick_face_on_model(
        args["position_x"], args["position_y"], args["position_z"],
        args["normal_x"], args["normal_y"], args["normal_z"],
        args.get("scale", 1000.0),
    ),
}

# Anthropic format: {name, description, input_schema}
ANTHROPIC_TOOLS = [
    {
        "name": t["function"]["name"],
        "description": t["function"].get("description", ""),
        "input_schema": t["function"].get("parameters", {"type": "object", "properties": {}}),
    }
    for t in TOOLS
]

# ── Session store ──────────────────────────────────────────────────────────────
SESSIONS: dict[str, list] = {}
SESSION_LAST_ACCESS: dict[str, float] = {}
SESSION_TTL = 3600


async def _cleanup_sessions_loop() -> None:
    while True:
        await asyncio.sleep(600)
        now = time.time()
        expired = [sid for sid, ts in SESSION_LAST_ACCESS.items() if now - ts > SESSION_TTL]
        for sid in expired:
            SESSIONS.pop(sid, None)
            SESSION_LAST_ACCESS.pop(sid, None)
        if expired:
            print(f"[OPENAI] Cleaned {len(expired)} expired sessions, {len(SESSIONS)} remaining")


# ── Image helpers ──────────────────────────────────────────────────────────────

def _parse_image_data_url(data_url: str) -> tuple[str, str]:
    """Parse 'data:image/png;base64,...' → (media_type, base64_data)."""
    if "," in data_url:
        header, b64 = data_url.split(",", 1)
        media_type = header.split(";")[0].split(":")[-1] if ":" in header else "image/png"
        return media_type, b64
    return "image/png", data_url


def _build_user_content(text: str, image_data: str | None) -> str | list:
    """Return plain string, or list-of-parts when image is present (OpenAI format)."""
    if not image_data:
        return text
    media_type, b64 = _parse_image_data_url(image_data)
    return [
        {"type": "text", "text": text},
        {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
    ]


# ── Format converter ───────────────────────────────────────────────────────────

def _to_anthropic(messages: list) -> tuple[str, list]:
    """Convert OpenAI-format session to (system_prompt, anthropic_messages).

    Session history stays in OpenAI format; this converts just before the API
    call so model switching mid-session works without re-formatting state.
    Handles image_url parts → Anthropic image format automatically.
    """
    system = ""
    result: list = []

    for msg in messages:
        role = msg["role"]

        if role == "system":
            system = msg.get("content") or ""

        elif role == "user":
            content = msg["content"]
            if isinstance(content, str):
                result.append({"role": "user", "content": content})
            else:
                # List of parts: text + image_url → convert image_url to Anthropic image
                a_parts: list = []
                for part in (content or []):
                    ptype = part.get("type", "")
                    if ptype == "text":
                        a_parts.append({"type": "text", "text": part["text"]})
                    elif ptype == "image_url":
                        mt, b64 = _parse_image_data_url(part["image_url"]["url"])
                        a_parts.append({
                            "type": "image",
                            "source": {"type": "base64", "media_type": mt, "data": b64},
                        })
                result.append({"role": "user", "content": a_parts})

        elif role == "assistant":
            a_content: list = []
            if msg.get("content"):
                a_content.append({"type": "text", "text": msg["content"]})
            for tc in msg.get("tool_calls") or []:
                fn = tc["function"]
                try:
                    input_data = json.loads(fn["arguments"])
                except Exception:
                    input_data = {}
                a_content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": fn["name"],
                    "input": input_data,
                })
            if a_content:
                result.append({"role": "assistant", "content": a_content})

        elif role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": msg.get("tool_call_id", ""),
                "content": msg.get("content", ""),
            }
            # Group consecutive tool results in one user message
            if result and result[-1]["role"] == "user" and isinstance(result[-1]["content"], list):
                result[-1]["content"].append(block)
            else:
                result.append({"role": "user", "content": [block]})

    return system, result


# ── Gemini converter ───────────────────────────────────────────────────────────

def _to_gemini_tools() -> list[dict]:
    """Convert OpenAI-format tools → Google AI SDK function_declarations."""
    declarations = []
    for t in TOOLS:
        fn = t["function"]
        params = fn.get("parameters", {"type": "object", "properties": {}})
        # Google SDK expects uppercase type
        gparams = dict(params)
        if isinstance(gparams.get("type"), str):
            gparams["type"] = gparams["type"].upper()
        declarations.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "parameters": gparams,
        })
    return [{"function_declarations": declarations}]


def _to_gemini_contents(messages: list) -> tuple[str | None, list[dict]]:
    """Convert OpenAI-format messages → (system_instruction, contents).

    Google AI SDK content roles: user / model / function.
    Function responses come with role 'function' (NOT 'tool').
    """
    system: str | None = None
    contents: list[dict] = []

    for msg in messages:
        role = msg["role"]

        if role == "system":
            system = msg.get("content", "")
            continue

        if role == "user":
            content = msg["content"]
            if isinstance(content, str):
                parts = [{"text": content}]
            else:
                parts = []
                for part in (content or []):
                    ptype = part.get("type", "")
                    if ptype == "text":
                        parts.append({"text": part["text"]})
                    elif ptype == "image_url":
                        mt, b64 = _parse_image_data_url(part["image_url"]["url"])
                        parts.append({
                            "inline_data": {"mime_type": mt, "data": b64},
                        })
            contents.append({"role": "user", "parts": parts})

        elif role == "assistant":
            parts: list[dict] = []
            if msg.get("content"):
                parts.append({"text": msg["content"]})
            for tc in msg.get("tool_calls") or []:
                fn = tc["function"]
                try:
                    args = json.loads(fn["arguments"])
                except Exception:
                    args = {}
                parts.append({
                    "functionCall": {"name": fn["name"], "args": args},
                })
            contents.append({"role": "model", "parts": parts})

        elif role == "tool":
            # Google SDK: function responses use role "function" with
            # functionResponse.name matching the original functionCall.name.
            # OpenAI only stores tool_call_id, so we search backwards
            # through messages for the matching assistant tool call.
            tc_id = msg.get("tool_call_id", "")
            fn_name = tc_id  # fallback
            seen = []
            for prev in reversed(messages):
                seen.append(prev.get("role"))
                if prev.get("role") == "assistant" and prev.get("tool_calls"):
                    for tc in prev["tool_calls"]:
                        if tc.get("id") == tc_id:
                            fn_name = tc["function"]["name"]
                            break
                    if fn_name != tc_id:
                        break
            if fn_name == tc_id:
                print(f"[OPENAI] WARN: could not resolve tool_call_id '{tc_id}' "
                      f"to function name (seen roles: {seen})")

            raw = msg.get("content", "")
            try:
                parsed = json.loads(raw)
                resp_data = parsed if isinstance(parsed, dict) else {"output": raw}
            except (json.JSONDecodeError, TypeError):
                resp_data = {"output": raw}
            contents.append({
                "role": "function",
                "parts": [{
                    "functionResponse": {
                        "name": fn_name,
                        "response": resp_data,
                    }
                }],
            })

    return system, contents


# ── Gemini Zen handler ─────────────────────────────────────────────────────────

async def _run_gemini_zen(
    websocket, messages: list, model: str, api_key: str
) -> None:
    """Google AI SDK :generateContent via Zen (gemini-pro).

    Zen's Gemini endpoint uses Google AI SDK protocol, NOT OpenAI
    /chat/completions. We call it via httpx with the correct format.
    """
    import httpx

    endpoint = f"{ZEN_BASE}/models/{model}:generateContent"
    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    system, contents = _to_gemini_contents(messages)

    for _step in range(20):
        payload: dict = {"contents": contents}
        if system:
            payload["system_instruction"] = {"parts": [{"text": system}]}
        payload["tools"] = _to_gemini_tools()

        response_data: dict | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(endpoint, headers=req_headers, json=payload)
                    resp.raise_for_status()
                    response_data = resp.json()
                break
            except Exception as e:
                err = str(e)
                print(f"[OPENAI] Gemini Zen error (attempt {attempt + 1}/3): {err[:120]}")
                if attempt < 2 and any(k in err.lower() for k in ("connection", "timeout")):
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                await websocket.send(json.dumps({"type": "error", "error": err[:300]}))
                return

        if response_data is None:
            return

        candidates = response_data.get("candidates", [])
        if not candidates:
            await websocket.send(json.dumps({"type": "error", "error": "No candidates in Gemini response"}))
            return

        candidate = candidates[0]
        finish = candidate.get("finishReason", "STOP")
        content = candidate.get("content", {})
        parts: list[dict] = content.get("parts", [])

        text_parts = [p for p in parts if "text" in p]
        fn_call_parts = [p for p in parts if "functionCall" in p]

        print(f"[OPENAI] Gemini finish={finish} parts={len(parts)} "
              f"text={len(text_parts)} fn_calls={len(fn_call_parts)}")

        # Store in OpenAI format for session consistency
        assistant_msg: dict = {"role": "assistant", "content": None}

        if text_parts:
            text = " ".join(p["text"] for p in text_parts)
            assistant_msg["content"] = text
            if finish != "TOOL_CALL":
                await websocket.send(json.dumps({"type": "agent_event", "text": text}))
            print(f"[OPENAI] TEXT: {text[:100]}...")

        if fn_call_parts:
            tool_calls = []
            for i, p in enumerate(fn_call_parts):
                fc = p["functionCall"]
                tc_id = f"call_{_step}_{i}"
                tool_calls.append({
                    "id": tc_id,
                    "type": "function",
                    "function": {
                        "name": fc["name"],
                        "arguments": json.dumps(fc.get("args", {})),
                    },
                })
            assistant_msg["tool_calls"] = tool_calls

        messages.append(assistant_msg)

        if finish != "TOOL_CALL" or not fn_call_parts:
            break

        # Execute tool calls (same pattern as _run_chat / _run_messages)
        for p in fn_call_parts:
            fc = p["functionCall"]
            name = fc["name"]
            args = fc.get("args", {})

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_call": {"name": name, "args": args},
            }))
            print(f"[OPENAI] TOOL: {name}")

            try:
                if name == "run_cad_code":
                    result = await asyncio.to_thread(run_cad_code, args.get("code", ""))
                    result = _restore_code_in_result(result)
                else:
                    fn = TOOL_MAP.get(name)
                    result = str(fn(args)) if fn else json.dumps({"error": f"Unknown tool: {name}"})
                print(f"[OPENAI] RESULT: {name} ok ({len(result)} chars)")
            except Exception as e:
                result = json.dumps({"error": str(e)})
                print(f"[OPENAI] RESULT: {name} FAIL: {e}")

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_result": {
                    "name": name,
                    "response": result if name == "run_cad_code" else result[:1000],
                },
            }))

            # Google SDK format: function responses use role "function"
            try:
                parsed = json.loads(result)
                resp_data = parsed if isinstance(parsed, dict) else {"output": result}
            except (json.JSONDecodeError, TypeError):
                resp_data = {"output": result}

            # Map tool_call_id by constructing a unique ID
            fn_tc_id = f"call_{_step}_{fn_call_parts.index(p)}"
            messages.append({
                "role": "tool",
                "tool_call_id": fn_tc_id,
                "content": result,
            })

            # ── Auto-inspect after successful CAD generation ──────────
            if name == "run_cad_code":
                session_id = _current_session_id.get()
                user_req = _last_user_request.get(session_id, "")
                if user_req:
                    inspection = await _auto_inspect_cad(websocket, result, user_req, api_key)
                    if inspection:
                        messages.append({
                            "role": "user",
                            "content": inspection,
                        })


async def _run_gemini_direct(
    websocket, messages: list, model: str, api_key: str
) -> None:
    """Google AI SDK :generateContent via direct REST API (Google API key)."""
    import httpx

    endpoint = f"{GEMINI_BASE_URL}/models/{model}:generateContent?key={api_key}"

    # Convert tools to Google format (uppercase TYPE)
    google_tools: list[dict] = []
    if TOOLS:
        declarations = []
        for t in TOOLS:
            fn = t["function"]
            params = dict(fn.get("parameters", {"type": "object", "properties": {}}))
            if isinstance(params.get("type"), str):
                params["type"] = params["type"].upper()
            declarations.append({
                "name": fn["name"],
                "description": fn.get("description", ""),
                "parameters": params,
            })
        google_tools = [{"functionDeclarations": declarations}]

    for _step in range(20):
        system, contents = _to_gemini_contents(messages)

        payload: dict = {"contents": contents}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        if google_tools:
            payload["tools"] = google_tools

        response_data: dict | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(
                        endpoint,
                        headers={"Content-Type": "application/json"},
                        json=payload,
                    )
                    resp.raise_for_status()
                    response_data = resp.json()
                break
            except Exception as e:
                err = str(e)
                print(f"[OPENAI] Gemini Direct error (attempt {attempt + 1}/3): {err[:120]}")
                if attempt < 2 and any(k in err.lower() for k in ("connection", "timeout")):
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                await websocket.send(json.dumps({"type": "error", "error": err[:300]}))
                return

        if response_data is None:
            return

        candidates = response_data.get("candidates", [])
        if not candidates:
            await websocket.send(json.dumps({"type": "error", "error": "No candidates in Gemini response"}))
            return

        candidate = candidates[0]
        finish = candidate.get("finishReason", "STOP")
        content = candidate.get("content", {})
        parts: list[dict] = content.get("parts", [])

        text_parts = [p for p in parts if "text" in p]
        fn_call_parts = [p for p in parts if "functionCall" in p]

        print(f"[OPENAI] Gemini Direct finish={finish} text={len(text_parts)} fn_calls={len(fn_call_parts)}")

        assistant_msg: dict = {"role": "assistant", "content": None}

        if text_parts:
            text = " ".join(p["text"] for p in text_parts)
            assistant_msg["content"] = text
            if finish != "TOOL_CALL":
                await websocket.send(json.dumps({"type": "agent_event", "text": text}))
            print(f"[OPENAI] TEXT: {text[:100]}...")

        if fn_call_parts:
            tool_calls = []
            for i, p in enumerate(fn_call_parts):
                fc = p["functionCall"]
                tc_id = f"call_{_step}_{i}"
                tool_calls.append({
                    "id": tc_id,
                    "type": "function",
                    "function": {
                        "name": fc["name"],
                        "arguments": json.dumps(fc.get("args", {})),
                    },
                })
            assistant_msg["tool_calls"] = tool_calls

        messages.append(assistant_msg)

        if finish != "TOOL_CALL" or not fn_call_parts:
            break

        for p in fn_call_parts:
            fc = p["functionCall"]
            name = fc["name"]
            args = fc.get("args", {})

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_call": {"name": name, "args": args},
            }))
            print(f"[OPENAI] TOOL: {name}")

            try:
                if name == "run_cad_code":
                    result = await asyncio.to_thread(run_cad_code, args.get("code", ""))
                    result = _restore_code_in_result(result)
                else:
                    fn = TOOL_MAP.get(name)
                    result = str(fn(args)) if fn else json.dumps({"error": f"Unknown tool: {name}"})
                print(f"[OPENAI] RESULT: {name} ok ({len(result)} chars)")
            except Exception as e:
                result = json.dumps({"error": str(e)})
                print(f"[OPENAI] RESULT: {name} FAIL: {e}")

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_result": {
                    "name": name,
                    "response": result if name == "run_cad_code" else result[:1000],
                },
            }))

            fn_tc_id = f"call_{_step}_{fn_call_parts.index(p)}"
            messages.append({
                "role": "tool",
                "tool_call_id": fn_tc_id,
                "content": result,
            })

            # ── Auto-inspect after successful CAD generation ──────────
            if name == "run_cad_code":
                session_id = _current_session_id.get()
                user_req = _last_user_request.get(session_id, "")
                if user_req:
                    inspection = await _auto_inspect_cad(websocket, result, user_req, api_key)
                    if inspection:
                        messages.append({
                            "role": "user",
                            "content": inspection,
                        })


# ── API handlers ───────────────────────────────────────────────────────────────

def _restore_code_in_result(result: str) -> str:
    """If Epic C stripped the code field, restore it from the saved _script.py."""
    try:
        data = json.loads(result)
        if "code" not in data and "model_id" in data:
            script_path = Path(__file__).parent.parent / "output" / data["model_id"] / "_script.py"
            if script_path.exists():
                data["code"] = script_path.read_text()
                return json.dumps(data)
    except Exception:
        pass
    return result


async def _run_chat(
    websocket, messages: list, model: str, api_key: str, base_url: str, temperature: float = 0.2
) -> None:
    """OpenAI-compatible chat/completions WITH streaming (minimax, glm, kimi, deepseek, GO)."""
    client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=300.0, max_retries=2)

    _max_tokens = 16384
    _length_retried = False
    _chamfer_fails = 0

    for _step in range(20):
        stream = None
        for attempt in range(3):
            try:
                stream = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    temperature=temperature,
                    max_tokens=_max_tokens,
                    stream=True,
                )
                break
            except Exception as e:
                err = str(e)
                print(f"[OPENAI] API error (attempt {attempt + 1}/3): {err[:120]}")
                if attempt < 2 and any(k in err.lower() for k in ("connection", "disconnect", "timeout")):
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                await websocket.send(json.dumps({"type": "error", "error": err[:300]}))
                return

        if stream is None:
            return

        # Accumulate text and tool calls from stream chunks
        current_tool_calls: dict[int, dict] = {}
        assistant_text = ""
        finish_reason = None

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if chunk.choices[0].finish_reason is not None:
                finish_reason = chunk.choices[0].finish_reason

            if delta.content:
                assistant_text += delta.content

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    index = tc.index
                    if index not in current_tool_calls:
                        current_tool_calls[index] = {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": "", "arguments": ""}
                        }
                    if tc.function:
                        if tc.function.name:
                            current_tool_calls[index]["function"]["name"] = tc.function.name
                        if tc.function.arguments:
                            current_tool_calls[index]["function"]["arguments"] += tc.function.arguments

        print(f"[OPENAI] finish={finish_reason}, tool_calls={len(current_tool_calls)}")

        # Retry with higher max_tokens if response was truncated before forming a tool call
        if finish_reason == "length" and not current_tool_calls and not _length_retried:
            _length_retried = True
            _max_tokens = 24576
            print(f"[OPENAI] finish=length, retrying with max_tokens={_max_tokens}...")
            continue

        # Reset length retry flag for next turn (only keep if it succeeded)
        _length_retried = False

        if not current_tool_calls:
            if assistant_text:
                messages.append({"role": "assistant", "content": assistant_text})
                await websocket.send(json.dumps({
                    "type": "agent_event",
                    "text": assistant_text,
                }))
            break

        # Tool calls present — execute them and feed back
        tool_calls_list = list(current_tool_calls.values())
        messages.append({
            "role": "assistant",
            "content": assistant_text or None,
            "tool_calls": tool_calls_list,
        })

        for tc in tool_calls_list:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except Exception:
                args = {}

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_call": {"name": name, "args": args}
            }))
            print(f"[OPENAI] TOOL: {name}")

            try:
                fn = TOOL_MAP.get(name)
                result = str(fn(args)) if fn else json.dumps({"error": f"Unknown tool: {name}"})
                if name == "run_cad_code":
                    result = _restore_code_in_result(result)
                print(f"[OPENAI] RESULT: {name} ok ({len(result)} chars)")
            except Exception as e:
                result = json.dumps({"error": str(e)})
                print(f"[OPENAI] RESULT: {name} FAIL: {e}")

            # Circuit breaker: chamfer/fillet death loops
            if name == "run_cad_code":
                try:
                    rj = json.loads(result) if isinstance(result, str) else {}
                    err = (rj.get("error") or "").lower()
                    if not rj.get("ok") and ("chamfer" in err or "fillet" in err):
                        _chamfer_fails += 1
                        if _chamfer_fails >= 3:
                            messages.append({
                                "role": "user",
                                "content": (
                                    "SYSTEM NOTE: The chamfer/fillet operation has failed 3 times. "
                                    "The selected edges are not suitable for chamfer/fillet. "
                                    "STOP all chamfer/fillet attempts. Complete the part WITHOUT chamfers. "
                                    "A working part without chamfers is better than repeated failures."
                                ),
                            })
                            _chamfer_fails = 0
                            print(f"[OPENAI] CIRCUIT BREAKER: chamfer/fillet skipped after 3 failures")
                    else:
                        _chamfer_fails = 0
                except Exception:
                    pass

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_result": {
                    "name": name,
                    "response": result if name == "run_cad_code" else result[:1000],
                },
            }))
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

            # ── Auto-inspect after successful CAD generation ──────────
            if name == "run_cad_code":
                session_id = _current_session_id.get()
                user_req = _last_user_request.get(session_id, "")
                if user_req:
                    inspection = await _auto_inspect_cad(websocket, result, user_req, api_key)
                    if inspection:
                        messages.append({
                            "role": "user",
                            "content": inspection,
                        })


async def _run_messages(
    websocket, messages: list, model: str, api_key: str, base_url: str
) -> None:
    """Anthropic Messages API via direct httpx.

    The anthropic SDK resolves its internal path (/v1/messages) as an absolute
    URL component, which replaces the /zen/v1 sub-path and hits the wrong
    endpoint. We bypass the SDK and POST to the exact URL via httpx instead.
    """
    import httpx

    endpoint = f"{base_url}/messages"   # https://opencode.ai/zen/go/v1/messages
    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    _chamfer_fails = 0

    for _step in range(20):
        system, anthropic_msgs = _to_anthropic(messages)

        payload: dict = {
            "model": model,
            "messages": anthropic_msgs,
            "tools": ANTHROPIC_TOOLS,
            "max_tokens": 8192,
        }
        if system:
            payload["system"] = system

        response_data: dict | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(endpoint, headers=req_headers, json=payload)
                    resp.raise_for_status()
                    response_data = resp.json()
                break
            except Exception as e:
                err = str(e)
                print(f"[OPENAI] Anthropic error (attempt {attempt + 1}/3): {err[:120]}")
                if attempt < 2 and any(k in err.lower() for k in ("connection", "timeout")):
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                await websocket.send(json.dumps({"type": "error", "error": err[:300]}))
                return

        if response_data is None:
            return

        stop_reason = response_data.get("stop_reason", "end_turn")
        content_blocks: list = response_data.get("content", [])
        print(f"[OPENAI] Anthropic stop_reason={stop_reason}, blocks={len(content_blocks)}")

        text_blocks = [b for b in content_blocks if b.get("type") == "text"]
        tool_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

        # Store in OpenAI format for session consistency
        assistant_msg: dict = {"role": "assistant", "content": None}
        if text_blocks:
            text = " ".join(b["text"] for b in text_blocks)
            assistant_msg["content"] = text
            # Only send intermediate thoughts to websocket if NOT invoking a tool
            # (Silences "thinking out loud" during multi-step execution loops)
            if stop_reason != "tool_use":
                await websocket.send(json.dumps({"type": "agent_event", "text": text}))
            print(f"[OPENAI] TEXT: {text[:100]}...")

        if tool_blocks:
            assistant_msg["tool_calls"] = [
                {
                    "id": b["id"], "type": "function",
                    "function": {"name": b["name"], "arguments": json.dumps(b["input"])},
                }
                for b in tool_blocks
            ]

        messages.append(assistant_msg)

        if stop_reason == "end_turn" or not tool_blocks:
            break

        for b in tool_blocks:
            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_call": {"name": b["name"], "args": b["input"]},
            }))
            print(f"[OPENAI] TOOL: {b['name']}")

            try:
                if b["name"] == "run_cad_code":
                    result = await asyncio.to_thread(run_cad_code, b["input"].get("code", ""))
                    result = _restore_code_in_result(result)
                else:
                    fn = TOOL_MAP.get(b["name"])
                    result = str(fn(b["input"])) if fn else json.dumps({"error": f"Unknown tool: {b['name']}"})
                print(f"[OPENAI] RESULT: {b['name']} ok ({len(result)} chars)")
            except Exception as e:
                result = json.dumps({"error": str(e)})
                print(f"[OPENAI] RESULT: {b['name']} FAIL: {e}")

            # Circuit breaker: chamfer/fillet death loops
            if b["name"] == "run_cad_code":
                try:
                    rj = json.loads(result) if isinstance(result, str) else {}
                    err = (rj.get("error") or "").lower()
                    if not rj.get("ok") and ("chamfer" in err or "fillet" in err):
                        _chamfer_fails += 1
                        if _chamfer_fails >= 3:
                            messages.append({
                                "role": "user",
                                "content": (
                                    "SYSTEM NOTE: The chamfer/fillet operation has failed 3 times. "
                                    "The selected edges are not suitable for chamfer/fillet. "
                                    "STOP all chamfer/fillet attempts. Complete the part WITHOUT chamfers. "
                                    "A working part without chamfers is better than repeated failures."
                                ),
                            })
                            _chamfer_fails = 0
                            print(f"[OPENAI] CIRCUIT BREAKER: chamfer/fillet skipped after 3 failures")
                    else:
                        _chamfer_fails = 0
                except Exception:
                    pass

            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_result": {
                    "name": b["name"],
                    "response": result if b["name"] == "run_cad_code" else result[:1000],
                },
            }))
            messages.append({"role": "tool", "tool_call_id": b["id"], "content": result})

            # ── Auto-inspect after successful CAD generation ──────────
            if b["name"] == "run_cad_code":
                session_id = _current_session_id.get()
                user_req = _last_user_request.get(session_id, "")
                if user_req:
                    inspection = await _auto_inspect_cad(websocket, result, user_req, api_key)
                    if inspection:
                        messages.append({
                            "role": "user",
                            "content": inspection,
                        })


# ── Image analysis helper ──────────────────────────────────────────────────────

async def _analyze_image(image_data: str, user_text: str) -> str | None:
    """Send image to IMAGE_ANALYZER (Kimi GO), get engineering description."""
    import httpx

    analyzer_config = MODEL_CONFIGS.get(IMAGE_ANALYZER)
    if not analyzer_config:
        print(f"[OPENAI] IMAGE ANALYZER '{IMAGE_ANALYZER}' not found in MODEL_CONFIGS")
        return None

    analyzer_model = analyzer_config["model"]
    analyzer_base = analyzer_config.get("base_url", ZEN_BASE)
    api_key = os.environ.get("OPENCODE_API_KEY", "")

    media_type, b64 = _parse_image_data_url(image_data)
    endpoint = f"{analyzer_base}/chat/completions"

    messages = [
        {"role": "system", "content": IMAGE_ANALYSIS_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": f"Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: {user_text}"},
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
        ]},
    ]

    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    payload = {
        "model": analyzer_model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 8192,
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(endpoint, headers=req_headers, json=payload)
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] IMAGE ANALYSIS FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()
        description = data["choices"][0]["message"]["content"]
        print(f"[OPENAI] IMAGE ANALYSIS: {description[:120] if description else '(empty)'}...")
    except Exception as e:
        import traceback
        print(f"[OPENAI] IMAGE ANALYSIS FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        return None

    return description


async def _analyze_image_anthropic(image_data: str, user_text: str) -> str | None:
    """Send image to IMAGE_ANALYZER_B (MiniMax M3 GO) via Anthropic /messages."""
    import httpx

    analyzer_config = MODEL_CONFIGS.get(IMAGE_ANALYZER_B)
    if not analyzer_config:
        print(f"[OPENAI] IMAGE ANALYZER B '{IMAGE_ANALYZER_B}' not found")
        return None

    analyzer_model = analyzer_config["model"]
    analyzer_base = analyzer_config.get("base_url", ZEN_BASE)
    api_key = os.environ.get("OPENCODE_API_KEY", "")

    media_type, b64 = _parse_image_data_url(image_data)
    endpoint = f"{analyzer_base}/messages"

    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    payload = {
        "model": analyzer_model,
        "system": IMAGE_ANALYSIS_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: {user_text}"},
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                ],
            },
        ],
        "max_tokens": 8192,
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(endpoint, headers=req_headers, json=payload)
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] IMAGE ANALYSIS B FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()
        # Anthropic response format
        content_blocks = data.get("content", [])
        text_blocks = [b["text"] for b in content_blocks if b.get("type") == "text"]
        description = " ".join(text_blocks) if text_blocks else ""
    except Exception as e:
        import traceback
        print(f"[OPENAI] IMAGE ANALYSIS B FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        return None

    print(f"[OPENAI] IMAGE ANALYSIS B: {description[:120]}...")
    return description or None


# ── Google Gemini direct (REST API) ────────────────────────────────────────────

async def _analyze_image_gemini(image_data: str, user_text: str, api_key: str) -> str | None:
    """Analyze image with Google Gemini REST API (direct, no Zen)."""
    import httpx
    import base64

    media_type, b64 = _parse_image_data_url(image_data)
    endpoint = f"{GEMINI_BASE_URL}/models/{GEMINI_VISION_MODEL}:generateContent?key={api_key}"

    payload = {
        "systemInstruction": {
            "parts": [{"text": IMAGE_ANALYSIS_PROMPT}],
        },
        "contents": [{
            "parts": [
                {"text": f"Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: {user_text}"},
                {"inlineData": {"mimeType": media_type, "data": b64}},
            ],
        }],
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
            )
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] GEMINI IMAGE ANALYSIS FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            print(f"[OPENAI] GEMINI IMAGE: no candidates in response")
            return None

        parts = candidates[0].get("content", {}).get("parts", [])
        text = " ".join(p.get("text", "") for p in parts if "text" in p)
        if not text:
            print(f"[OPENAI] GEMINI IMAGE: empty text response")
            return None

        print(f"[OPENAI] GEMINI IMAGE: {text[:120]}...")
        return text
    except Exception as e:
        print(f"[OPENAI] GEMINI IMAGE FAILED: {type(e).__name__}: {e}")
        return None


async def _analyze_cad_snapshots_gemini(
    png_paths: list[Path],
    cad_facts: str,
    user_request: str,
    api_key: str,
) -> str | None:
    """Inspect CAD snapshots with Google Gemini REST API."""
    import httpx
    import base64

    endpoint = f"{GEMINI_BASE_URL}/models/{GEMINI_VISION_MODEL}:generateContent?key={api_key}"

    view_names = {
        "front": "frontal", "back": "posterior", "left": "izquierda",
        "right": "derecha", "bottom": "inferior",
    }
    parts: list[dict] = []
    for png in png_paths:
        b64 = base64.b64encode(png.read_bytes()).decode()
        stem = png.stem
        view_key = stem.replace("view_", "")
        label = view_names.get(view_key, view_key)
        parts.append({"text": f"\n--- Vista {label.upper()} ---"})
        parts.append({"inlineData": {"mimeType": "image/png", "data": b64}})

    payload = {
        "systemInstruction": {
            "parts": [{"text": CAD_INSPECTION_PROMPT}],
        },
        "contents": [{
            "parts": [
                {"text": f"Inspecciona esta pieza CAD.\n\nDatos geométricos: {cad_facts}\n\nPetición original: {user_request}"},
                *parts,
            ],
        }],
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
            )
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] GEMINI CAD SNAPSHOT FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return None

        parts_out = candidates[0].get("content", {}).get("parts", [])
        text = " ".join(p.get("text", "") for p in parts_out if "text" in p)
        if not text:
            return None

        print(f"[OPENAI] GEMINI CAD SNAPSHOT: {text[:120]}...")
        return text
    except Exception as e:
        print(f"[OPENAI] GEMINI CAD SNAPSHOT FAILED: {type(e).__name__}: {e}")
        return None


# ── Fallback chain helpers ──────────────────────────────────────────────────────

async def _analyze_image_with_fallback(image_data: str, user_text: str) -> str | None:
    """Analyze user image: Gemini → kimi-go-2.7 → kimi-go."""
    google_key = os.environ.get("GOOGLE_API_KEY", "")

    # 1. Gemini (Google direct)
    if google_key:
        result = await _analyze_image_gemini(image_data, user_text, google_key)
        if result:
            return result
        print("[OPENAI] IMAGE FALLBACK: Gemini failed, trying nvidia-cosmos...")

    # 2. nvidia-cosmos (Nemotron omni, multimodal, free tier)
    # result = await _analyze_image_chat_fallback(image_data, user_text, "nvidia-cosmos")
    # if result:
    #     return result

    # 3. kimi-go (kimi-k2.6)
    print("[OPENAI] IMAGE FALLBACK: nvidia failed, trying kimi-go...")
    result = await _analyze_image_chat_fallback(image_data, user_text, "kimi-go")
    if result:
        return result

    # 4. minimax-m3-go
    print("[OPENAI] IMAGE FALLBACK: kimi-go failed, trying minimax-m3-go...")
    return await _analyze_image_anthropic(image_data, user_text)


async def _analyze_image_chat_fallback(image_data: str, user_text: str, provider: str) -> str | None:
    """Analyze image with any chat-compatible provider via direct httpx."""
    import httpx

    config = MODEL_CONFIGS.get(provider)
    if not config:
        return None

    model = config["model"]
    base_url = config.get("base_url", ZEN_BASE)
    api_key_env = config.get("api_key_env", "OPENCODE_API_KEY")
    api_key = os.environ.get(api_key_env, "")

    media_type, b64 = _parse_image_data_url(image_data)
    endpoint = f"{base_url}/chat/completions"
    print(f"[OPENAI] IMAGE FALLBACK {provider}: image {media_type} {len(b64)} chars base64 → {endpoint}")

    messages = [
        {"role": "system", "content": IMAGE_ANALYSIS_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": f"Analiza esta foto de pieza mecánica para generación CAD.\n\nPetición del usuario: {user_text}"},
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
        ]},
    ]

    temp = float(config.get("temperature", 0.2))
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temp,
        "max_tokens": 8192,
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] IMAGE FALLBACK {provider} FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            print(f"[OPENAI] IMAGE FALLBACK {provider}: empty choices (keys: {list(data.keys())})")
            return None
        msg = choices[0].get("message", {})
        content = msg.get("content")
        # kimi + NVIDIA models put real analysis in `reasoning` (thinking models)
        reasoning = msg.get("reasoning")
        if reasoning and (content is None or (isinstance(reasoning, str) and isinstance(content, str) and len(reasoning) > len(content))):
            content = reasoning
        if isinstance(content, list):
            description = " ".join(p.get("text","") for p in content if isinstance(p, dict) and p.get("type")=="text")
        elif isinstance(content, str):
            description = content
        else:
            print(f"[OPENAI] IMAGE FALLBACK {provider}: unexpected content type {type(content).__name__}")
            return None
        if not description:
            print(f"[OPENAI] IMAGE FALLBACK {provider}: empty content (raw keys: {list(msg.keys())})")
            return None

        print(f"[OPENAI] IMAGE FALLBACK {provider}: {description[:120]}...")
        return description
    except Exception as e:
        print(f"[OPENAI] IMAGE FALLBACK {provider} FAILED: {type(e).__name__}: {e}")
        return None


async def _analyze_cad_with_fallback(
    png_paths: list[Path],
    cad_facts: str,
    user_request: str,   
) -> str | None:
    """Inspect CAD snapshots: Gemini → kimi-go."""
    google_key = os.environ.get("GOOGLE_API_KEY", "")
    opencode_key = os.environ.get("OPENCODE_API_KEY", "")   

    # 1. Gemini
    # if google_key:
    #     result = await _analyze_cad_snapshots_gemini(png_paths, cad_facts, user_request, google_key)
    #     if result:
    #         return result
    #     print("[OPENAI] CAD FALLBACK: Gemini failed, trying kimi-go...")

    # 2. kimi-go (kimi-k2.6, has vision, temp=0.2)
    result = await _analyze_cad_snapshots(
        png_paths, cad_facts, user_request, opencode_key, provider="kimi-go"
    )
    if result:
        return result

    # 3. minimax-m3-go (Anthropic, has vision)
    print("[OPENAI] CAD FALLBACK: kimi-go failed, trying minimax-m3-go...")
    return await _analyze_cad_snapshots_anthropic(png_paths, cad_facts, user_request, opencode_key)

    print("[OPENAI] CAD FALLBACK: all inspectors failed")
    return None

CAD_INSPECTION_PROMPT = """Eres un inspector de calidad. Compara la pieza CAD generada contra la PETICIÓN ORIGINAL del usuario y el CÓDIGO BUILD123D usado para generarla.

Se te muestran 5 vistas + datos geométricos + el código Python que la generó.

## REGLA DE ORO
SOLO reporta errores que CONTRADIGAN la petición explícita del usuario.
El código build123d te dice EXACTAMENTE qué quiso hacer el modelo — verificá que el resultado visual coincida.

## Usa el código para detectar:
- ¿El código usa `RadiusArc` con centro arriba (convexo) pero la imagen muestra filete cóncavo?
- ¿Las dimensiones en el código coinciden con lo que se ve?
- ¿El código omitió features que el análisis de imagen mencionaba?
- ¿El código usa `Cylinder(radius=7.9)` para rosca W 3/8"? → correcto (diámetro de broca)

## Qué NO hacer
- NO sugieras agregar filetes donde no se pidieron
- NO inventes requisitos
- NO des opiniones estéticas

## Si hay error → mencioná SOLO el error concreto
## Si es correcta → "PIEZA CORRECTA" (una línea)
"""

# Track which model_ids have already been auto-inspected this session
_auto_inspected_mids: set[str] = set()

# Store last user request per session for auto-inspect context
_last_user_request: dict[str, str] = {}

# Store last image analysis per session so inspector can compare against original photo
_last_image_analysis: dict[str, str] = {}


async def _analyze_cad_snapshots(
    png_paths: list[Path],
    cad_facts: str,
    user_request: str,
    api_key: str,
    provider: str | None = None,
) -> str | None:
    """Send 5 CAD snapshots to a chat-compatible provider for engineering inspection."""
    import httpx
    import base64

    provider = provider or IMAGE_ANALYZER
    analyzer_config = MODEL_CONFIGS.get(provider)
    if not analyzer_config:
        return None

    analyzer_model = analyzer_config["model"]
    analyzer_base = analyzer_config.get("base_url", ZEN_BASE)
    temperature = float(analyzer_config.get("temperature", 0.2))
    endpoint = f"{analyzer_base}/chat/completions"

    # Build image parts for all 5 views
    image_parts: list[dict] = []
    view_names = {
        "front": "frontal", "back": "posterior", "left": "izquierda",
        "right": "derecha", "bottom": "inferior",
    }
    for png in png_paths:
        b64 = base64.b64encode(png.read_bytes()).decode()
        # Extract view name from filename: view_front.png → front
        stem = png.stem  # view_front
        view_key = stem.replace("view_", "")
        label = view_names.get(view_key, view_key)
        image_parts.append({"type": "text", "text": f"\n--- Vista {label.upper()} ---"})
        image_parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})

    messages = [
        {"role": "system", "content": CAD_INSPECTION_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": f"Inspecciona esta pieza CAD.\n\nDatos geométricos: {cad_facts}\n\nPetición original: {user_request}"},
            *image_parts,
        ]},
    ]

    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    payload = {
        "model": analyzer_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 2048,
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(endpoint, headers=req_headers, json=payload)
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] CAD SNAPSHOT ANALYSIS FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()
        msg = data["choices"][0].get("message", {})
        description = msg.get("content")
        # kimi + NVIDIA models put analysis in `reasoning`
        reasoning = msg.get("reasoning")
        if reasoning and (description is None or (isinstance(reasoning, str) and isinstance(description, str) and len(reasoning) > len(description))):
            description = reasoning
        print(f"[OPENAI] CAD SNAPSHOT ANALYSIS: {str(description)[:120] if description else '(empty)'}...")
    except Exception as e:
        print(f"[OPENAI] CAD SNAPSHOT ANALYSIS FAILED: {type(e).__name__}: {e}")
        return None

    return description


async def _analyze_cad_snapshots_anthropic(
    png_paths: list[Path],
    cad_facts: str,
    user_request: str,
    api_key: str,
) -> str | None:
    """Send 5 CAD snapshots to MiniMax M3 GO (Anthropic API) for engineering inspection."""
    import httpx
    import base64

    analyzer_config = MODEL_CONFIGS.get(IMAGE_ANALYZER_B)
    if not analyzer_config:
        return None

    analyzer_model = analyzer_config["model"]
    analyzer_base = analyzer_config.get("base_url", ZEN_BASE)
    endpoint = f"{analyzer_base}/messages"

    view_names = {
        "front": "frontal", "back": "posterior", "left": "izquierda",
        "right": "derecha", "bottom": "inferior",
    }
    content_blocks: list[dict] = []
    for png in png_paths:
        b64 = base64.b64encode(png.read_bytes()).decode()
        stem = png.stem
        view_key = stem.replace("view_", "")
        label = view_names.get(view_key, view_key)
        content_blocks.append({"type": "text", "text": f"\n--- Vista {label.upper()} ---"})
        content_blocks.append({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}})

    req_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    payload = {
        "model": analyzer_model,
        "system": CAD_INSPECTION_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Inspecciona esta pieza CAD.\n\nDatos geométricos: {cad_facts}\n\nPetición original: {user_request}"},
                    *content_blocks,
                ],
            },
        ],
        "max_tokens": 2048,
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(endpoint, headers=req_headers, json=payload)
            if resp.status_code >= 400:
                body = resp.text[:300]
                print(f"[OPENAI] CAD SNAPSHOT ANALYSIS B FAILED: HTTP {resp.status_code} — {body}")
                return None
            data = resp.json()
        content_blocks_out = data.get("content", [])
        text_blocks = [b["text"] for b in content_blocks_out if b.get("type") == "text"]
        description = " ".join(text_blocks) if text_blocks else ""
    except Exception as e:
        print(f"[OPENAI] CAD SNAPSHOT ANALYSIS B FAILED: {type(e).__name__}: {e}")
        return None

    print(f"[OPENAI] CAD SNAPSHOT ANALYSIS B: {description[:120]}...")
    return description or None


async def _auto_inspect_cad(
    websocket,
    result_json: str,
    user_request: str,
    api_key: str,
) -> str | None:
    """Auto-inspect a freshly generated CAD model via vision models.

    1. Renders 5 multi-view snapshots.
    2. Sends them to both vision inspectors (Kimi + MiniMax) in parallel.
    3. Returns merged feedback text, or None if inspection is unavailable.
    """
    try:
        data = json.loads(result_json)
    except Exception:
        return None

    if not data.get("ok"):
        return None

    model_id = data.get("model_id")
    if not model_id:
        return None

    # Deduplicate: skip if this model_id was already inspected
    if model_id in _auto_inspected_mids:
        return None

    step_path = f"{model_id}/{model_id}.step"
    output_path = Path(__file__).parent.parent / "output"
    model_dir = output_path / model_id

    # 1. Render 5 snapshots
    await websocket.send(json.dumps({
        "type": "agent_event",
        "tool_call": {"name": "inspect_visual", "args": {"model_id": model_id}},
    }))

    try:
        from cad_engine.screenshot import render_multiview_snapshots
    except Exception as e:
        print(f"[OPENAI] Auto-inspect: import failed: {e}")
        return None

    glb_files = sorted(model_dir.glob("*.glb"))
    if not glb_files:
        print(f"[OPENAI] Auto-inspect: no GLB for {model_id}")
        return None

    try:
        views = render_multiview_snapshots(glb_files[0], model_dir)
    except Exception as e:
        print(f"[OPENAI] Auto-inspect: snapshot render failed: {e}")
        return None

    png_paths = [p for name, p in views.items()]
    if len(png_paths) < 3:
        print(f"[OPENAI] Auto-inspect: only {len(png_paths)} views rendered, need ≥3")
        return None

    # 2. Extract geometry facts from the CAD result for context
    cad_facts = ""
    try:
        facts = data.get("facts", {})
        if facts:
            bbox = facts.get("bbox", {})
            solids = facts.get("solids", "?")
            faces = facts.get("faces", "?")
            cad_facts = f"bbox={bbox}, solids={solids}, faces={faces}"
    except Exception:
        pass

    # Extract the build123d code so inspector can verify intent vs result
    try:
        script_path = model_dir / "_script.py"
        if script_path.exists():
            code = script_path.read_text(encoding="utf-8")
            # Truncate to keep inspector focused on profile/geometry
            if len(code) > 3000:
                code = code[:3000] + "\n... (truncated)"
            cad_facts += f"\n\n[CODIGO BUILD123D GENERADO]\n{code}"
    except Exception:
        pass

    # Include original image analysis so inspector can compare CAD vs photo
    session_id = _current_session_id.get()
    img_analysis = _last_image_analysis.get(session_id, "")
    if img_analysis:
        user_request = (
            f"[COMPARA CONTRA ESTE ANÁLISIS DE LA FOTO ORIGINAL]\n{img_analysis}\n\n"
            f"[PETICIÓN DEL USUARIO]\n{user_request}"
        )

    # 3. Send to Gemini / fallback chain for inspection
    print(f"[OPENAI] Auto-inspect: {len(png_paths)} views → Gemini fallback chain")
    feedback = await _analyze_cad_with_fallback(png_paths, cad_facts, user_request)

    if not feedback:
        print(f"[OPENAI] Auto-inspect: all inspectors failed")
        return None

    # Wrap feedback for LLM context
    feedback = (
        "[INSPECCIÓN VISUAL AUTOMÁTICA — 5 vistas]\n"
        + feedback
        + "\n\nCorrige la geometría si el inspector encontró errores. Si la pieza es correcta, confírmalo."
    )

    _auto_inspected_mids.add(model_id)
    print(f"[OPENAI] Auto-inspect: feedback ready ({len(feedback)} chars)")

    await websocket.send(json.dumps({
        "type": "agent_event",
        "tool_result": {
            "name": "inspect_visual",
            "response": feedback[:1000],
        },
    }))

    return feedback


# ── Main dispatcher ────────────────────────────────────────────────────────────

async def process_user_message(
    websocket,
    user_text: str,
    provider: str,
    session_id: str,
    image_data: str | None = None,
) -> None:
    if provider not in MODEL_CONFIGS:
        print(f"[OPENAI] ERROR: unknown provider '{provider}'. Valid: {list(MODEL_CONFIGS)}")
        await websocket.send(json.dumps({
            "type": "error",
            "error": f"Provider '{provider}' not found. Choose one: {', '.join(MODEL_CONFIGS)}",
        }))
        return
    config  = MODEL_CONFIGS[provider]
    model   = config["model"]
    api     = config["api"]
    # Use model-specific API key if configured, else OpenCode key
    api_key_env = config.get("api_key_env", "OPENCODE_API_KEY")
    api_key = os.environ.get(api_key_env, "")

    # Tier classification + prompt augmentation (mirrors server.py)
    augmented_text, tier = assemble_prompt(user_text)
    _current_tier.set(tier)
    print(f"[OPENAI] TIER={tier} provider={provider} model={model} session={session_id[:12]}")

    # ── Image pipeline: non-vision model + image → analyze with Gemini / fallback ─
    needs_image_pipeline = (
        image_data is not None
        and provider not in MODELS_WITH_VISION
        and api != "gemini"
    )
    if needs_image_pipeline:
        print(f"[OPENAI] IMAGE PIPELINE: analyzing with Gemini → fallback chain...")
        await websocket.send(json.dumps({
            "type": "agent_event",
            "tool_call": {"name": "analyze_image", "args": {"engine": "gemini-3.1-pro-preview"}}
        }))

        description = await _analyze_image_with_fallback(image_data, user_text)

        if description:
            # Store for auto-inspect comparison
            _last_image_analysis[session_id] = description
            augmented_text = (
                f"[ANÁLISIS DE IMAGEN — INGENIERO]\n{description}\n\n"
                f"Petición del usuario: {user_text}\n\n"
                "IMPORTANTE: genera el CAD DIRECTAMENTE basado en el análisis. "
                "No repitas la descripción — el usuario ya la conoce. Sé conciso."
            )
            image_data = None
            await websocket.send(json.dumps({
                "type": "agent_event",
                "tool_result": {"name": "analyze_image", "response": "Análisis completado."},
            }))
            await websocket.send(json.dumps({
                "type": "agent_event",
                "text": "Imagen analizada. Generando CAD...",
            }))
        else:
            print(f"[OPENAI] IMAGE PIPELINE FAILED — all analyzers failed")
            image_data = None
            await websocket.send(json.dumps({
                "type": "agent_event",
                "text": "No se pudo analizar la imagen con ningún modelo. Intentando solo con el texto...",
            }))

    if session_id not in SESSIONS:
        system_prompt = SIMPLE_CAD_PROMPT if tier == "SIMPLE" else CAD_AGENT_PROMPT
        SESSIONS[session_id] = [{"role": "system", "content": system_prompt}]
    else:
        # Update system prompt if tier changed (e.g. SIMPLE → MODERATE escalation)
        current_system = SESSIONS[session_id][0].get("content", "") if SESSIONS[session_id] else ""
        target_prompt = SIMPLE_CAD_PROMPT if tier == "SIMPLE" else CAD_AGENT_PROMPT
        if current_system != target_prompt and SESSIONS[session_id]:
            SESSIONS[session_id][0]["content"] = target_prompt

    # Prune session if it grew too large from repair loops
    # Keep system prompt + last N messages to preserve repair context
    session_msgs = SESSIONS[session_id]
    if len(session_msgs) > 16:
        system_msg = session_msgs[0]
        keep_last = 6  # 3 full exchanges (user → assistant → tool → assistant)
        SESSIONS[session_id] = [system_msg] + session_msgs[-keep_last:]
        print(f"[OPENAI] Session pruned ({len(session_msgs)} → {1 + keep_last}) to prevent context bloat")
    SESSION_LAST_ACCESS[session_id] = time.time()

    expected_dims = set_expected_dims(session_id, user_text)
    if expected_dims:
        print(f"[OPENAI] EXPECTED_DIMS session={session_id[:12]} keys={sorted(expected_dims.keys())}")

    messages = SESSIONS[session_id]
    messages.append({"role": "user", "content": _build_user_content(augmented_text, image_data)})

    # Store original user request for auto-inspect context
    _last_user_request[session_id] = user_text

    base_url = config.get("base_url", ZEN_BASE)
    temperature = float(config.get("temperature", 0.2))
    if api == "messages":
        await _run_messages(websocket, messages, model, api_key, base_url)
    elif api == "gemini":
        await _run_gemini_zen(websocket, messages, model, api_key)
    elif api == "gemini-direct":
        google_key = os.environ.get("GOOGLE_API_KEY", "")
        if not google_key:
            await websocket.send(json.dumps({"type": "error", "error": "GOOGLE_API_KEY not set. Add it to .env"}))
            return
        await _run_gemini_direct(websocket, messages, model, google_key)
    else:
        await _run_chat(websocket, messages, model, api_key, base_url, temperature)

    print(f"[OPENAI] Completed, sending done")
    try:
        await websocket.send(json.dumps({"type": "done", "tier": tier}))
    except Exception:
        pass


# ── WebSocket session ──────────────────────────────────────────────────────────

async def agent_session(websocket) -> None:
    addr = websocket.remote_address[0] if hasattr(websocket, "remote_address") else "?"
    print(f"[OPENAI] CONNECT from={addr}")
    await websocket.send(json.dumps({"type": "ready", "message": "OpenAI Agent connected"}))

    used_sids: set[str] = set()
    msg_counter = 0

    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        user_text  = msg.get("message", "")
        provider   = msg.get("provider", DEFAULT_PROVIDER)
        user_image = msg.get("image", None)
        client_sid = msg.get("session_id", f"sid_{addr}_{id(websocket)}")

        # Handle face_pick messages
        if msg.get("type") == "face_pick":
            pos = msg.get("position", {})
            nrm = msg.get("normal", {})
            scale = msg.get("scale", 1000.0)
            model_id = msg.get("modelId", "")
            _current_session_id.set(client_sid)
            try:
                result = pick_face_on_model(
                    pos.get("x", 0), pos.get("y", 0), pos.get("z", 0),
                    nrm.get("x", 0), nrm.get("y", 0), nrm.get("z", 0),
                    scale,
                    model_id=model_id,
                )
                data = json.loads(result)
                response = {"type": "face_pick_result", **data}
                await websocket.send(json.dumps(response))
            except Exception as e:
                await websocket.send(json.dumps({"type": "face_pick_result", "error": str(e)}))
            continue

        if not user_text and not user_image:
            await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
            continue

        if not user_text and user_image:
            user_text = "Analiza esta imagen y genera el modelo CAD correspondiente"

        msg_counter += 1
        used_sids.add(client_sid)

        # Set context vars so tools can read session / tier / attempt info
        _current_session_id.set(client_sid)
        _current_tier.set("MODERATE")
        _attempt_counts[client_sid] = 0

        print(f"[OPENAI] MESSAGE #{msg_counter} (session={client_sid[:12]}): {user_text[:80]}...")

        try:
            await process_user_message(websocket, user_text, provider, client_sid, user_image or None)
        except Exception as e:
            print(f"[OPENAI] ERROR: {e}")
            try:
                await websocket.send(json.dumps({"type": "error", "error": str(e)[:300]}))
            except Exception:
                break

    # Clean up session resources on disconnect (same as server.py)
    for sid in used_sids:
        try:
            release_session_resources(sid)
        except Exception as e:
            print(f"[OPENAI] cleanup error for {sid[:12]}: {e}")
        _last_user_request.pop(sid, None)
        _last_image_analysis.pop(sid, None)
    print(f"[OPENAI] DISCONNECT from={addr}")


async def main() -> None:
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("OPENAI_AGENT_PORT", "8003"))
    print(f"[OPENAI] Agent server starting on ws://{host}:{port}")
    print(f"[OPENAI] Providers: {', '.join(MODEL_CONFIGS)}")
    cleanup_task = asyncio.create_task(_cleanup_sessions_loop())
    async with serve(agent_session, host, port) as server:
        await server.serve_forever()
    cleanup_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
