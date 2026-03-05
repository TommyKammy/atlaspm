-- P5-4: baseline schedule fields for gantt comparison
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "baselineStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "baselineDueAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Task_projectId_deleted_at_baselineStartAt_idx"
  ON "Task"("projectId", deleted_at, "baselineStartAt");

CREATE INDEX IF NOT EXISTS "Task_projectId_deleted_at_baselineDueAt_idx"
  ON "Task"("projectId", deleted_at, "baselineDueAt");
