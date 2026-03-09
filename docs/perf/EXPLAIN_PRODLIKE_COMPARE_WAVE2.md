# AtlasPM DB EXPLAIN Before/After Comparison

- GeneratedAtUTC: 2026-03-09T02:05:26Z
- Before report: `docs/perf/EXPLAIN_PRODLIKE_BASELINE.md`
- After report: `docs/perf/EXPLAIN_PRODLIKE_AFTER_INDEXES.md`

> Positive delta means slower after index changes; negative delta means faster.

| Query | Before (ms) | After (ms) | Delta (ms) | Delta (%) |
| --- | ---: | ---: | ---: | ---: |
| Q1 (List view (project tasks, default manual order)) | 3.236 | 2.237 | -0.999 | -30.9% |
| Q2 (Filtered list (status + assignee + dueAt)) | 14.996 | 9.626 | -5.370 | -35.8% |
| Q3 (Recently updated tasks in project) | 27.002 | 0.241 | -26.761 | -99.1% |
| Q4 (Audit timeline for latest task) | 21.490 | 21.530 | 0.040 | 0.2% |
| Q5 (Inbox unread list) | 10.325 | 0.322 | -10.003 | -96.9% |
| Q6 (Timeline date-window (project + startAt range)) | 70.963 | 71.065 | 0.102 | 0.1% |
| Q7 (Dependency panel (task dependencies, newest first)) | 21.497 | 21.324 | -0.173 | -0.8% |

## Plan Changes

### Q1 - List view (project tasks, default manual order)

- Before: `Index Scan using "Task_projectId_sectionId_position_idx" on "Task" t  (cost=0.41..8169.66 rows=53904 width=34) (actual time=0.208..2.965 rows=500 loops=1)`
- After: `Index Scan using "Task_active_project_section_position_idx" on "Task" t  (cost=0.41..6496.37 rows=53958 width=34) (actual time=0.144..2.069 rows=500 loops=1)`

### Q2 - Filtered list (status + assignee + dueAt)

- Before: `Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..9.66 rows=73 width=0) (actual time=0.966..0.966 rows=2197 loops=1)`
- After: `Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..9.51 rows=73 width=0) (actual time=0.675..0.675 rows=2197 loops=1)`

### Q3 - Recently updated tasks in project

- Before: `n/a`
- After: `Index Scan using "Task_active_project_updatedAt_desc_idx" on "Task" t  (cost=0.29..5436.24 rows=53958 width=23) (actual time=0.086..0.175 rows=200 loops=1)`

### Q4 - Audit timeline for latest task

- Before: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=21.226..21.372 rows=500 loops=1)`
- After: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=21.278..21.423 rows=500 loops=1)`

### Q5 - Inbox unread list

- Before: `n/a`
- After: `Index Scan using inbox_notifications_user_id_unread_created_at_desc_idx on inbox_notifications n  (cost=0.29..1592.10 rows=15000 width=36) (actual time=0.193..0.254 rows=200 loops=1)`

### Q6 - Timeline date-window (project + startAt range)

- Before: `n/a`
- After: `n/a`

### Q7 - Dependency panel (task dependencies, newest first)

- Before: `Bitmap Index Scan on "TaskDependency_taskId_createdAt_idx"  (cost=0.00..4.17 rows=3 width=0) (actual time=21.361..21.361 rows=0 loops=1)`
- After: `Bitmap Index Scan on "TaskDependency_taskId_createdAt_idx"  (cost=0.00..4.17 rows=3 width=0) (actual time=21.194..21.194 rows=0 loops=1)`

## Notes

- This comparison is generated from local development data.
- For production decision-making, rerun on representative dataset snapshots.
