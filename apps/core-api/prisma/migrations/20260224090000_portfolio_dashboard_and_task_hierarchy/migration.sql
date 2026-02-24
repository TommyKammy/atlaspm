-- Task hierarchy and dependencies
CREATE TYPE "DependencyType" AS ENUM ('BLOCKS', 'BLOCKED_BY', 'RELATES_TO');

ALTER TABLE "Task"
  ADD COLUMN "parentId" TEXT;

CREATE TABLE "TaskDependency" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "dependsOnId" TEXT NOT NULL,
  "type" "DependencyType" NOT NULL DEFAULT 'BLOCKS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnId_key" ON "TaskDependency"("taskId", "dependsOnId");
CREATE INDEX "TaskDependency_taskId_idx" ON "TaskDependency"("taskId");
CREATE INDEX "TaskDependency_dependsOnId_idx" ON "TaskDependency"("dependsOnId");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskDependency"
  ADD CONSTRAINT "TaskDependency_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskDependency"
  ADD CONSTRAINT "TaskDependency_dependsOnId_fkey"
  FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Portfolio management
CREATE TABLE "portfolios" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portfolio_projects" (
  "portfolio_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  CONSTRAINT "portfolio_projects_pkey" PRIMARY KEY ("portfolio_id", "project_id")
);

CREATE INDEX "portfolios_workspace_id_idx" ON "portfolios"("workspace_id");
CREATE INDEX "portfolio_projects_portfolio_id_idx" ON "portfolio_projects"("portfolio_id");
CREATE INDEX "portfolio_projects_project_id_idx" ON "portfolio_projects"("project_id");

ALTER TABLE "portfolios"
  ADD CONSTRAINT "portfolios_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portfolio_projects"
  ADD CONSTRAINT "portfolio_projects_portfolio_id_fkey"
  FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portfolio_projects"
  ADD CONSTRAINT "portfolio_projects_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dashboard widgets
CREATE TYPE "WidgetType" AS ENUM (
  'TASK_COMPLETION',
  'PROGRESS_CHART',
  'TEAM_LOAD',
  'OVERDUE_ALERTS',
  'RECENT_ACTIVITY'
);

CREATE TABLE "dashboards" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "layout" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "widgets" (
  "id" TEXT NOT NULL,
  "dashboard_id" TEXT NOT NULL,
  "type" "WidgetType" NOT NULL,
  "config" JSONB NOT NULL,
  "position" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboards_user_id_idx" ON "dashboards"("user_id");
CREATE INDEX "widgets_dashboard_id_idx" ON "widgets"("dashboard_id");

ALTER TABLE "dashboards"
  ADD CONSTRAINT "dashboards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "widgets"
  ADD CONSTRAINT "widgets_dashboard_id_fkey"
  FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
