"""
ManfacterCAD Agent Server — WebSocket server wrapping the ADK agent.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import websockets
from websockets.asyncio.server import serve

from google.adk import Runner
from google.adk.sessions import InMemorySessionService
from agent.agent import cad_agent


async def process_user_message(websocket, user_text: str, user_id: str, session_id: str):
    """Run the ADK agent and stream events back. Keeps the WebSocket alive for the duration."""
    try:
        from google.genai import types as genai_types

        session_service = InMemorySessionService()
        await session_service.create_session(
            app_name="manfactercad",
            user_id=user_id,
            session_id=session_id,
        )

        runner = Runner(
            app_name="manfactercad",
            agent=cad_agent,
            session_service=session_service,
        )

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=user_text)],
        )

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
                parts = getattr(event_content, 'parts', [])
                for part in parts:
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
                        evt["tool_result"] = {
                            "name": getattr(fn_resp, 'name', 'unknown'),
                            "response": str(getattr(fn_resp, 'response', ''))[:500],
                        }
                        print(f"[AGENT] RESULT: {evt['tool_result']['name']} ok")

            await websocket.send(json.dumps(evt, default=str))

        print(f"[AGENT] Runner completed, sending done")
        try:
            await websocket.send(json.dumps({"type": "done"}))
        except Exception:
            print(f"[AGENT] Could not send done (client disconnected)")

    except GeneratorExit:
        print(f"[AGENT] GeneratorExit (normal)")
        try:
            await websocket.send(json.dumps({"type": "done"}))
        except Exception:
            pass
    except Exception as e:
        print(f"[AGENT] ERROR: {e}")
        try:
            await websocket.send(json.dumps({"type": "error", "error": str(e)}))
        except Exception:
            pass


async def agent_session(websocket):
    """Handle one WebSocket connection."""
    client = websocket.remote_address[0] if hasattr(websocket, 'remote_address') else "?"
    print(f"[AGENT] CONNECT from={client}")

    await websocket.send(json.dumps({"type": "ready", "message": "Agent connected"}))

    msg_counter = 0

    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        user_text = msg.get("message", "")
        if not user_text:
            await websocket.send(json.dumps({"type": "error", "error": "Missing 'message'"}))
            continue

        msg_counter += 1
        sid = f"session_{client}_{msg_counter}"
        uid = f"user_{client}"

        print(f"[AGENT] MESSAGE #{msg_counter}: {user_text[:80]}...")

        try:
            await process_user_message(websocket, user_text, uid, sid)
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
