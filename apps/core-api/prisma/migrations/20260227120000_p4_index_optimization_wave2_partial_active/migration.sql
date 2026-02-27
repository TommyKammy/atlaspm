-- P4-3 wave2: active-task focused partial indexes for large datasets
CREATE INDEX IF NOT EXISTS "Task_active_project_section_position_idx"
  ON "Task"("projectId", "sectionId", "position")
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "Task_active_project_dueAt_idx"
  ON "Task"("projectId", "dueAt")
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "Task_active_project_status_assignee_dueAt_idx"
  ON "Task"("projectId", "status", "assigneeUserId", "dueAt")
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS "Task_active_project_updatedAt_desc_idx"
  ON "Task"("projectId", "updatedAt" DESC)
  WHERE deleted_at IS NULL;
