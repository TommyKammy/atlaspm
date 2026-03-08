import { Controller, Post, Get, Param, Body, UseGuards, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProjectRole, TaskStatus, TaskType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE_APPROVAL_REQUESTED } from '../notifications/notification-taxonomy';

class RequestApprovalDto {
  @IsString()
  approverUserId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

class RespondApprovalDto {
  @IsEnum(['APPROVED', 'REJECTED'] as const)
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  comment?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class TaskApprovalController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get('tasks/:id/approval')
  async getApproval(
    @Param('id') taskId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { approval: { include: { approver: { select: { id: true, displayName: true } } } } },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);

    return task.approval;
  }

  @Post('tasks/:id/request-approval')
  async requestApproval(
    @Param('id') taskId: string,
    @Body() body: RequestApprovalDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { approval: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.type !== TaskType.APPROVAL) {
      throw new ConflictException('Task is not an approval type');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    if (task.approval?.status === 'PENDING') {
      throw new ConflictException('Approval request already pending');
    }

    const approver = await this.prisma.user.findFirst({
      where: { id: body.approverUserId },
    });
    if (!approver) {
      throw new NotFoundException('Approver user not found');
    }

    const trimmedComment = body.comment?.trim() || null;

    const approval = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const upserted = await tx.taskApproval.upsert({
        where: { taskId },
        create: {
          taskId,
          status: 'PENDING',
          approverUserId: body.approverUserId,
          comment: trimmedComment,
          requestedAt: new Date(),
        },
        update: {
          status: 'PENDING',
          approverUserId: body.approverUserId,
          comment: trimmedComment,
          requestedAt: new Date(),
          respondedAt: null,
        },
        include: { approver: { select: { id: true, displayName: true } } },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskApproval',
        entityId: upserted.id,
        action: 'approval.requested',
        beforeJson: task.approval,
        afterJson: upserted,
        correlationId: req.correlationId,
        outboxType: 'approval.requested',
        payload: { taskId, approvalId: upserted.id, approverUserId: body.approverUserId },
      });

      await tx.inboxNotification.deleteMany({
        where: {
          taskId,
          type: NOTIFICATION_TYPE_APPROVAL_REQUESTED,
          sourceType: 'task',
          sourceId: taskId,
        },
      });

      await this.notifications.createApprovalRequestedNotification(tx, {
        userId: body.approverUserId,
        projectId: task.projectId,
        taskId,
        triggeredByUserId: req.user.sub,
        actor: req.user.sub,
        correlationId: req.correlationId,
      });
      return upserted;
    });

    return approval;
  }

  @Post('tasks/:id/respond-approval')
  async respondApproval(
    @Param('id') taskId: string,
    @Body() body: RespondApprovalDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { approval: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.approval) {
      throw new NotFoundException('No approval request found for this task');
    }

    if (task.approval.status !== 'PENDING') {
      throw new ConflictException('Approval request is not pending');
    }

    if (task.approval.approverUserId !== req.user.sub) {
      await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.ADMIN);
    }

    const trimmedComment = body.comment?.trim() || null;

    const updatedApproval = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.taskApproval.update({
        where: { taskId },
        data: {
          status: body.status,
          comment: trimmedComment,
          respondedAt: new Date(),
        },
        include: { approver: { select: { id: true, displayName: true } } },
      });

      const beforeApproval = task.approval;

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskApproval',
        entityId: updated.id,
        action: body.status === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
        beforeJson: beforeApproval,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: body.status === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
        payload: { taskId, approvalId: updated.id, status: body.status },
      });

      if (body.status === 'APPROVED') {
        const beforeTask = task;
        const updatedTask = await tx.task.update({
          where: { id: taskId },
          data: { status: TaskStatus.DONE, completedAt: new Date() },
        });

        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'Task',
          entityId: updatedTask.id,
          action: 'task.completed',
          beforeJson: beforeTask,
          afterJson: updatedTask,
          correlationId: req.correlationId,
          outboxType: 'task.completed',
          payload: { taskId },
        });
      }

      await tx.inboxNotification.deleteMany({
        where: {
          taskId,
          type: NOTIFICATION_TYPE_APPROVAL_REQUESTED,
          sourceType: 'task',
          sourceId: taskId,
        },
      });

      if (task.assigneeUserId) {
        await this.notifications.createApprovalResponseNotification(tx, {
          userId: task.assigneeUserId,
          projectId: task.projectId,
          taskId,
          status: body.status,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      return updated;
    });

    return updatedApproval;
  }

  @Post('tasks/:id/cancel-approval')
  async cancelApproval(
    @Param('id') taskId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { approval: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.approval) {
      throw new NotFoundException('No approval request found');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deletedApproval = await tx.taskApproval.delete({
        where: { taskId },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskApproval',
        entityId: deletedApproval.id,
        action: 'approval.cancelled',
        beforeJson: task.approval,
        afterJson: null,
        correlationId: req.correlationId,
        outboxType: 'approval.cancelled',
        payload: { taskId, approvalId: deletedApproval.id },
      });

      await tx.inboxNotification.deleteMany({
        where: {
          taskId,
          type: NOTIFICATION_TYPE_APPROVAL_REQUESTED,
          sourceType: 'task',
          sourceId: taskId,
        },
      });

      return deletedApproval;
    });

    return { success: true };
  }
}
