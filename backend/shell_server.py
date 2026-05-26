"""
ManfacterCAD Remote Shell — WebSocket server that emulates a terminal
for AI agents. Uses the existing CAD generator + inspect pipeline.
"""

import asyncio
import io
import json
import os
import sys
import uuid
from pathlib import Path
import signal

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import websockets
from websockets.asyncio.server import serve

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def handler(signum, frame):
    print(f"\n[!] Saliendo del servidor de shell (signal {signum})")
    sys.exit(0)

signal.signal(signal.SIGINT, handler)
signal.signal(signal.SIGTERM, handler)


async def handle_generate(code: str, model_id: str | None = None) -> dict:
    """Run CAD generation using the existing generator pipeline."""
    from cad_engine.generator import generate_cad

    mid = model_id or uuid.uuid4().hex[:12]

    old_stdout = sys.stdout
    captured = io.StringIO()
    sys.stdout = captured

    try:
        result = await asyncio.to_thread(generate_cad, code, mid)
    finally:
        sys.stdout = old_stdout
        captured_output = captured.getvalue()
        captured.close()

    if result["success"]:
        return {
            "ok": True,
            "model_id": mid,
            "step": result.get("step_url"),
            "stl": result.get("stl_url"),
            "glb": result.get("glb_url"),
            "facts": result.get("facts"),
            "stdout": captured_output.strip(),
        }
    else:
        return {
            "ok": False,
            "error": result.get("error", "Unknown error"),
            "traceback": result.get("traceback", ""),
            "stdout": captured_output.strip(),
        }


async def handle_inspect(step_path: str) -> dict:
    """Inspect a generated STEP file."""
    from cad_engine.inspect import inspect_step

    path = OUTPUT_DIR / step_path
    if not path.exists():
        return {"ok": False, "error": f"File not found: {path}"}

    try:
        facts = await asyncio.to_thread(inspect_step, path)
        return {"ok": True, "facts": facts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def shell_session(websocket):
    session_id = uuid.uuid4().hex[:10]
    client_ip = websocket.remote_address[0] if hasattr(websocket, 'remote_address') else "unknown"
    print(f"[SHELL] CONNECT session={session_id} from={client_ip}")

    await websocket.send(json.dumps({
        "type": "ready",
        "session_id": session_id,
        "message": "Shell session started. Commands: step, inspect, list, ping",
    }, default=str))

    async for raw in websocket:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "error": "Invalid JSON"}))
            continue

        cmd = msg.get("cmd", "")
        print(f"[SHELL] CMD session={session_id} cmd={cmd}")

        result = {"type": "response", "cmd": cmd, "id": msg.get("id", "")}

        try:
            if cmd == "step":
                code = msg.get("code", "")
                if not code:
                    result.update({"ok": False, "error": "Missing 'code'"})
                else:
                    print(f"[SHELL] STEP session={session_id} code_len={len(code)}")
                    r = await handle_generate(code)
                    result.update(r)
                    result["type"] = "step_result"
                    print(f"[SHELL] STEP session={session_id} ok={r['ok']}")

            elif cmd == "inspect":
                step_path = msg.get("path", "")
                r = await handle_inspect(step_path)
                result.update(r)
                result["type"] = "inspect_result"

            elif cmd == "list":
                files = []
                for f in sorted(OUTPUT_DIR.rglob("*")):
                    if f.is_file():
                        files.append({
                            "name": str(f.relative_to(OUTPUT_DIR)),
                            "size": f.stat().st_size,
                            "suffix": f.suffix,
                        })
                result.update({"ok": True, "files": files[:50]})
                result["type"] = "list_result"

            elif cmd == "ping":
                result.update({"ok": True, "type": "pong"})

            else:
                result.update({
                    "ok": False,
                    "error": f"Unknown: {cmd}. Commands: step, inspect, list, ping",
                })

        except Exception as e:
            result.update({"ok": False, "error": str(e)})

        await websocket.send(json.dumps(result, default=str))

    print(f"[SHELL] DISCONNECT session={session_id}")


async def main():
    port = 8001
    print(f"[SHELL] Shell server starting on ws://127.0.0.1:{port}")
    print(f"[SHELL] Output directory: {OUTPUT_DIR}")
    async with serve(shell_session, "127.0.0.1", port) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
