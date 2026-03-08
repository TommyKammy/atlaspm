UPDATE "Task"
SET
  "startAt" = CASE
    WHEN "startAt" IS NULL THEN NULL
    ELSE date_trunc('day', "startAt")
  END,
  "dueAt" = CASE
    WHEN "dueAt" IS NULL THEN NULL
    ELSE date_trunc('day', "dueAt")
  END,
  "baselineStartAt" = CASE
    WHEN "baselineStartAt" IS NULL THEN NULL
    ELSE date_trunc('day', "baselineStartAt")
  END,
  "baselineDueAt" = CASE
    WHEN "baselineDueAt" IS NULL THEN NULL
    ELSE date_trunc('day', "baselineDueAt")
  END
WHERE
  ("startAt" IS NOT NULL AND "startAt" <> date_trunc('day', "startAt"))
  OR ("dueAt" IS NOT NULL AND "dueAt" <> date_trunc('day', "dueAt"))
  OR (
    "baselineStartAt" IS NOT NULL
    AND "baselineStartAt" <> date_trunc('day', "baselineStartAt")
  )
  OR (
    "baselineDueAt" IS NOT NULL
    AND "baselineDueAt" <> date_trunc('day', "baselineDueAt")
  );
