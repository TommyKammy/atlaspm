ALTER TABLE "OutboxEvent"
  ADD COLUMN "delivery_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "dead_lettered_at" TIMESTAMP(3),
  ADD COLUMN "last_error" TEXT;

CREATE INDEX "OutboxEvent_next_retry_at_dead_lettered_at_delivered_at_idx"
ON "OutboxEvent"("next_retry_at", "dead_lettered_at", "deliveredAt");
