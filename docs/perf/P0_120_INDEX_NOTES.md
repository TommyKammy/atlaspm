# P0-3 Index Rationale (Issue #120)

## Scope

This patch adds indexes for timeline/date-window and dependency-panel access paths:

- `Task_projectId_deleted_at_startAt_idx`
  - query path: project task timeline window on `startAt`
  - predicate pattern: `projectId = ? AND deleted_at IS NULL AND startAt BETWEEN ...`
- `TaskDependency_taskId_createdAt_idx`
  - query path: task dependency panel (`/tasks/:id/dependencies`) ordered by newest first
- `TaskDependency_dependsOnId_createdAt_idx`
  - query path: reverse dependency panel (`/tasks/:id/dependents`) ordered by newest first

## Evidence

EXPLAIN output is captured in:

- `docs/perf/EXPLAIN_P0_120_BASELINE.md`

Representative plan snippets:

- Q6 uses `Index Scan using "Task_projectId_deleted_at_startAt_idx"`
- Q7 uses `Index Scan Backward using "TaskDependency_taskId_createdAt_idx"`

## Rollback SQL

```sql
DROP INDEX IF EXISTS "Task_projectId_deleted_at_startAt_idx";
DROP INDEX IF EXISTS "TaskDependency_taskId_createdAt_idx";
DROP INDEX IF EXISTS "TaskDependency_dependsOnId_createdAt_idx";
```
