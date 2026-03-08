-- CreateEnum
CREATE TYPE "ProjectStatusHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK');

-- AlterTable
ALTER TABLE "project_status_updates"
  RENAME COLUMN "body" TO "summary";

ALTER TABLE "project_status_updates"
  ADD COLUMN "health" "ProjectStatusHealth" NOT NULL DEFAULT 'ON_TRACK',
  ADD COLUMN "blockers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "next_steps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
