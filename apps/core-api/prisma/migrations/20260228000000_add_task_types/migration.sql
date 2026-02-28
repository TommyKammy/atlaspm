-- Create TaskType enum
CREATE TYPE "TaskType" AS ENUM ('TASK', 'MILESTONE', 'APPROVAL');

ALTER TABLE "Task" ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'TASK';

CREATE INDEX "Task_projectId_deletedAt_type_idx" ON "Task"("projectId", "deleted_at", "type");
