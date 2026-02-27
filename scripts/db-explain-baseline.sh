#!/usr/bin/env bash
set -euo pipefail

has_local_psql() {
  command -v psql >/dev/null 2>&1
}

has_postgres_container() {
  docker ps --format '{{.Names}}' | grep -q '^atlaspm-postgres$'
}

run_psql() {
  if has_local_psql; then
    if [[ -z "${DATABASE_URL:-}" ]]; then
      echo "DATABASE_URL is required when using local psql"
      echo "Example: DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm ./scripts/db-explain-baseline.sh"
      exit 1
    fi
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
    return
  fi

  if has_postgres_container; then
    docker exec -i atlaspm-postgres psql -U atlaspm -d atlaspm -X -v ON_ERROR_STOP=1
    return
  fi

  echo "No psql client available."
  echo "Install psql locally, or start docker compose DB (container: atlaspm-postgres)."
  exit 1
}

REPORT_PATH="${1:-docs/perf/EXPLAIN_BASELINE.md}"
mkdir -p "$(dirname "$REPORT_PATH")"

{
  echo "# AtlasPM DB EXPLAIN Baseline"
  echo
  echo "- GeneratedAtUTC: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if has_local_psql; then
    echo "- Mode: local psql (DATABASE_URL)"
  else
    echo "- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)"
  fi
  echo "- Command: \`./scripts/db-explain-baseline.sh\`"
  echo
  echo "> This report is generated from the current local dataset and is intended for before/after index comparison."
  echo
  echo '```text'
  run_psql <<'SQL'
\pset pager off
\timing on

\echo '--- Q1: List view (project tasks, default manual order) ---'
EXPLAIN (ANALYZE, BUFFERS)
WITH p AS (
  SELECT id FROM "Project" ORDER BY "createdAt" DESC LIMIT 1
)
SELECT t.id, t."sectionId", t.position
FROM "Task" t
WHERE t."projectId" = (SELECT id FROM p)
  AND t.deleted_at IS NULL
ORDER BY t."sectionId" ASC, t.position ASC
LIMIT 500;

\echo '--- Q2: Filtered list (status + assignee + dueAt) ---'
EXPLAIN (ANALYZE, BUFFERS)
WITH p AS (
  SELECT id FROM "Project" ORDER BY "createdAt" DESC LIMIT 1
),
u AS (
  SELECT id FROM "User" ORDER BY "createdAt" DESC LIMIT 1
)
SELECT t.id, t.status, t."assigneeUserId", t."dueAt"
FROM "Task" t
WHERE t."projectId" = (SELECT id FROM p)
  AND t.deleted_at IS NULL
  AND t.status IN ('TODO', 'IN_PROGRESS')
  AND (t."assigneeUserId" = (SELECT id FROM u) OR t."assigneeUserId" IS NULL)
  AND (t."dueAt" IS NULL OR t."dueAt" >= now() - interval '30 days')
ORDER BY t."dueAt" ASC NULLS LAST
LIMIT 500;

\echo '--- Q3: Recently updated tasks in project ---'
EXPLAIN (ANALYZE, BUFFERS)
WITH p AS (
  SELECT id FROM "Project" ORDER BY "createdAt" DESC LIMIT 1
)
SELECT t.id, t."updatedAt"
FROM "Task" t
WHERE t."projectId" = (SELECT id FROM p)
  AND t.deleted_at IS NULL
ORDER BY t."updatedAt" DESC
LIMIT 200;

\echo '--- Q4: Audit timeline for latest task ---'
EXPLAIN (ANALYZE, BUFFERS)
WITH target_task AS (
  SELECT id FROM "Task" ORDER BY "createdAt" DESC LIMIT 1
)
SELECT ae.id, ae.action, ae."createdAt"
FROM "AuditEvent" ae
WHERE ae."entityType" = 'Task'
  AND ae."entityId" = (SELECT id FROM target_task)
ORDER BY ae."createdAt" DESC
LIMIT 500;

\echo '--- Q5: Inbox unread list ---'
EXPLAIN (ANALYZE, BUFFERS)
WITH u AS (
  SELECT id FROM "User" ORDER BY "createdAt" DESC LIMIT 1
)
SELECT n.id, n.type, n.created_at AS "createdAt"
FROM inbox_notifications n
WHERE n.user_id = (SELECT id FROM u)
  AND n.read_at IS NULL
ORDER BY n.created_at DESC
LIMIT 200;
SQL
  echo '```'
} > "$REPORT_PATH"

echo "Wrote EXPLAIN baseline report: $REPORT_PATH"
