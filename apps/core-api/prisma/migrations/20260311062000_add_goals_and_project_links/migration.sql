CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETED');

CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goal_project_links" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "goal_project_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goal_project_links_goal_id_project_id_key" ON "goal_project_links"("goal_id", "project_id");
CREATE INDEX "goals_workspace_id_archived_at_created_at_idx" ON "goals"("workspace_id", "archived_at", "created_at");
CREATE INDEX "goals_owner_user_id_archived_at_idx" ON "goals"("owner_user_id", "archived_at");
CREATE INDEX "goal_project_links_goal_id_deleted_at_created_at_idx" ON "goal_project_links"("goal_id", "deleted_at", "created_at");
CREATE INDEX "goal_project_links_project_id_deleted_at_idx" ON "goal_project_links"("project_id", "deleted_at");

ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goal_project_links" ADD CONSTRAINT "goal_project_links_goal_id_fkey"
FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goal_project_links" ADD CONSTRAINT "goal_project_links_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
