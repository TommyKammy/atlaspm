import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import type { AppRequest } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskMentionsService } from './task-mentions.service';

const MAX_COMMENT_BODY_LENGTH = 5000;

@Injectable()
export class TaskCommentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(TaskMentionsService) private readonly mentions: TaskMentionsService,
  ) {}

  async listMentions(taskId: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);

    const mentions = await this.prisma.taskMention.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: mentions.map((item) => item.mentionedUserId) } },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return mentions.map((mention) => ({
      ...mention,
      user: userMap.get(mention.mentionedUserId)
        ? {
            id: mention.mentionedUserId,
            displayName:
              userMap.get(mention.mentionedUserId)?.displayName ??
              userMap.get(mention.mentionedUserId)?.email ??
              mention.mentionedUserId,
            email: userMap.get(mention.mentionedUserId)?.email ?? null,
          }
        : null,
    }));
  }

  async listComments(taskId: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const comments = await this.prisma.taskComment.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: comments.map((comment) => comment.authorUserId) } },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    return comments.map((comment) => {
      const user = usersById.get(comment.authorUserId);
      return {
        id: comment.id,
        taskId: comment.taskId,
        authorUserId: comment.authorUserId,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        deletedAt: comment.deletedAt,
        author: {
          id: comment.authorUserId,
          displayName: user?.displayName ?? user?.email ?? comment.authorUserId,
          email: user?.email ?? null,
        },
      };
    });
  }

  async createComment(taskId: string, commentBody: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const trimmedBody = this.normalizeCommentBody(commentBody);

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          taskId,
          authorUserId: req.user.sub,
          body: trimmedBody,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.comment.created',
        afterJson: comment,
        correlationId: req.correlationId,
        outboxType: 'task.comment.created',
        payload: { taskId, commentId: comment.id },
      });
      await this.mentions.syncTaskMentions(
        tx,
        {
          taskId,
          sourceType: 'comment',
          sourceId: comment.id,
          mentionedUserIds: this.mentions.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );

      const taskAssigneeId = task.assigneeUserId;
      const assigneeShouldBeNotified = taskAssigneeId && taskAssigneeId !== req.user.sub;
      if (assigneeShouldBeNotified) {
        await this.notifications.createCommentNotification(tx, {
          userId: taskAssigneeId,
          projectId: task.projectId,
          taskId,
          commentId: comment.id,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      return comment;
    });
  }

  async patchComment(id: string, commentBody: string, req: AppRequest) {
    const comment = await this.prisma.taskComment.findUniqueOrThrow({ where: { id }, include: { task: true } });
    await this.domain.requireProjectRole(comment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (comment.deletedAt) throw new NotFoundException('Comment not found');
    if (comment.authorUserId !== req.user.sub) throw new ForbiddenException('Can only edit your own comment');
    const trimmedBody = this.normalizeCommentBody(commentBody);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskComment.update({
        where: { id },
        data: { body: trimmedBody },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: comment.taskId,
        action: 'task.comment.updated',
        beforeJson: comment,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.comment.updated',
        payload: { taskId: comment.taskId, commentId: id },
      });
      await this.mentions.syncTaskMentions(
        tx,
        {
          taskId: comment.taskId,
          sourceType: 'comment',
          sourceId: id,
          mentionedUserIds: this.mentions.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );
      return updated;
    });
  }

  async deleteComment(id: string, req: AppRequest) {
    const comment = await this.prisma.taskComment.findUniqueOrThrow({ where: { id }, include: { task: true } });
    await this.domain.requireProjectRole(comment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (comment.deletedAt) return comment;
    if (comment.authorUserId !== req.user.sub) throw new ForbiddenException('Can only delete your own comment');

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskComment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      const existingMentions = await tx.taskMention.findMany({
        where: { taskId: comment.taskId, sourceType: 'comment', sourceId: id },
      });
      if (existingMentions.length) {
        await tx.taskMention.deleteMany({
          where: { id: { in: existingMentions.map((item) => item.id) } },
        });
        for (const mention of existingMentions) {
          await this.domain.appendAuditOutbox({
            tx,
            actor: req.user.sub,
            entityType: 'Task',
            entityId: comment.taskId,
            action: 'task.mention.deleted',
            beforeJson: mention,
            correlationId: req.correlationId,
            outboxType: 'task.mention.deleted',
            payload: {
              taskId: comment.taskId,
              mentionedUserId: mention.mentionedUserId,
              sourceType: 'comment',
              sourceId: id,
            },
          });
        }
      }
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: comment.taskId,
        action: 'task.comment.deleted',
        beforeJson: comment,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.comment.deleted',
        payload: { taskId: comment.taskId, commentId: id },
      });
      return deleted;
    });
  }

  private normalizeCommentBody(body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody) throw new ConflictException('Comment body cannot be empty');
    if (trimmedBody.length > MAX_COMMENT_BODY_LENGTH) throw new ConflictException('Comment is too long');
    return trimmedBody;
  }
}
