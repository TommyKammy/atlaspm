# AtlasPM DB EXPLAIN Before/After Comparison

- GeneratedAtUTC: 2026-02-27T11:27:29Z
- Before report: `docs/perf/EXPLAIN_BASELINE.md`
- After report: `docs/perf/EXPLAIN_AFTER_INDEXES.md`

> Positive delta means slower after index changes; negative delta means faster.

| Query | Before (ms) | After (ms) | Delta (ms) | Delta (%) |
| --- | ---: | ---: | ---: | ---: |
| Q1 (List view (project tasks, default manual order)) | 0.329 | 0.395 | 0.066 | 20.1% |
| Q2 (Filtered list (status + assignee + dueAt)) | 0.497 | 0.599 | 0.102 | 20.5% |
| Q3 (Recently updated tasks in project) | 0.371 | 0.249 | -0.122 | -32.9% |
| Q4 (Audit timeline for latest task) | 0.902 | 0.803 | -0.099 | -11.0% |
| Q5 (Inbox unread list) | 0.261 | 0.283 | 0.022 | 8.4% |

## Plan Changes

### Q1 - List view (project tasks, default manual order)

- Before: `Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.268..0.268 rows=1 loops=1)`
- After: `Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.318..0.318 rows=1 loops=1)`

### Q2 - Filtered list (status + assignee + dueAt)

- Before: `Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.212..0.212 rows=1 loops=1)`
- After: `Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.255..0.255 rows=1 loops=1)`

### Q3 - Recently updated tasks in project

- Before: `Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.338..0.338 rows=1 loops=1)`
- After: `Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.228..0.228 rows=1 loops=1)`

### Q4 - Audit timeline for latest task

- Before: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=0.880..0.880 rows=1 loops=1)`
- After: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=0.790..0.790 rows=1 loops=1)`

### Q5 - Inbox unread list

- Before: `Index Scan using inbox_notifications_user_id_read_at_created_at_idx on inbox_notifications n  (cost=0.27..8.29 rows=1 width=53) (actual time=0.244..0.244 rows=0 loops=1)`
- After: `Index Scan using inbox_notifications_user_id_read_at_created_at_idx on inbox_notifications n  (cost=0.27..8.29 rows=1 width=53) (actual time=0.265..0.265 rows=0 loops=1)`

## Notes

- This comparison is generated from local development data.
- For production decision-making, rerun on representative dataset snapshots.
