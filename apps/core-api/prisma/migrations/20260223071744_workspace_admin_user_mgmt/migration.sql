-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('WS_ADMIN', 'WS_MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "WorkspaceMembership" ADD COLUMN     "role" "WorkspaceRole" NOT NULL DEFAULT 'WS_MEMBER';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'WS_MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_email_idx" ON "Invitation"("workspaceId", "email");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX IF EXISTS "task_mentions_task_id_mentioned_user_id_source_type_source_id_k"
  RENAME TO "task_mentions_task_id_mentioned_user_id_source_type_source__key";
