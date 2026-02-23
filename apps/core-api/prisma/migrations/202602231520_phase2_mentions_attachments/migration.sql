ALTER TABLE "Task"
  ALTER COLUMN "description_version" SET DEFAULT 0;

CREATE TABLE "task_mentions" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "mentioned_user_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_mentions_task_id_source_type_source_id_idx"
  ON "task_mentions"("task_id", "source_type", "source_id");

CREATE UNIQUE INDEX "task_mentions_task_id_mentioned_user_id_source_type_source_id_key"
  ON "task_mentions"("task_id", "mentioned_user_id", "source_type", "source_id");

ALTER TABLE "task_mentions"
  ADD CONSTRAINT "task_mentions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "task_attachments" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "uploader_user_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "upload_token" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_attachments_task_id_created_at_idx"
  ON "task_attachments"("task_id", "created_at");

ALTER TABLE "task_attachments"
  ADD CONSTRAINT "task_attachments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
