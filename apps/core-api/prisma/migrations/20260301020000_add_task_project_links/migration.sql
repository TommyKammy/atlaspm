CREATE TABLE "task_project_links" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "task_project_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_project_links_task_id_project_id_key"
  ON "task_project_links"("task_id", "project_id");
CREATE INDEX "task_project_links_task_id_idx"
  ON "task_project_links"("task_id");
CREATE INDEX "task_project_links_task_id_deleted_at_idx"
  ON "task_project_links"("task_id", "deleted_at");
CREATE INDEX "task_project_links_project_id_deleted_at_idx"
  ON "task_project_links"("project_id", "deleted_at");
CREATE INDEX "task_project_links_task_id_deleted_at_is_primary_idx"
  ON "task_project_links"("task_id", "deleted_at", "is_primary");

ALTER TABLE "task_project_links"
  ADD CONSTRAINT "task_project_links_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_project_links"
  ADD CONSTRAINT "task_project_links_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH source AS (
  SELECT
    t."id" AS task_id,
    t."projectId" AS project_id,
    md5(t."id" || ':' || t."projectId") AS h,
    t."createdAt" AS created_at
  FROM "Task" t
  WHERE t."deleted_at" IS NULL
)
INSERT INTO "task_project_links" (
  "id",
  "task_id",
  "project_id",
  "is_primary",
  "created_at",
  "updated_at"
)
SELECT
  substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' || substr(h, 17, 4) || '-' || substr(h, 21, 12),
  task_id,
  project_id,
  true,
  created_at,
  CURRENT_TIMESTAMP
FROM source
ON CONFLICT ("task_id", "project_id") DO NOTHING;
