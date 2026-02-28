CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "RecurringRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "RecurringFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "dayOfMonth" INTEGER,
    "sectionId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "priority" "Priority",
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "lastGeneratedAt" TIMESTAMP(3),
    "nextScheduledAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringTaskGeneration" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "taskId" TEXT UNIQUE,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecurringTaskGeneration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Task" ADD COLUMN "recurringRuleId" TEXT;

CREATE INDEX "RecurringRule_projectId_isActive_idx" ON "RecurringRule"("projectId", "isActive");
CREATE INDEX "RecurringRule_isActive_nextScheduledAt_idx" ON "RecurringRule"("isActive", "nextScheduledAt");
CREATE INDEX "RecurringTaskGeneration_status_retryCount_idx" ON "RecurringTaskGeneration"("status", "retryCount");
CREATE INDEX "Task_recurringRuleId_idx" ON "Task"("recurringRuleId");

CREATE UNIQUE INDEX "RecurringTaskGeneration_ruleId_scheduledAt_key" ON "RecurringTaskGeneration"("ruleId", "scheduledAt");

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTaskGeneration" ADD CONSTRAINT "RecurringTaskGeneration_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringTaskGeneration" ADD CONSTRAINT "RecurringTaskGeneration_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
