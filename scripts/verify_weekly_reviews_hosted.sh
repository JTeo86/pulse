#!/usr/bin/env bash
set -euo pipefail

# Verifies hosted weekly review automation runtime wiring.
# Required env:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
# Optional env:
#   SUPABASE_DB_URL (for migration/cron SQL checks)
#   VENUE_ID (for direct function call validation)

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_URL is required." >&2
  exit 2
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is required." >&2
  exit 2
fi

invoke_fn() {
  local fn_name="$1"
  local payload="${2:-{}}"

  local http_code
  local body
  body="$(mktemp)"
  http_code=$(curl -sS -o "$body" -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/functions/v1/${fn_name}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    --data "$payload" || true)

  echo "--- ${fn_name} -> HTTP ${http_code}"
  sed -n '1,20p' "$body"
  rm -f "$body"
}

echo "[1/4] Checking scheduler entry function is deployed/callable (hourly trigger, Monday 08:00-18:00 local catch-up window)"
invoke_fn "run-weekly-reviews-schedule" "{}"

echo
echo "[2/4] Checking dependent review functions are deployed/callable"
if [[ -n "${VENUE_ID:-}" ]]; then
  invoke_fn "ingest-reviews" "{\"venue_id\":\"${VENUE_ID}\"}"
  invoke_fn "generate-weekly-review-report" "{\"venue_id\":\"${VENUE_ID}\",\"week_start\":\"$(date -u -d '14 days ago' +%F)\",\"week_end\":\"$(date -u -d '8 days ago' +%F)\"}"
  invoke_fn "generate-review-response-tasks" "{\"venue_id\":\"${VENUE_ID}\",\"week_start\":\"$(date -u -d '14 days ago' +%F)\",\"week_end\":\"$(date -u -d '8 days ago' +%F)\"}"
else
  echo "SKIP: Set VENUE_ID to validate ingest/report/triage end-to-end."
fi

echo
echo "[3/4] Checking migration + cron wiring (if SUPABASE_DB_URL is available)"
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='review_automation_runs' and column_name='scheduled_for';"

  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\
    select jobname, schedule, active
    from cron.job
    where jobname='run-weekly-reviews-schedule-hourly';"
else
  echo "SKIP: SUPABASE_DB_URL not set; cannot verify migration/cron from SQL."
fi

echo
echo "[4/4] Stale deployment checks"
echo "If any function returned 404, the hosted function is missing."
echo "If auth/validation errors are returned (401/400), the function is present and running current auth/path logic."
echo "Run records now use success/partial/failed semantics; verify failures do not block retries for the same week."
