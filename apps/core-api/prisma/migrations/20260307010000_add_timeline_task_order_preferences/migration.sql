ALTER TABLE "ProjectTimelinePreference"
  ADD COLUMN "taskOrderBySection" JSONB,
  ADD COLUMN "taskOrderByAssignee" JSONB,
  ADD COLUMN "taskOrderByStatus" JSONB;
