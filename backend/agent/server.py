"""
ManfacterCAD Agent Server — WebSocket server wrapping the ADK agent.
"""

import asyncio
import base64
import json
import sys
import warnings
from pathlib import Path
import signal

sys.path.insert(0, str(Path(__file__).parent.parent))

warnings.filterwarnings("ignore", message=".*EXPERIMENTAL.*")

import websockets
from websockets.asyncio.server import serve

from google.adk import Runner
from google.adk.sessions import InMemorySessionService
from agent.agent import cad_agent
from agent.tools import _current_session_id, _attempt_counts

def handler(signum, frame):
    print(f"[AGENT] Signal {signum} received, shutting down.")
    sys.exit(0)
signal.signal(signal.SIGINT, handler)
signal.signal(signal.SIGTERM, handler)


SESSION_SERVICE = InMemorySessionService()

async def process_user_message(websocket, user_text: str, user_id: str, session_id: str, image_data: str | None = None):
    """Run the ADK agent and stream events back. Retries on connection errors."""
    import time

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

            runner = Runner(
                app_name="manfactercad",
                agent=cad_agent,
                session_service=SESSION_SERVICE,
            )

            parts = [genai_types.Part.from_text(text=user_text)]
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

                evt: dict = {"type": "agent_event"}

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
                await websocket.send(json.dumps({"type": "done"}))
            except Exception:
                print(f"[AGENT] Could not send done (client disconnected)")
            return

        except GeneratorExit:
            print(f"[AGENT] GeneratorExit (normal)")
            try:
                await websocket.send(json.dumps({"type": "done"}))
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
            if user_image:
                user_text = "Analiza esta imagen y genera el modelo CAD correspondiente"
            else:
                await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
                continue

        msg_counter += 1
        uid = f"user_{client}"
        sid = client_sid

        _current_session_id.set(sid)
        _attempt_counts[sid] = 0

        print(f"[AGENT] MESSAGE #{msg_counter} (session={sid[:12]}): {user_text[:80]}...")

        try:
            await process_user_message(websocket, user_text, uid, sid, user_image or None)
        except Exception as e:
            print(f"[AGENT] ERROR: {e}")
            try:
                await websocket.send(json.dumps({"type": "error", "error": str(e)}))
            except Exception:
                break

    print(f"[AGENT] DISCONNECT from={client}")


async def main():
    port = 8002
    print(f"[AGENT] ADK Agent server starting on ws://127.0.0.1:{port}")
    async with serve(agent_session, "127.0.0.1", port) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
