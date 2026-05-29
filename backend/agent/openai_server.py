"""
ManfacterCAD OpenAI Agent Server — WebSocket server wrapping DeepSeek/GLM/Kimi
via the OpenAI-compatible API (OpenCode Go).
"""

import asyncio
import base64
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

import websockets
from websockets.asyncio.server import serve
from openai import AsyncOpenAI

from agent.tools import run_cad_code, inspect_geometry, read_reference, list_outputs, make_snapshot
from agent.prompt import CAD_AGENT_PROMPT

env_file = Path(__file__).parent.parent.parent / ".env"

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
                "required": ["name"]
            }
        }
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
                "required": ["code"]
            }
        }
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
                "required": ["step_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_outputs",
            "description": "List all generated output files.",
            "parameters": {"type": "object", "properties": {}}
        }
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
                "required": ["step_path"]
            }
        }
    },
]

TOOL_MAP = {
    "run_cad_code": lambda args: run_cad_code(args["code"]),
    "inspect_geometry": lambda args: json.dumps(inspect_geometry(args["step_path"]), default=str),
    "read_reference": lambda args: read_reference(args["name"]),
    "list_outputs": lambda args: json.dumps(list_outputs(), default=str),
    "make_snapshot": lambda args: json.dumps(make_snapshot(args["step_path"]), default=str),
}

MODEL_MAP = {
    "deepseek": "deepseek-v4-pro",
    "glm": "glm-5.1",
    "kimi": "kimi-k2.6",
}


SESSIONS = {}
SESSION_LAST_ACCESS = {}
SESSION_TTL = 3600


async def _cleanup_sessions_loop():
    while True:
        await asyncio.sleep(600)
        now = time.time()
        expired = [sid for sid, ts in SESSION_LAST_ACCESS.items() if now - ts > SESSION_TTL]
        for sid in expired:
            SESSIONS.pop(sid, None)
            SESSION_LAST_ACCESS.pop(sid, None)
        if expired:
            print(f"[OPENAI] Cleaned {len(expired)} expired sessions, {len(SESSIONS)} remaining")


async def process_user_message(websocket, user_text: str, provider: str, session_id: str, image_data: str | None = None):
    model_name = MODEL_MAP.get(provider, "glm-5.1")

    client = AsyncOpenAI(
        base_url="https://opencode.ai/zen/go/v1",
        api_key=os.environ.get("OPENCODE_API_KEY", ""),
        timeout=300.0,
        max_retries=2,
    )

    if session_id not in SESSIONS:
        SESSIONS[session_id] = [{"role": "system", "content": CAD_AGENT_PROMPT}]
    SESSION_LAST_ACCESS[session_id] = time.time()

    messages = SESSIONS[session_id]

    if image_data:
        messages.append({"role": "user", "content": user_text})
    else:
        messages.append({"role": "user", "content": user_text})

    max_steps = 20
    for _step in range(max_steps):
        attempt = 0
        response = None
        while attempt < 3:
            try:
                response = await client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    temperature=0.2,
                )
                break
            except Exception as e:
                attempt += 1
                err = str(e)
                print(f"[OPENAI] API error (attempt {attempt}/3): {err[:120]}")
                if attempt < 3 and ("connection" in err.lower() or "disconnect" in err.lower() or "timeout" in err.lower()):
                    await asyncio.sleep(2 ** attempt)
                    continue
                await websocket.send(json.dumps({"type": "error", "error": err[:300]}))
                return

        if response is None:
            return

        choice = response.choices[0]
        finish = choice.finish_reason
        print(f"[OPENAI] finish_reason={finish}, content_len={len(choice.message.content or '')}, tool_calls={len(choice.message.tool_calls or [])}")

        if finish == "stop" or finish is None:
            if choice.message.content:
                messages.append({"role": "assistant", "content": choice.message.content})
                await websocket.send(json.dumps({"type": "agent_event", "text": choice.message.content}))
                print(f"[OPENAI] TEXT: {choice.message.content[:100]}...")
            break

        if finish == "tool_calls" and choice.message.tool_calls:
            assistant_msg = {"role": "assistant"}
            if choice.message.content:
                assistant_msg["content"] = choice.message.content
            if choice.message.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    } for tc in choice.message.tool_calls
                ]
            messages.append(assistant_msg)

            for tc in choice.message.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}

                await websocket.send(json.dumps({
                    "type": "agent_event",
                    "tool_call": {"name": name, "args": args}
                }))
                print(f"[OPENAI] TOOL: {name}")

                try:
                    fn = TOOL_MAP.get(name)
                    if fn:
                        result = str(fn(args))
                    else:
                        result = json.dumps({"error": f"Unknown tool: {name}"})
                    print(f"[OPENAI] RESULT: {name} ok ({len(result)} chars)")
                except Exception as e:
                    result = json.dumps({"error": str(e)})
                    print(f"[OPENAI] RESULT: {name} FAIL: {e}")

                await websocket.send(json.dumps({
                    "type": "agent_event",
                    "tool_result": {"name": name, "response": result[:8000] if name == "run_cad_code" else result[:1000]}
                }))

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result # Keep the full result in message history so the model can inspect full code/errors
                })
        else:
            if choice.message.content:
                messages.append({"role": "assistant", "content": choice.message.content})
                await websocket.send(json.dumps({"type": "agent_event", "text": choice.message.content}))
            break

    print(f"[OPENAI] Completed, sending done")
    try:
        await websocket.send(json.dumps({"type": "done"}))
    except Exception:
        pass


async def agent_session(websocket):
    client = websocket.remote_address[0] if hasattr(websocket, 'remote_address') else "?"
    print(f"[OPENAI] CONNECT from={client}")

    await websocket.send(json.dumps({"type": "ready", "message": "OpenAI Agent connected"}))

    msg_counter = 0
    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        user_text = msg.get("message", "")
        provider = msg.get("provider", "deepseek")
        user_image = msg.get("image", None)
        client_sid = msg.get("session_id", "default_session")

        if not user_text and not user_image:
            await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
            continue

        if not user_text and user_image:
            user_text = "Analiza esta imagen y genera el modelo CAD correspondiente"

        msg_counter += 1
        print(f"[OPENAI] MESSAGE #{msg_counter} (session={client_sid[:12]}): {user_text[:80]}...")

        try:
            await process_user_message(websocket, user_text, provider, client_sid, user_image or None)
        except Exception as e:
            print(f"[OPENAI] ERROR: {e}")
            try:
                await websocket.send(json.dumps({"type": "error", "error": str(e)[:300]}))
            except Exception:
                break

    print(f"[OPENAI] DISCONNECT from={client}")


async def main():
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("OPENAI_AGENT_PORT", "8003"))
    print(f"[OPENAI] Agent server starting on ws://{host}:{port}")
    cleanup_task = asyncio.create_task(_cleanup_sessions_loop())
    async with serve(agent_session, host, port) as server:
        await server.serve_forever()
    cleanup_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
