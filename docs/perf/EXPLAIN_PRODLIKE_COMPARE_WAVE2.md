# AtlasPM DB EXPLAIN Before/After Comparison

- GeneratedAtUTC: 2026-02-27T12:04:41Z
- Before report: `docs/perf/EXPLAIN_PRODLIKE_BASELINE.md`
- After report: `docs/perf/EXPLAIN_PRODLIKE_AFTER_INDEXES.md`

> Positive delta means slower after index changes; negative delta means faster.

| Query | Before (ms) | After (ms) | Delta (ms) | Delta (%) |
| --- | ---: | ---: | ---: | ---: |
| Q1 (List view (project tasks, default manual order)) | 0.690 | 0.683 | -0.007 | -1.0% |
| Q2 (Filtered list (status + assignee + dueAt)) | 3.409 | 3.500 | 0.091 | 2.7% |
| Q3 (Recently updated tasks in project) | 7.598 | 0.099 | -7.499 | -98.7% |
| Q4 (Audit timeline for latest task) | 9.336 | 9.802 | 0.466 | 5.0% |
| Q5 (Inbox unread list) | 3.872 | 3.916 | 0.044 | 1.1% |

## Plan Changes

### Q1 - List view (project tasks, default manual order)

- Before: `Index Scan using "Task_projectId_sectionId_position_idx" on "Task" t  (cost=0.41..8051.73 rows=53962 width=34) (actual time=0.060..0.636 rows=500 loops=1)`
- After: `Index Scan using "Task_active_project_section_position_idx" on "Task" t  (cost=0.41..6384.99 rows=54076 width=34) (actual time=0.048..0.622 rows=500 loops=1)`

### Q2 - Filtered list (status + assignee + dueAt)

- Before: `Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..9.66 rows=73 width=0) (actual time=0.248..0.248 rows=2197 loops=1)`
- After: `Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..9.51 rows=73 width=0) (actual time=0.223..0.223 rows=2197 loops=1)`

### Q3 - Recently updated tasks in project

- Before: `n/a`
- After: `Index Scan using "Task_active_project_updatedAt_desc_idx" on "Task" t  (cost=0.29..5324.87 rows=54076 width=23) (actual time=0.037..0.073 rows=200 loops=1)`

### Q4 - Audit timeline for latest task

- Before: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=9.223..9.290 rows=500 loops=1)`
- After: `Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=9.698..9.760 rows=500 loops=1)`

### Q5 - Inbox unread list

- Before: `n/a`
- After: `n/a`

## Notes

- This comparison is generated from local development data.
- For production decision-making, rerun on representative dataset snapshots.
