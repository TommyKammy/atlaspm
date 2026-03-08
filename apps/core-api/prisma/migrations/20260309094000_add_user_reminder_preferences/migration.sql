CREATE TABLE "user_reminder_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_lead_time_minutes" INTEGER NOT NULL DEFAULT 60,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_reminder_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_reminder_preferences_user_id_key"
  ON "user_reminder_preferences"("user_id");

ALTER TABLE "user_reminder_preferences"
  ADD CONSTRAINT "user_reminder_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
