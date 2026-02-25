CREATE TABLE "inbox_notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL DEFAULT '',
  "triggered_by_user_id" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inbox_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inbox_notifications_user_id_read_at_created_at_idx"
  ON "inbox_notifications"("user_id", "read_at", "created_at");

CREATE INDEX "inbox_notifications_project_id_task_id_idx"
  ON "inbox_notifications"("project_id", "task_id");

CREATE UNIQUE INDEX "inbox_notifications_user_id_task_id_type_source_type_source_id_key"
  ON "inbox_notifications"("user_id", "task_id", "type", "source_type", "source_id");

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_triggered_by_user_id_fkey"
  FOREIGN KEY ("triggered_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
