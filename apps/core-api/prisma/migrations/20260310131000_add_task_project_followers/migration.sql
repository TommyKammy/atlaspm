CREATE TABLE "task_followers" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_followers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_followers" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_followers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_followers_task_id_user_id_key" ON "task_followers"("task_id", "user_id");
CREATE INDEX "task_followers_task_id_created_at_idx" ON "task_followers"("task_id", "created_at");
CREATE INDEX "task_followers_user_id_created_at_idx" ON "task_followers"("user_id", "created_at");

CREATE UNIQUE INDEX "project_followers_project_id_user_id_key" ON "project_followers"("project_id", "user_id");
CREATE INDEX "project_followers_project_id_created_at_idx" ON "project_followers"("project_id", "created_at");
CREATE INDEX "project_followers_user_id_created_at_idx" ON "project_followers"("user_id", "created_at");

ALTER TABLE "task_followers"
  ADD CONSTRAINT "task_followers_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_followers"
  ADD CONSTRAINT "task_followers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_followers"
  ADD CONSTRAINT "project_followers_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_followers"
  ADD CONSTRAINT "project_followers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
