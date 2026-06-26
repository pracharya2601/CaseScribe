# CaseScribe — single container, two services.
# Stage 1 builds the React frontend; stage 2 is the Python runtime that serves
# both the API and the built static assets on port 8080 (AgentBox contract).

# --------------------------------------------------------------------------- #
# Stage 1 — frontend build (owned by casescribe-ui-kit / casescribe-frontend).
# Guarded: if frontend/ has no package.json yet, this still produces an (empty)
# dist so the runtime mount logic degrades gracefully.
# --------------------------------------------------------------------------- #
FROM node:20-slim AS frontend
WORKDIR /web
COPY frontend/ ./
RUN if [ -f package.json ]; then \
        npm install && npm run build; \
    else \
        echo "no frontend package.json — skipping build" && mkdir -p dist; \
    fi

# --------------------------------------------------------------------------- #
# Stage 2 — Python runtime.
# --------------------------------------------------------------------------- #
FROM python:3.11-slim AS runtime
WORKDIR /app

# Presidio pulls spaCy; build essentials kept minimal.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    python -m spacy download en_core_web_lg

# Backend source.
COPY backend/ ./backend/

# Built frontend from stage 1 -> where app.py expects it (../frontend/dist).
COPY --from=frontend /web/dist/ ./frontend/dist/

# GMI_MAAS_* are injected by AgentBox at runtime; never baked into the image.
EXPOSE 8080

WORKDIR /app/backend
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
