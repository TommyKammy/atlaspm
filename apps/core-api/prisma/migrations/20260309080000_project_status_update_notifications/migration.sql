ALTER TABLE "inbox_notifications"
  ALTER COLUMN "task_id" DROP NOT NULL;

ALTER TABLE "inbox_notifications"
  ADD COLUMN "status_update_id" TEXT;

UPDATE "inbox_notifications"
SET "source_id" = "task_id"
WHERE "source_type" = 'description' AND "source_id" = '';

CREATE INDEX "inbox_notifications_project_id_status_update_id_idx"
  ON "inbox_notifications"("project_id", "status_update_id");

DROP INDEX IF EXISTS "inbox_notifications_user_id_task_id_type_source_type_source_key";
DROP INDEX IF EXISTS "inbox_notifications_user_id_task_id_type_source_type_source_id_key";

CREATE UNIQUE INDEX "inbox_notifications_user_id_project_id_type_source_type_source_key"
  ON "inbox_notifications"("user_id", "project_id", "type", "source_type", "source_id");

ALTER TABLE "inbox_notifications"
  ADD CONSTRAINT "inbox_notifications_status_update_id_fkey"
  FOREIGN KEY ("status_update_id") REFERENCES "project_status_updates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
