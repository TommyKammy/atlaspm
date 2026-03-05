-- Timeline interaction foundation: per-user lane ordering preferences
CREATE TABLE IF NOT EXISTS "ProjectTimelinePreference" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "laneOrderBySection" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "laneOrderByAssignee" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTimelinePreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTimelinePreference_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectTimelinePreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTimelinePreference_projectId_userId_key"
  ON "ProjectTimelinePreference"("projectId", "userId");

CREATE INDEX IF NOT EXISTS "ProjectTimelinePreference_userId_idx"
  ON "ProjectTimelinePreference"("userId");
