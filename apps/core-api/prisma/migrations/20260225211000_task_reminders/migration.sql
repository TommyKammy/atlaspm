CREATE TABLE "task_reminders" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "remind_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_reminders_task_id_user_id_idx" ON "task_reminders"("task_id", "user_id");
CREATE UNIQUE INDEX "task_reminders_task_id_user_id_deleted_at_key" ON "task_reminders"("task_id", "user_id", "deleted_at");

ALTER TABLE "task_reminders"
  ADD CONSTRAINT "task_reminders_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_reminders"
  ADD CONSTRAINT "task_reminders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
