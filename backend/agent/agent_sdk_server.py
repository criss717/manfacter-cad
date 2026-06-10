"""
ManfacterCAD Agent SDK Server — WebSocket server wrapping OpenAI Agents SDK.
Uses the official openai-agents Python library pointed at OpenCode GO/Zen.

Port 8004 — experimental, does NOT replace port 8002 (ADK) or port 8003 (manual).
"""

import asyncio
import base64
import json
import os
import sys
import signal
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env
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

from agents import (
    Agent,
    Runner,
    function_tool,
    set_default_openai_client,
    set_tracing_disabled,
    RunConfig,
    ModelSettings,
)

from agent.tools import (
    run_cad_code,
    inspect_geometry,
    read_reference,
    list_outputs,
    make_snapshot,
    _current_session_id,
    _current_tier,
    _attempt_counts,
    release_session_resources,
    set_expected_dims,
)
from agent.prompt import CAD_AGENT_PROMPT, assemble_prompt

# ── Disable tracing (we use our own logging) ───────────────────────────────
set_tracing_disabled(True)

# ── Configure custom OpenAI client pointing to OpenCode GO ────────────────
_api_key = os.environ.get("OPENCODE_API_KEY", "")
_go_client = AsyncOpenAI(
    base_url="https://opencode.ai/zen/go/v1",
    api_key=_api_key,
    timeout=300.0,
    max_retries=2,
)
set_default_openai_client(_go_client)

# ── Tool definitions (Agents SDK format) ──────────────────────────────────

@function_tool
def agent_run_cad_code(code: str) -> str:
    """Execute build123d Python code. Returns JSON with STEP/STL/GLB URLs."""
    return run_cad_code(code)

@function_tool
def agent_inspect_geometry(step_path: str) -> str:
    """Inspect a generated STEP file. Returns bounding box, faces, edges, solids as JSON."""
    return json.dumps(inspect_geometry(step_path), default=str)

@function_tool
def agent_read_reference(name: str) -> str:
    """Read a build123d reference document. Use for unfamiliar errors or complex APIs."""
    return read_reference(name)

@function_tool
def agent_list_outputs() -> str:
    """List all generated output files as JSON."""
    return json.dumps(list_outputs(), default=str)

@function_tool  
def agent_make_snapshot(step_path: str) -> str:
    """Render a PNG screenshot of the generated model for visual inspection. Returns JSON."""
    return json.dumps(make_snapshot(step_path), default=str)

CAD_TOOLS = [
    agent_run_cad_code,
    agent_inspect_geometry,
    agent_read_reference,
    agent_list_outputs,
    agent_make_snapshot,
]

# ── Agent definition ──────────────────────────────────────────────────────

cad_agent = Agent(
    name="CAD Engineer",
    instructions=CAD_AGENT_PROMPT,
    model="deepseek-v4-pro",  # OpenCode GO model ID
    tools=CAD_TOOLS,
)

# ── WebSocket handler ─────────────────────────────────────────────────────

async def agent_session(websocket):
    """Handle one WebSocket connection using the Agents SDK."""
    addr = websocket.remote_address[0] if hasattr(websocket, "remote_address") else "?"
    print(f"[SDK] CONNECT from={addr}")
    await websocket.send(json.dumps({"type": "ready", "message": "Agent SDK connected"}))

    session_id = f"sdk_{addr}_{id(websocket)}"
    used_sids: set[str] = set()
    msg_counter = 0

    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        user_text = msg.get("message", "")
        user_image = msg.get("image", None)
        client_sid = msg.get("session_id", session_id)

        if not user_text and not user_image:
            await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
            continue
        if not user_text and user_image:
            user_text = "Analiza esta imagen y genera el modelo CAD correspondiente"

        msg_counter += 1
        used_sids.add(client_sid)

        # Set context vars for tools
        _current_session_id.set(client_sid)
        _current_tier.set("MODERATE")
        _attempt_counts[client_sid] = 0

        # Tier classification
        augmented_text, tier = assemble_prompt(user_text)
        _current_tier.set(tier)
        print(f"[SDK] MESSAGE #{msg_counter} (session={client_sid[:12]}): {user_text[:80]}...")
        print(f"[SDK] TIER={tier} model=deepseek-v4-pro")

        set_expected_dims(client_sid, user_text)

        # Enrich with image if present
        if user_image:
            if "," in user_image:
                _, b64 = user_image.split(",", 1)
            else:
                b64 = user_image
            augmented_text = (
                f"[IMAGEN ADJUNTA — data:image/png;base64,{b64[:50]}...]\n\n"
                f"{augmented_text}"
            )

        try:
            result = await Runner.run(
                cad_agent,
                augmented_text,
                max_turns=20,
                run_config=RunConfig(
                    model="deepseek-v4-pro",
                    model_settings=ModelSettings(temperature=0.2),
                ),
            )

            # Stream tool call events to the frontend
            for item in result.to_input_list():
                raw = getattr(item, "raw_item", None)
                if raw is None:
                    continue
                rtype = getattr(raw, "type", "")
                if rtype == "function_call":
                    name = getattr(raw, "name", "unknown")
                    try:
                        args = json.loads(raw.arguments) if hasattr(raw, "arguments") else {}
                    except Exception:
                        args = {}
                    await websocket.send(json.dumps({
                        "type": "agent_event",
                        "tool_call": {"name": name, "args": args},
                    }))
                elif rtype == "function_call_output":
                    await websocket.send(json.dumps({
                        "type": "agent_event",
                        "tool_result": {
                            "name": getattr(raw, "name", "unknown"),
                            "response": str(getattr(raw, "output", ""))[:500],
                        },
                    }))

            final = result.final_output or ""
            if final:
                await websocket.send(json.dumps({
                    "type": "agent_event",
                    "text": final,
                }))

            print(f"[SDK] Completed, sending done")
            await websocket.send(json.dumps({"type": "done", "tier": tier}))

        except Exception as e:
            err = str(e)[:300]
            print(f"[SDK] ERROR: {err}")
            try:
                await websocket.send(json.dumps({"type": "error", "error": err}))
            except Exception:
                pass

    # Cleanup
    for sid in used_sids:
        try:
            release_session_resources(sid)
        except Exception:
            pass
    print(f"[SDK] DISCONNECT from={addr}")


# ── Main ──────────────────────────────────────────────────────────────────

async def main():
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("SDK_AGENT_PORT", "8004"))
    print(f"[SDK] Agents SDK server starting on ws://{host}:{port}")
    print(f"[SDK] Model: deepseek-v4-pro (OpenCode GO)")
    async with serve(agent_session, host, port) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
