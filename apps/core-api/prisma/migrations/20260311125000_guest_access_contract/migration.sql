CREATE TYPE "GuestAccessScopeType" AS ENUM ('WORKSPACE', 'PROJECT');

CREATE TYPE "GuestAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "guest_invitations" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT,
  "email" TEXT NOT NULL,
  "scope_type" "GuestAccessScopeType" NOT NULL,
  "project_role" "ProjectRole",
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "accepted_by_user_id" TEXT,
  "revoked_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_access_grants" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "invitation_id" TEXT,
  "project_id" TEXT,
  "scope_type" "GuestAccessScopeType" NOT NULL,
  "project_role" "ProjectRole",
  "status" "GuestAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_invitations_token_hash_key" ON "guest_invitations"("token_hash");
CREATE INDEX "guest_invitations_workspace_id_email_revoked_at_accepted_at_idx" ON "guest_invitations"("workspace_id", "email", "revoked_at", "accepted_at");
CREATE INDEX "guest_invitations_project_id_revoked_at_accepted_at_idx" ON "guest_invitations"("project_id", "revoked_at", "accepted_at");

CREATE UNIQUE INDEX "guest_access_grants_scope_key" ON "guest_access_grants"("user_id", "project_id", "scope_type");
CREATE INDEX "guest_access_grants_workspace_id_user_id_status_idx" ON "guest_access_grants"("workspace_id", "user_id", "status");
CREATE INDEX "guest_access_grants_project_id_status_idx" ON "guest_access_grants"("project_id", "status");
CREATE INDEX "guest_access_grants_invitation_id_idx" ON "guest_access_grants"("invitation_id");

ALTER TABLE "guest_invitations"
  ADD CONSTRAINT "guest_invitations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_invitations"
  ADD CONSTRAINT "guest_invitations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_invitations"
  ADD CONSTRAINT "guest_invitations_accepted_by_user_id_fkey"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guest_invitations"
  ADD CONSTRAINT "guest_invitations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guest_access_grants"
  ADD CONSTRAINT "guest_access_grants_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_access_grants"
  ADD CONSTRAINT "guest_access_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_access_grants"
  ADD CONSTRAINT "guest_access_grants_invitation_id_fkey"
  FOREIGN KEY ("invitation_id") REFERENCES "guest_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guest_access_grants"
  ADD CONSTRAINT "guest_access_grants_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_access_grants"
  ADD CONSTRAINT "guest_access_grants_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
