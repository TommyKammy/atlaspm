-- CreateIndex
CREATE INDEX "ProjectMembership_userId_idx" ON "ProjectMembership"("userId");

-- CreateIndex
CREATE INDEX "Task_projectId_sectionId_deleted_at_position_idx" ON "Task"("projectId", "sectionId", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx" ON "Task"("projectId", "deleted_at", "status", "assigneeUserId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_projectId_deleted_at_updatedAt_idx" ON "Task"("projectId", "deleted_at", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE INDEX "task_attachments_task_id_deleted_at_created_at_idx" ON "task_attachments"("task_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "task_comments_task_id_deleted_at_created_at_idx" ON "task_comments"("task_id", "deleted_at", "created_at");

-- RenameIndex
ALTER INDEX "OutboxEvent_next_retry_at_dead_lettered_at_delivered_at_idx" RENAME TO "OutboxEvent_next_retry_at_dead_lettered_at_deliveredAt_idx";

-- RenameIndex
ALTER INDEX "inbox_notifications_user_id_task_id_type_source_type_source_id_" RENAME TO "inbox_notifications_user_id_task_id_type_source_type_source_key";

-- RenameIndex
ALTER INDEX "task_mentions_task_id_mentioned_user_id_source_type_source_id_k" RENAME TO "task_mentions_task_id_mentioned_user_id_source_type_source__key";
