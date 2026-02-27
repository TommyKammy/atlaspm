-- P4-3 wave2 tuning: remove dueAt-only partial index
-- Reason: on production-like datasets this index can attract a suboptimal plan
-- for filtered list query (status + assignee + due range), regressing Q2 latency.
DROP INDEX IF EXISTS "Task_active_project_dueAt_idx";
