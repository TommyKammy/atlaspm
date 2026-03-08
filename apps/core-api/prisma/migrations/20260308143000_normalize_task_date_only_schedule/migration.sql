-- Normalize mixed task schedule timestamps to canonical date-only UTC midnight values.
UPDATE "Task"
SET "startAt" = date_trunc('day', "startAt")
WHERE "startAt" IS NOT NULL
  AND "startAt" <> date_trunc('day', "startAt");

UPDATE "Task"
SET "dueAt" = date_trunc('day', "dueAt")
WHERE "dueAt" IS NOT NULL
  AND "dueAt" <> date_trunc('day', "dueAt");

UPDATE "Task"
SET "baselineStartAt" = date_trunc('day', "baselineStartAt")
WHERE "baselineStartAt" IS NOT NULL
  AND "baselineStartAt" <> date_trunc('day', "baselineStartAt");

UPDATE "Task"
SET "baselineDueAt" = date_trunc('day', "baselineDueAt")
WHERE "baselineDueAt" IS NOT NULL
  AND "baselineDueAt" <> date_trunc('day', "baselineDueAt");
