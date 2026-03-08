ALTER TABLE "RecurringRule"
ADD COLUMN "sourceTaskId" TEXT;

CREATE UNIQUE INDEX "RecurringRule_sourceTaskId_key" ON "RecurringRule"("sourceTaskId");
CREATE INDEX "RecurringRule_sourceTaskId_idx" ON "RecurringRule"("sourceTaskId");

ALTER TABLE "RecurringRule"
ADD CONSTRAINT "RecurringRule_sourceTaskId_fkey"
FOREIGN KEY ("sourceTaskId") REFERENCES "Task"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
