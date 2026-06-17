"""
ManfacterCAD Agent Server — WebSocket server wrapping the ADK agent.
"""

import asyncio
import base64
import json
import os
import sys
import warnings
from pathlib import Path
import signal

sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env from project root
env_file = Path(__file__).parent.parent.parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key not in os.environ:
                    os.environ[key] = value

if not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")

warnings.filterwarnings("ignore", message=".*EXPERIMENTAL.*")

import websockets
from websockets.asyncio.server import serve

from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from agent.feature_flags import is_epic_a_enabled
from agent.prompt import CAD_AGENT_PROMPT, GOTCHAS_VERSION, assemble_prompt
from agent.tools import (
    TOOLS,
    _attempt_counts,
    _current_session_id,
    _current_tier,
    release_session_resources,
    set_expected_dims,
    make_snapshots,
)

# Gemini models available via the direct Google API key
GEMINI_MODEL_MAP: dict[str, str] = {
    "gemini":            "gemini-3.5-flash",
    "gemini-pro-google": "gemini-3.1-pro-preview",
    "gemini-2.5-pro":    "gemini-2.5-pro",
}

def handler(signum, frame):
    print(f"[AGENT] Signal {signum} received, shutting down.")
    sys.exit(0)
signal.signal(signal.SIGINT, handler)
signal.signal(signal.SIGTERM, handler)


SESSION_SERVICE = InMemorySessionService()

async def process_user_message(
    websocket,
    user_text: str,
    user_id: str,
    session_id: str,
    image_data: str | None = None,
    provider: str = "gemini",
):
    """Run the ADK agent and stream events back. Retries on connection errors."""
    import time

    model_name = GEMINI_MODEL_MAP.get(provider, "gemini-3.5-flash")
    augmented_text, tier = assemble_prompt(user_text)
    _current_tier.set(tier)
    print(
        f"[AGENT] TIER={tier} model={model_name} epic_a={is_epic_a_enabled()} "
        f"gotchas_v={GOTCHAS_VERSION} session={session_id[:12]}"
    )

    max_retries = 5
    for attempt in range(max_retries):
        try:
            from google.genai import types as genai_types

            existing = await SESSION_SERVICE.get_session(
                app_name="manfactercad",
                user_id=user_id,
                session_id=session_id,
            )
            if existing is None:
                await SESSION_SERVICE.create_session(
                    app_name="manfactercad",
                    user_id=user_id,
                    session_id=session_id,
                )

            agent = Agent(
                name="manfacter_cad",
                model=model_name,
                instruction=CAD_AGENT_PROMPT,
                tools=TOOLS,
            )
            runner = Runner(
                app_name="manfactercad",
                agent=agent,
                session_service=SESSION_SERVICE,
            )

            parts = [genai_types.Part.from_text(text=augmented_text)]
            if image_data:
                try:
                    if "," in image_data:
                        header, b64 = image_data.split(",", 1)
                        mime = "image/png"
                        if "jpeg" in header or "jpg" in header:
                            mime = "image/jpeg"
                        elif "webp" in header:
                            mime = "image/webp"
                        raw_bytes = base64.b64decode(b64)
                    else:
                        raw_bytes = base64.b64decode(image_data)
                        mime = "image/png"
                    parts.append(genai_types.Part.from_bytes(data=raw_bytes, mime_type=mime))
                except Exception as e:
                    print(f"[AGENT] Image decode failed: {e}")

            content = genai_types.Content(role="user", parts=parts)

            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=content,
            ):
                author = getattr(event, 'author', None)
                if author and str(author) == "user":
                    continue

                evt: dict = {"type": "agent_event", "tier": tier}

                event_content = getattr(event, 'content', None)
                if event_content:
                    parts_list = getattr(event_content, 'parts', [])
                    for part in parts_list:
                        text = getattr(part, 'text', None)
                        if text:
                            evt["text"] = text
                            print(f"[AGENT] TEXT: {text[:100]}...")

                        fn_call = getattr(part, 'function_call', None)
                        if fn_call:
                            evt["tool_call"] = {
                                "name": getattr(fn_call, 'name', 'unknown'),
                                "args": dict(getattr(fn_call, 'args', {}) or {}),
                            }
                            print(f"[AGENT] TOOL: {evt['tool_call']['name']}")

                        fn_resp = getattr(part, 'function_response', None)
                        if fn_resp:
                            fn_name = getattr(fn_resp, 'name', 'unknown')
                            raw_response = getattr(fn_resp, 'response', '')
                            print(f"[AGENT] RESPONSE type={type(raw_response).__name__}, preview={str(raw_response)[:80]}")
                            if isinstance(raw_response, dict):
                                raw = raw_response.get("result", str(raw_response))
                                if not isinstance(raw, str):
                                    raw = str(raw)
                            else:
                                raw = str(raw_response)
                            limit = len(raw) if fn_name == 'run_cad_code' else 500
                            evt["tool_result"] = {
                                "name": fn_name,
                                "response": raw[:limit],
                            }
                            print(f"[AGENT] RESULT: {fn_name} ok ({len(raw[:limit])} chars)")

                await websocket.send(json.dumps(evt, default=str))

            print(f"[AGENT] Runner completed, sending done")
            try:
                await websocket.send(json.dumps({"type": "done", "tier": tier}))
            except Exception:
                print(f"[AGENT] Could not send done (client disconnected)")
            return

        except GeneratorExit:
            print(f"[AGENT] GeneratorExit (normal)")
            try:
                await websocket.send(json.dumps({"type": "done", "tier": tier}))
            except Exception:
                pass
            return
        except Exception as e:
            err_msg = str(e)
            print(f"[AGENT] ERROR (attempt {attempt+1}/{max_retries}): {err_msg[:150]}")
            if attempt < max_retries - 1 and ("disconnected" in err_msg.lower() or "remote" in err_msg.lower()):
                wait = 2 ** attempt
                print(f"[AGENT] Retrying in {wait}s...")
                time.sleep(wait)
                continue
            try:
                await websocket.send(json.dumps({"type": "error", "error": err_msg[:300]}))
            except Exception:
                pass
            return


async def agent_session(websocket):
    """Handle one WebSocket connection."""
    client = websocket.remote_address[0] if hasattr(websocket, 'remote_address') else "?"
    print(f"[AGENT] CONNECT from={client}")

    await websocket.send(json.dumps({"type": "ready", "message": "Agent connected"}))

    msg_counter = 0
    # Persistent session ID per connection - keeps conversation context
    session_id = f"ag_{client}_{id(websocket)}"
    sessions: dict = {}
    used_sids: set[str] = set()

    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        user_text  = msg.get("message", "")
        user_image = msg.get("image", None)
        client_sid = msg.get("session_id", session_id)
        provider   = msg.get("provider", "gemini")

        if not user_text and not user_image:
            if user_image:
                user_text = "Analiza esta imagen y genera el modelo CAD correspondiente"
            else:
                await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
                continue

        msg_counter += 1
        uid = f"user_{client}"
        sid = client_sid

        _current_session_id.set(sid)
        _current_tier.set("MODERATE")
        _attempt_counts[sid] = 0
        used_sids.add(sid)

        expected_dims = set_expected_dims(sid, user_text)
        if expected_dims:
            print(
                f"[AGENT] EXPECTED_DIMS session={sid[:12]} keys={sorted(expected_dims.keys())}"
            )

        print(f"[AGENT] MESSAGE #{msg_counter} (session={sid[:12]}): {user_text[:80]}...")

        try:
            await process_user_message(websocket, user_text, uid, sid, user_image or None, provider)
        except Exception as e:
            print(f"[AGENT] ERROR: {e}")
            try:
                await websocket.send(json.dumps({"type": "error", "error": str(e)}))
            except Exception:
                break

    try:
        cleanup_targets = used_sids | {session_id}
        for sid in cleanup_targets:
            try:
                release_session_resources(sid)
            except Exception as per_sid_err:
                print(
                    f"[AGENT] cleanup error for {sid[:12]}: {per_sid_err}"
                )
    except Exception as cleanup_err:
        print(f"[AGENT] cleanup error: {cleanup_err}")
    print(f"[AGENT] DISCONNECT from={client}")


async def main():
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("GEMINI_AGENT_PORT", "8002"))
    print(f"[AGENT] ADK Agent server starting on ws://{host}:{port}")
    async with serve(agent_session, host, port) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
