"""CaseScribe FastAPI app — the AgentBox async job spine.

Routes (per casescribe-platform contract):
  GET  /health        -> 200 {"status":"ok"}
  POST /run           -> 202 {"job_id": "<uuid>"}   (enqueue, return immediately)
  GET  /jobs/{job_id} -> job status object (pending|running|completed|failed)

Serves the built React frontend (frontend/dist) at /, guarded for dev absence.
Listens on port 8080. In-memory job store, no database.

Ownership: casescribe-backend.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from jobs import PIPELINE_SOURCE, JobStore, run_job

load_dotenv()  # local dev: pull GMI_MAAS_* from .env if present

app = FastAPI(title="CaseScribe", version="0.1.0")
store = JobStore()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/run", status_code=202)
async def run(request: Request) -> JSONResponse:
    """Enqueue a session for processing; return a job id immediately."""
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception:
        payload = {}

    job_id = store.create()
    # Fire-and-forget background task; processing happens off the request path.
    import asyncio

    asyncio.create_task(run_job(store, job_id, payload))
    return JSONResponse(status_code=202, content={"job_id": job_id})


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> JSONResponse:
    job = store.get(job_id)
    if job is None:
        return JSONResponse(status_code=404, content={"error": "job not found"})
    return JSONResponse(status_code=200, content=job)


@app.get("/meta")
async def meta() -> Dict[str, Any]:
    """Tiny diagnostic: which pipeline is wired and which models are configured."""
    return {
        "pipeline_source": PIPELINE_SOURCE,
        "models": os.getenv("GMI_MODELS", ""),
        "base_url": os.getenv("GMI_MAAS_BASE_URL", ""),
        "api_key_present": bool(os.getenv("GMI_MAAS_API_KEY")),
    }


# --------------------------------------------------------------------------- #
# Static frontend mount — LAST, so it never shadows the API routes above.
# Guarded: in dev the frontend may not be built yet.
# --------------------------------------------------------------------------- #

_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")
else:  # dev fallback so visiting / is informative rather than a hard 404
    @app.get("/")
    async def _no_frontend() -> Dict[str, str]:
        return {
            "status": "ok",
            "frontend": "not built",
            "hint": "build frontend/dist or use the API at /health, /run, /jobs/{id}",
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
