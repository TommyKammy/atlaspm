ALTER TABLE "capacity_schedules"
ADD CONSTRAINT "capacity_schedules_subject_type_user_id_check"
CHECK (
  ("subject_type" = 'WORKSPACE' AND "subject_user_id" IS NULL) OR
  ("subject_type" = 'USER' AND "subject_user_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "capacity_schedules_workspace_subject_unique"
ON "capacity_schedules"("workspace_id")
WHERE "subject_type" = 'WORKSPACE' AND "subject_user_id" IS NULL;

CREATE UNIQUE INDEX "capacity_schedules_user_subject_unique"
ON "capacity_schedules"("workspace_id", "subject_user_id")
WHERE "subject_type" = 'USER' AND "subject_user_id" IS NOT NULL;
