#!/usr/bin/env bash
# Launch + verify a CaseScribe task on GMI AgentBox.
#
# The token is read from the GMI_TOKEN env var so it is never written to disk
# or pasted into a chat. Run it like:
#
#     export GMI_TOKEN='paste-your-token-here'
#     bash scripts/gmi-launch.sh
#
# What it does: lists tasks under the deployment, provisions one if none is
# running, polls until status=running, extracts the endpoint URL, then verifies
# /health + a real /run -> /jobs Trinity through the live multi-model pipeline.
set -euo pipefail

API="https://api.gmi-serving.com/v1"
DEPLOYMENT="${GMI_DEPLOYMENT:-case-scribe}"
IDC="${GMI_IDC:-us-central-iowa1}"
INSTANCE="${GMI_INSTANCE:-gmi.container.intel.x4660.large}"
TEMPLATE="${GMI_TEMPLATE:-fe8d940c-2e2a-4244-aa71-417adf377ac2}"

if [ -z "${GMI_TOKEN:-}" ]; then
  echo "ERROR: set GMI_TOKEN first:  export GMI_TOKEN='...'" >&2
  exit 1
fi
AUTH=(-H "Authorization: Bearer ${GMI_TOKEN}")
JSON=(-H "Content-Type: application/json")

jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || true; }

echo "== 1. list existing tasks under '${DEPLOYMENT}' =="
TASKS=$(curl -s "${AUTH[@]}" "${API}/agents/deployments/${DEPLOYMENT}/tasks")
echo "$TASKS" | python3 -m json.tool 2>/dev/null | head -40 || echo "$TASKS"

TASK_ID=$(echo "$TASKS" | jqget "next((t['id'] for t in (d.get('tasks') or d.get('data') or d if isinstance(d,list) else []) if str(t.get('status','')).lower() in ('running','pending','provisioning')), '')")

if [ -z "$TASK_ID" ]; then
  echo "== 2. no live task -> provisioning one =="
  PROV=$(curl -s -X POST "${AUTH[@]}" "${JSON[@]}" \
    "${API}/agents/deployments/${DEPLOYMENT}/tasks" \
    -d "{\"idc_name\":\"${IDC}\",\"instance_type\":\"${INSTANCE}\",\"template_id\":\"${TEMPLATE}\"}")
  echo "$PROV" | python3 -m json.tool 2>/dev/null || echo "$PROV"
  TASK_ID=$(echo "$PROV" | jqget "d.get('id') or d.get('task_id') or ''")
  # fall back to re-listing if the POST didn't echo an id
  if [ -z "$TASK_ID" ]; then
    sleep 3
    TASK_ID=$(curl -s "${AUTH[@]}" "${API}/agents/deployments/${DEPLOYMENT}/tasks" \
      | jqget "next((t['id'] for t in (d.get('tasks') or d.get('data') or [])), '')")
  fi
fi
echo "TASK_ID=${TASK_ID}"
[ -z "$TASK_ID" ] && { echo "Could not determine TASK_ID — inspect the JSON above."; exit 1; }

echo "== 3. poll until running, find the endpoint =="
ENDPOINT=""
for i in $(seq 1 60); do
  T=$(curl -s "${AUTH[@]}" "${API}/agents/tasks/${TASK_ID}")
  ST=$(echo "$T" | jqget "d.get('status','?')")
  # try the common endpoint field names
  ENDPOINT=$(echo "$T" | jqget "d.get('endpoint') or d.get('url') or d.get('public_url') or d.get('access_url') or d.get('ingress_url') or d.get('route') or (d.get('networking') or {}).get('url') or ''")
  echo "  ${i}: status=${ST}  endpoint=${ENDPOINT:-<none yet>}"
  if [ "$ST" = "running" ] && [ -n "$ENDPOINT" ]; then break; fi
  if [ "$ST" = "failed" ]; then echo "Task FAILED — full JSON:"; echo "$T" | python3 -m json.tool; exit 1; fi
  sleep 3
done
if [ -z "$ENDPOINT" ]; then
  echo "Running but no endpoint field matched. Full task JSON so we can spot it:"
  curl -s "${AUTH[@]}" "${API}/agents/tasks/${TASK_ID}" | python3 -m json.tool
  exit 1
fi
BASE="${ENDPOINT%/}"
echo "ENDPOINT=${BASE}"

echo "== 4. verify the live pipeline =="
echo "-- health:"; curl -s "${BASE}/health"; echo
echo "-- UI:"; curl -s "${BASE}/" | grep -o '<title>[^<]*</title>' || true
echo "-- submit a real job (neglect scenario):"
JOB=$(curl -s -X POST "${BASE}/run" "${JSON[@]}" \
  -d '{"dictation":"met w/ Marcus 3rd grade, mom not picking up, no food since tues, kid scared to go home, 30 min"}' \
  | jqget "d.get('job_id','')")
echo "   job_id=${JOB}"
for i in $(seq 1 60); do
  S=$(curl -s "${BASE}/jobs/${JOB}")
  ST=$(echo "$S" | jqget "d.get('status','?')")
  echo "   ${i}: ${ST}"
  if [ "$ST" = completed ] || [ "$ST" = failed ]; then
    echo "$S" | python3 -c "
import sys,json; d=json.load(sys.stdin); r=d.get('result') or {}
print('--- LIVE RUN RESULT ---')
print('status   :', d.get('status'))
print('reporter :', (r.get('reporter_flag') or {}).get('category'))
print('medicaid :', (r.get('medicaid') or {}).get('cpt_code'), (r.get('medicaid') or {}).get('estimated_reimbursement_usd'))
print('models_used:')
for m in (r.get('models_used') or []):
    print('   ', m.get('step'), '->', m.get('model'), '| in', m.get('input_tokens'), 'out', m.get('output_tokens'), '|', m.get('latency_ms'),'ms')
"
    break
  fi
  sleep 2
done
echo
echo "NOTE: when done, terminate the task to stop billing:"
echo "  curl -X DELETE '${API}/agents/tasks/${TASK_ID}' -H \"Authorization: Bearer \$GMI_TOKEN\""
