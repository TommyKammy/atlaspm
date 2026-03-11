-- CreateEnum
CREATE TYPE "CapacityScheduleSubjectType" AS ENUM ('WORKSPACE', 'USER');

-- CreateTable
CREATE TABLE "capacity_schedules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "subject_type" "CapacityScheduleSubjectType" NOT NULL,
    "subject_user_id" TEXT,
    "name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "hours_per_day" INTEGER NOT NULL,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "minutes_per_day" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_off_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capacity_schedules_workspace_id_subject_type_created_at_idx" ON "capacity_schedules"("workspace_id", "subject_type", "created_at");

-- CreateIndex
CREATE INDEX "capacity_schedules_subject_user_id_created_at_idx" ON "capacity_schedules"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "time_off_events_workspace_id_user_id_start_date_end_date_idx" ON "time_off_events"("workspace_id", "user_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "capacity_schedules" ADD CONSTRAINT "capacity_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_schedules" ADD CONSTRAINT "capacity_schedules_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_events" ADD CONSTRAINT "time_off_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_events" ADD CONSTRAINT "time_off_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
