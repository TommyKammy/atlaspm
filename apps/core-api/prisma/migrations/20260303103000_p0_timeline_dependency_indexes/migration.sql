-- P0-3: timeline/dependency access-path indexes
CREATE INDEX IF NOT EXISTS "Task_projectId_deleted_at_startAt_idx"
  ON "Task"("projectId", deleted_at, "startAt");

CREATE INDEX IF NOT EXISTS "TaskDependency_taskId_createdAt_idx"
  ON "TaskDependency"("taskId", "createdAt");

CREATE INDEX IF NOT EXISTS "TaskDependency_dependsOnId_createdAt_idx"
  ON "TaskDependency"("dependsOnId", "createdAt");
