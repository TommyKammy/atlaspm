-- Optimize unread inbox pagination and count paths for large notification tables.
CREATE INDEX IF NOT EXISTS "inbox_notifications_user_id_unread_created_at_desc_idx"
  ON "inbox_notifications"("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
