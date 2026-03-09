#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-atlaspm_perf_wave2}"
PERF_USER_COUNT="${PERF_USER_COUNT:-500}"
PERF_TASK_COUNT="${PERF_TASK_COUNT:-60000}"
PERF_NOTIFICATION_COUNT="${PERF_NOTIFICATION_COUNT:-20000}"
PERF_AUDIT_COUNT="${PERF_AUDIT_COUNT:-5000}"
KEEP_DB="${KEEP_DB:-false}"

BASELINE_REPORT="${BASELINE_REPORT:-docs/perf/EXPLAIN_PRODLIKE_BASELINE.md}"
AFTER_REPORT="${AFTER_REPORT:-docs/perf/EXPLAIN_PRODLIKE_AFTER_INDEXES.md}"
COMPARE_REPORT="${COMPARE_REPORT:-docs/perf/EXPLAIN_PRODLIKE_COMPARE_WAVE2.md}"

if ! docker ps --format '{{.Names}}' | grep -q '^atlaspm-postgres$'; then
  echo "atlaspm-postgres container is not running."
  echo "Run: pnpm e2e:up"
  exit 1
fi

db_admin_psql() {
  docker exec -i atlaspm-postgres psql -U atlaspm -d postgres -X -v ON_ERROR_STOP=1 "$@"
}

db_psql() {
  docker exec -i atlaspm-postgres psql -U atlaspm -d "$DB_NAME" -X -v ON_ERROR_STOP=1 "$@"
}

echo "==> Resetting benchmark database: $DB_NAME"
db_admin_psql <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';
DROP DATABASE IF EXISTS "$DB_NAME";
CREATE DATABASE "$DB_NAME";
SQL

DB_URL="postgresql://atlaspm:atlaspm@localhost:55432/$DB_NAME?schema=public"
echo "==> Applying prisma migrations to $DB_NAME"
DATABASE_URL="$DB_URL" pnpm --filter @atlaspm/core-api prisma:migrate

echo "==> Seeding production-like benchmark data (users=$PERF_USER_COUNT tasks=$PERF_TASK_COUNT)"
db_psql -v user_count="$PERF_USER_COUNT" -v task_count="$PERF_TASK_COUNT" -v notification_count="$PERF_NOTIFICATION_COUNT" -v audit_count="$PERF_AUDIT_COUNT" <<'SQL'
INSERT INTO "Workspace" (id, name, "createdAt", "updatedAt")
VALUES ('perf-workspace-main', 'Perf Workspace', now() - interval '30 days', now());

INSERT INTO "User" (id, email, "displayName", status, "createdAt", "updatedAt")
SELECT
  format('perf-user-%s', gs),
  format('perf-user-%s@example.com', gs),
  format('Perf User %s', gs),
  CASE WHEN gs % 70 = 0 THEN 'SUSPENDED'::"UserStatus" ELSE 'ACTIVE'::"UserStatus" END,
  now() - interval '30 days' + (gs || ' minutes')::interval,
  now()
FROM generate_series(1, :user_count) gs;

INSERT INTO "User" (id, email, "displayName", status, "createdAt", "updatedAt")
VALUES ('perf-user-latest', 'perf-user-latest@example.com', 'Perf Latest User', 'ACTIVE'::"UserStatus", now() + interval '1 minute', now());

INSERT INTO "WorkspaceMembership" (id, "workspaceId", "userId", role, "createdAt")
SELECT
  format('perf-wm-%s', gs),
  'perf-workspace-main',
  format('perf-user-%s', gs),
  CASE WHEN gs = 1 THEN 'WS_ADMIN'::"WorkspaceRole" ELSE 'WS_MEMBER'::"WorkspaceRole" END,
  now() - interval '20 days'
FROM generate_series(1, :user_count) gs;

INSERT INTO "WorkspaceMembership" (id, "workspaceId", "userId", role, "createdAt")
VALUES ('perf-wm-latest', 'perf-workspace-main', 'perf-user-latest', 'WS_MEMBER'::"WorkspaceRole", now());

INSERT INTO "Project" (id, "workspaceId", name, "createdAt", "updatedAt")
SELECT
  format('perf-project-%s', gs),
  'perf-workspace-main',
  format('Perf Legacy Project %s', gs),
  now() - interval '20 days' + (gs || ' minutes')::interval,
  now()
FROM generate_series(1, 80) gs;

INSERT INTO "Project" (id, "workspaceId", name, "createdAt", "updatedAt")
VALUES ('perf-project-main', 'perf-workspace-main', 'Perf Main Project', now() + interval '2 minutes', now());

INSERT INTO "ProjectMembership" (id, "projectId", "userId", role, "createdAt")
SELECT
  format('perf-pm-%s', gs),
  'perf-project-main',
  format('perf-user-%s', gs),
  CASE WHEN gs % 15 = 0 THEN 'ADMIN'::"ProjectRole" ELSE 'MEMBER'::"ProjectRole" END,
  now() - interval '10 days'
FROM generate_series(1, LEAST(:user_count, 300)) gs;

INSERT INTO "ProjectMembership" (id, "projectId", "userId", role, "createdAt")
VALUES ('perf-pm-latest', 'perf-project-main', 'perf-user-latest', 'MEMBER'::"ProjectRole", now());

INSERT INTO "Section" (id, "projectId", name, position, "isDefault", "createdAt", "updatedAt")
SELECT
  format('perf-section-%s', gs),
  'perf-project-main',
  format('Section %s', gs),
  gs * 1000,
  gs = 1,
  now(),
  now()
FROM generate_series(1, 40) gs;

INSERT INTO "Task" (
  id,
  "projectId",
  "sectionId",
  title,
  status,
  "progressPercent",
  priority,
  "assigneeUserId",
  "startAt",
  "dueAt",
  tags,
  "completedAt",
  deleted_at,
  "deleted_by_user_id",
  position,
  version,
  "createdAt",
  "updatedAt"
)
SELECT
  format('perf-task-%s', gs),
  'perf-project-main',
  format('perf-section-%s', ((gs - 1) % 40) + 1),
  format('Perf task %s', gs),
  CASE
    WHEN gs % 9 = 0 THEN 'BLOCKED'
    WHEN gs % 4 = 0 THEN 'DONE'
    WHEN gs % 3 = 0 THEN 'IN_PROGRESS'
    ELSE 'TODO'
  END::"TaskStatus",
  CASE
    WHEN gs % 4 = 0 THEN 100
    WHEN gs % 3 = 0 THEN 55
    WHEN gs % 9 = 0 THEN 15
    ELSE 0
  END,
  CASE
    WHEN gs % 11 = 0 THEN 'URGENT'
    WHEN gs % 7 = 0 THEN 'HIGH'
    WHEN gs % 5 = 0 THEN 'LOW'
    ELSE 'MEDIUM'
  END::"Priority",
  CASE
    WHEN gs % 17 = 0 THEN 'perf-user-latest'
    WHEN gs % 5 = 0 THEN NULL
    ELSE format('perf-user-%s', ((gs - 1) % :user_count) + 1)
  END,
  now() - ((gs % 25) || ' days')::interval,
  CASE
    WHEN gs % 8 = 0 THEN NULL
    ELSE now() + (((gs % 180) - 90) || ' days')::interval
  END,
  ARRAY[format('tag-%s', gs % 20), format('team-%s', gs % 8)],
  CASE WHEN gs % 4 = 0 THEN now() - ((gs % 12) || ' hours')::interval ELSE NULL END,
  CASE WHEN gs % 10 = 0 THEN now() - interval '1 day' ELSE NULL END,
  CASE WHEN gs % 10 = 0 THEN 'perf-user-1' ELSE NULL END,
  (((gs - 1) / 40) + 1) * 1000,
  1,
  now() - ((:task_count - gs) || ' seconds')::interval,
  now() - ((gs % 15000) || ' seconds')::interval
FROM generate_series(1, :task_count) gs;

INSERT INTO "AuditEvent" (id, actor, "entityType", "entityId", action, "beforeJson", "afterJson", "correlationId", "createdAt")
SELECT
  format('perf-audit-%s', gs),
  'perf-user-1',
  'Task',
  format('perf-task-%s', :task_count),
  CASE WHEN gs % 2 = 0 THEN 'task.updated' ELSE 'task.description.updated' END,
  NULL,
  jsonb_build_object('seq', gs),
  format('perf-audit-corr-%s', gs),
  now() - ((:audit_count - gs) || ' seconds')::interval
FROM generate_series(1, :audit_count) gs;

INSERT INTO inbox_notifications (
  id,
  user_id,
  project_id,
  task_id,
  type,
  source_type,
  source_id,
  triggered_by_user_id,
  read_at,
  created_at,
  updated_at
)
SELECT
  format('perf-note-%s', gs),
  'perf-user-latest',
  'perf-project-main',
  format('perf-task-%s', ((gs - 1) % :task_count) + 1),
  CASE WHEN gs % 3 = 0 THEN 'task.mention' ELSE 'task.reminder' END,
  'benchmark',
  format('perf-source-%s', gs),
  'perf-user-1',
  CASE WHEN gs % 4 = 0 THEN now() - ((gs % 200) || ' minutes')::interval ELSE NULL END,
  now() - ((:notification_count - gs) || ' seconds')::interval,
  now()
FROM generate_series(1, :notification_count) gs;
SQL

echo "==> Running ANALYZE on benchmark tables"
db_psql <<'SQL'
ANALYZE "Task";
ANALYZE "Project";
ANALYZE "User";
ANALYZE "AuditEvent";
ANALYZE inbox_notifications;
SQL

echo "==> Dropping wave2 partial indexes for baseline capture"
db_psql <<'SQL'
DROP INDEX IF EXISTS "Task_active_project_section_position_idx";
DROP INDEX IF EXISTS "Task_active_project_dueAt_idx";
DROP INDEX IF EXISTS "Task_active_project_status_assignee_dueAt_idx";
DROP INDEX IF EXISTS "Task_active_project_updatedAt_desc_idx";
DROP INDEX IF EXISTS "inbox_notifications_user_id_unread_created_at_desc_idx";
SQL

PSQL_DATABASE="$DB_NAME" REPORT_TITLE="AtlasPM DB EXPLAIN Prodlike Baseline (Wave1 only)" \
  ./scripts/db-explain-baseline.sh "$BASELINE_REPORT"

echo "==> Recreating wave2 partial indexes"
db_psql <<'SQL'
CREATE INDEX IF NOT EXISTS "Task_active_project_section_position_idx"
  ON "Task"("projectId", "sectionId", "position")
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "Task_active_project_status_assignee_dueAt_idx"
  ON "Task"("projectId", "status", "assigneeUserId", "dueAt")
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "Task_active_project_updatedAt_desc_idx"
  ON "Task"("projectId", "updatedAt" DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "inbox_notifications_user_id_unread_created_at_desc_idx"
  ON "inbox_notifications"("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
SQL

echo "==> Re-analyzing after index recreation"
db_psql <<'SQL'
ANALYZE "Task";
ANALYZE inbox_notifications;
SQL

PSQL_DATABASE="$DB_NAME" REPORT_TITLE="AtlasPM DB EXPLAIN Prodlike After Indexes (Wave2)" \
  ./scripts/db-explain-baseline.sh "$AFTER_REPORT"

./scripts/db-explain-compare.sh "$BASELINE_REPORT" "$AFTER_REPORT" "$COMPARE_REPORT"

echo "==> Comparison summary"
sed -n '1,120p' "$COMPARE_REPORT"

if [[ "$KEEP_DB" != "true" ]]; then
  echo "==> Cleaning benchmark database: $DB_NAME"
  db_admin_psql <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';
DROP DATABASE IF EXISTS "$DB_NAME";
SQL
else
  echo "==> Keeping benchmark database for inspection: $DB_NAME"
fi
