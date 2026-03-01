-- Create TaskApprovalStatus enum
CREATE TYPE "TaskApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Create task_approvals table
CREATE TABLE "task_approvals" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "status" "TaskApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approver_user_id" TEXT,
    "comment" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_approvals_pkey" PRIMARY KEY ("id")
);

-- Create unique index on task_id
CREATE UNIQUE INDEX "task_approvals_task_id_key" ON "task_approvals"("task_id");

-- Create indexes
CREATE INDEX "task_approvals_task_id_idx" ON "task_approvals"("task_id");
CREATE INDEX "task_approvals_approver_user_id_idx" ON "task_approvals"("approver_user_id");

-- Add foreign key constraints
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_task_id_fkey" 
    FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_approver_user_id_fkey" 
    FOREIGN KEY ("approver_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
