ALTER TABLE "Task" ADD COLUMN "estimate_minutes" INTEGER;
ALTER TABLE "Task" ADD COLUMN "spent_minutes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "task_time_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_time_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_time_logs_task_id_logged_at_idx" ON "task_time_logs"("task_id", "logged_at");
CREATE INDEX "task_time_logs_user_id_logged_at_idx" ON "task_time_logs"("user_id", "logged_at");

ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_task_id_fkey" 
    FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
