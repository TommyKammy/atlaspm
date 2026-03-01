-- Migration: Add TaskProjectLink table for multi-home support
-- Issue: #87

-- Create task_project_links table
CREATE TABLE IF NOT EXISTS "task_project_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    
    CONSTRAINT "task_project_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_project_links_task_id_project_id_key" UNIQUE ("task_id", "project_id"),
    CONSTRAINT "task_project_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_project_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "task_project_links_task_id_idx" ON "task_project_links"("task_id");
CREATE INDEX IF NOT EXISTS "task_project_links_project_id_idx" ON "task_project_links"("project_id");
CREATE INDEX IF NOT EXISTS "task_project_links_project_id_deleted_at_idx" ON "task_project_links"("project_id", "deleted_at");

-- Migrate existing data: Create links from existing task.projectId
INSERT INTO "task_project_links" ("id", "task_id", "project_id", "is_primary", "created_at", "updated_at")
SELECT 
    gen_random_uuid(),
    "id" as "task_id",
    "projectId" as "project_id",
    true as "is_primary",  -- Mark as primary for backward compatibility
    "createdAt" as "created_at",
    CURRENT_TIMESTAMP as "updated_at"
FROM "Task"
WHERE "deletedAt" IS NULL;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updated_at" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_task_project_links_updated_at ON "task_project_links";
CREATE TRIGGER update_task_project_links_updated_at
    BEFORE UPDATE ON "task_project_links"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
