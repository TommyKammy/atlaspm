CREATE TABLE "project_view_preferences" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_view_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_view_preferences_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_view_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "project_view_preferences_project_id_user_id_mode_key"
  ON "project_view_preferences"("project_id", "user_id", "mode");

CREATE INDEX "project_view_preferences_project_id_user_id_idx"
  ON "project_view_preferences"("project_id", "user_id");

CREATE INDEX "project_view_preferences_user_id_idx"
  ON "project_view_preferences"("user_id");

CREATE TABLE "project_saved_views" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_saved_views_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_saved_views_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_saved_views_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "project_saved_views_project_id_user_id_created_at_idx"
  ON "project_saved_views"("project_id", "user_id", "created_at");

CREATE INDEX "project_saved_views_user_id_idx"
  ON "project_saved_views"("user_id");
