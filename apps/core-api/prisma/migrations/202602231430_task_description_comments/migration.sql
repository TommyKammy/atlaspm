ALTER TABLE "Task"
  ADD COLUMN "description_doc" JSONB,
  ADD COLUMN "description_text" TEXT,
  ADD COLUMN "description_updated_at" TIMESTAMP(3),
  ADD COLUMN "description_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
