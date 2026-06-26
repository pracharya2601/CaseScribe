# CaseScribe — agent container (backend only).
#
# This image is the AgentBox async job service: /health, /run, /jobs/{id}.
# It does NOT serve the frontend. AgentBox tasks are ephemeral and not a web
# host — the React UI runs separately (locally for the demo) and points at this
# agent's URL via VITE_API_BASE. CORS is open on the backend so it can.
#
# Listens on port 8080 (AgentBox contract). GMI_MAAS_* are injected at runtime.

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Presidio pulls spaCy; download the model into the image.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    python -m spacy download en_core_web_lg

# Backend source only.
COPY backend/ ./backend/

EXPOSE 8080

WORKDIR /app/backend
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
