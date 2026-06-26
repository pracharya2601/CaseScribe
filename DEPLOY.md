# CaseScribe — AgentBox Deploy Runbook

Everything needed to get CaseScribe live on GMI AgentBox. Do this **before 4:30** — never push deployment to the last hour (SPEC §3 slip rule). Even a "pending review" listing counts as marketplace-ready; screenshot it.

## 0. Prerequisites

- The image builds and passes the container smoke test (see `CLAUDE.md` → done). 
- Build for **linux/amd64** — AgentBox runs amd64; a Mac builds arm64 by default and AgentBox will refuse to start it.
  ```bash
  docker buildx build --platform linux/amd64 -t casescribe:amd64 --load .
  ```
- **GitHub Container Registry (GHCR)** — image path is `ghcr.io/<your-github-username-lowercased>/casescribe`. AgentBox pulls from here.

## 1. Build + publish to GHCR via GitHub Actions (recommended)

The workflow at `.github/workflows/docker-publish.yml` builds on GitHub's **native amd64** runners (no QEMU) and pushes to GHCR using the built-in `GITHUB_TOKEN` — **no PAT needed**.

**a. Put the repo on GitHub.** The local repo is already initialized and committed on `main`. Create an empty repo named **`casescribe`** under your account at github.com/new (no README/license — keep it empty), then:
```bash
export GH_USER=<your-github-username>        # e.g. pracharya2601
git remote add origin https://github.com/$GH_USER/casescribe.git
git push -u origin main
```
The push to `main` triggers the workflow. Watch it under the repo's **Actions** tab; on success the image is at `ghcr.io/$GH_USER/casescribe:latest` (lowercased automatically).

**b. Make AgentBox able to pull it.** GHCR packages are **private by default**. Either:
- **Public (simplest):** GitHub → your `casescribe` package → Package settings → Change visibility → **Public**. AgentBox then needs no registry credentials.
- **Keep private:** in wizard Step 2 below, supply your username + a `read:packages` PAT as the registry username/password.

> **Local-push fallback** (if you'd rather not use Actions): `docker login ghcr.io -u <user> --password-stdin` with a `write:packages` PAT, then `docker tag casescribe:amd64 ghcr.io/<user>/casescribe:latest && docker push …`. The `casescribe:amd64` image is already built locally.

## 2. Register the Agent — the 5-step wizard

| Step | Field | Value |
|---|---|---|
| **1. Basics & Template** | Internal name | `casescribe` |
| | Listing title | `CaseScribe — Documentation Co-pilot for School Social Workers` |
| **2. Infrastructure** | Docker image | `ghcr.io/<your-github-username>/casescribe:latest` (if private: add `GHCR_USER` + a `read:packages` token) |
| | Compute tier | **Standard — 2 vCPU / 4 GB RAM** (matches the in-memory job store) |
| | Models to authorize | **Select all four** so MaaS may route to each: `nvidia/NVIDIA-Nemotron-3-Nano-Omni`, `Qwen/Qwen3-Next-80B-A3B-Instruct`, `Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8`, `anthropic/claude-sonnet-4.6` |
| **3. Networking** | Exposed port | **8080** |
| **4. Env Variables** | (auto-injected — do NOT set) | `GMI_MAAS_API_KEY`, `GMI_MAAS_BASE_URL`, `GMI_MODELS` are injected by AgentBox |
| | `GMI_TIMEOUT_SECONDS` (TEXT) | `6` — fail fast if venue WiFi stalls mid-call |
| | `GMI_MAX_RETRIES` (TEXT) | `0` — no backoff during the live demo |
| | `GMI_PRICES` (TEXT, optional) | paste real per-model `$/1M` rates from the GMI console so the cost meter is exact |
| **5. Review & Register** | Deployment path | **GMI CE Deployment + MaaS ON** (eligible for the Verified badge) |
| | Region | **US West** (lowest latency at the venue) |

After register, AgentBox pulls + builds the container on demand and gives you a public URL.

## 3. Post-deploy verification (against the public URL)

```bash
BASE=https://<your-agentbox-url>
curl -s $BASE/health                       # -> {"status":"ok"}
curl -s $BASE/ | grep -o '<title>[^<]*</title>'   # serves the UI
JOB=$(curl -s -X POST $BASE/run -H 'Content-Type: application/json' \
      -d '{"dictation":"met w/ Jordan abt exam stress, CBT, 30 min"}' \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['job_id'])")
curl -s $BASE/jobs/$JOB                     # poll -> completed + Trinity
```

Run all **three demo scenarios** end-to-end through the deployed instance and **warm the cache** (run each once) before stage time so the first live run isn't a cold start.

## 4. Marketplace listing fields (the `list-an-agent` flow)

- **Short description**: "An AI worker that turns a school social worker's messy session notes into a signed-ready case note, a mandated-reporter flag, and a Medicaid billing code — in under 60 seconds."
- **Long description**:
  > CaseScribe replaces ~90 minutes of post-session paperwork with a sub-60-second pipeline. From one messy dictation it produces three legally-required documents: a SOAP/GIRP case note, a California mandated-reporter flag (with a draft filing when triggered), and a school-Medicaid CPT code with estimated reimbursement.
  >
  > Built on GMI MaaS multi-model routing: a Nemotron classifier triages, Qwen models handle reporter detection and Medicaid coding, and Claude drafts the clinical note — ~70% of tokens on cheap models for ~$0.04/session. All PII is scrubbed locally with Microsoft Presidio before any text reaches a model (FERPA-safe), and every artifact is stamped as a draft requiring licensed-clinician signature. Each signed edit is captured as training data — the model improves with use.
- **Category**: Workflow & Operations
- **Pricing**: usage-based, **$0.04/run**
- **Tags**: `K-12`, `education`, `social-work`, `healthcare`, `compliance`, `FERPA`, `Medicaid`, `multi-agent`

Submit for review before 4:30; screenshot the pending status for the demo.

## Notes / gotchas

- **Image is ~1.5 GB** (spaCy `en_core_web_lg` ~400 MB) — well within the 10 GiB ephemeral tier. To slim it, swap to `en_core_web_sm` in the Dockerfile (smaller, slightly weaker `LOCATION` detection).
- The container needs **no GMI key baked in** — AgentBox injects it. Local testing only: set `GMI_MAAS_API_KEY` via `-e` or `.env`.
- If the demo WiFi dies entirely, the frontend still runs on `MOCK_TRINITY` (`VITE_USE_MOCK` default) — have the 90-second backup video ready regardless.
