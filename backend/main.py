"""
ManfacterCAD — Python Backend
FastAPI server for CAD generation using build123d + OpenCASCADE.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import signal

def handler(signum, frame):
    print(f"[BACKEND] Signal {signum} received, shutting down.")
    sys.exit(0)
    
signal.signal(signal.SIGINT, handler)
signal.signal(signal.SIGTERM, handler)

from cad_engine.generator import generate_cad

app = FastAPI(
    title="ManfacterCAD Engine",
    description="CAD generation backend using build123d + OpenCASCADE",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    code: str = Field(..., description="Python code with gen_step() function using build123d")
    model_id: str | None = Field(None, description="Optional model identifier")


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "build123d + OpenCASCADE"}


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    result = generate_cad(req.code, req.model_id)

    if not result["success"]:
        raise HTTPException(
            status_code=422,
            detail={
                "error": result["error"],
                "code": req.code[:500],
            },
        )

    return result


OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
