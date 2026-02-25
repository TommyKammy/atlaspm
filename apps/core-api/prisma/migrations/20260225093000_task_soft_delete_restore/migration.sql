ALTER TABLE "Task"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_user_id" TEXT;

CREATE INDEX "Task_projectId_deleted_at_idx" ON "Task"("projectId", "deleted_at");
