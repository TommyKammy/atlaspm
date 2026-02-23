import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { Prisma, Priority, ProjectRole, TaskStatus } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { resolveAttachmentPath } from './attachment-storage';
import {
  parseRuleDefinition,
  templateDefinition,
  type RuleDefinition,
} from '../rules/rule-definition';

class TaskQuery {
  @IsOptional()
  @IsString()
  groupBy?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsISO8601()
  dueFrom?: string;

  @IsOptional()
  @IsISO8601()
  dueTo?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'dueAt' | 'progressPercent' | 'updatedAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

class PatchTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

class BulkTaskDto {
  @IsArray()
  taskIds!: string[];

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}

class ReorderTaskDto {
  @IsUUID()
  taskId!: string;

  @IsOptional()
  @IsUUID()
  beforeTaskId?: string | null;

  @IsOptional()
  @IsUUID()
  afterTaskId?: string | null;

  @IsOptional()
  @IsUUID()
  fromSectionId?: string;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

class PatchDescriptionDto {
  @IsObject()
  descriptionDoc!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

class CreateTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

class PatchTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

class InitiateAttachmentDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  sizeBytes!: number;
}

class CompleteAttachmentDto {
  @IsUUID()
  attachmentId!: string;
}

const MAX_DESCRIPTION_DOC_BYTES = 200_000;
const MAX_DESCRIPTION_TEXT_LENGTH = 20_000;
const MAX_COMMENT_BODY_LENGTH = 5000;
const MAX_IMAGE_UPLOAD_BYTES = 5_000_000;
const IMAGE_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/tasks')
  async list(@Param('id') projectId: string, @Query() query: TaskQuery, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const where: any = { projectId };
    if (query.status) where.status = query.status;
    if (query.assignee) where.assigneeUserId = query.assignee;
    if (query.dueFrom || query.dueTo) {
      where.dueAt = {
        gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
        lte: query.dueTo ? new Date(query.dueTo) : undefined,
      };
    }
    if (query.tag) where.tags = { has: query.tag };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { descriptionText: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy = query.sortBy
      ? { [query.sortBy]: query.sortOrder ?? 'asc' }
      : [{ sectionId: 'asc' as const }, { position: 'asc' as const }];

    const tasks = await this.prisma.task.findMany({ where, orderBy });
    if (query.groupBy === 'section') {
      const sections = await this.prisma.section.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
      return sections.map((section) => ({
        section,
        tasks: tasks.filter((t) => t.sectionId === section.id).sort((a, b) => (query.sortBy ? 0 : a.position - b.position)),
      }));
    }
    return tasks;
  }

  @Get('tasks/:id')
  async getOne(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return task;
  }

  @Post('projects/:id/tasks')
  async create(@Param('id') projectId: string, @Body() body: CreateTaskDto, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    let sectionId = body.sectionId;
    if (!sectionId) {
      const defaultSection = await this.prisma.section.findFirst({ where: { projectId, isDefault: true } });
      if (!defaultSection) throw new NotFoundException('Default section missing');
      sectionId = defaultSection.id;
    }

    const topTask = await this.prisma.task.findFirst({ where: { projectId, sectionId }, orderBy: { position: 'asc' } });
    const position = (topTask?.position ?? 1000) - 1000;
    const progress = body.progressPercent ?? 0;
    const status = this.domain.deriveStatusForProgress(progress, body.status ?? TaskStatus.TODO);
    const completedAt = status === TaskStatus.DONE ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          sectionId,
          title: body.title,
          description: body.description,
          status,
          progressPercent: progress,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          tags: body.tags ?? [],
          completedAt,
          position,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: task.id,
        action: 'task.created',
        afterJson: task,
        correlationId: req.correlationId,
        outboxType: 'task.created',
        payload: task,
      });
      await this.applyProgressRules(tx, task.id, req.correlationId);
      return task;
    });
  }

  @Patch('tasks/:id')
  async patch(@Param('id') id: string, @Body() body: PatchTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.version && body.version !== task.version) throw new ConflictException('Version conflict');

    const progress = body.progressPercent ?? task.progressPercent;
    const status = body.status ?? this.domain.deriveStatusForProgress(progress, task.status);
    const completedAt = status === TaskStatus.DONE ? task.completedAt ?? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description,
          status,
          progressPercent: body.progressPercent,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : body.startAt === null ? null : undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : body.dueAt === null ? null : undefined,
          tags: body.tags,
          sectionId: body.sectionId,
          completedAt,
          version: { increment: 1 },
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.updated',
        beforeJson: task,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.updated',
        payload: updated,
      });
      await this.applyProgressRules(tx, id, req.correlationId);
      return updated;
    });
  }

  @Patch('tasks/:id/description')
  async patchDescription(
    @Param('id') id: string,
    @Body() body: PatchDescriptionDto,
    @CurrentRequest() req: AppRequest,
  ) {
    this.validateDescriptionDoc(body.descriptionDoc);
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    if (task.descriptionVersion !== body.expectedVersion) {
      throw new ConflictException({
        message: 'Description version conflict',
        latest: {
          descriptionDoc: task.descriptionDoc,
          descriptionVersion: task.descriptionVersion,
          descriptionUpdatedAt: task.descriptionUpdatedAt,
        },
      });
    }

    const descriptionText = this.extractPlainTextFromDoc(body.descriptionDoc).slice(0, MAX_DESCRIPTION_TEXT_LENGTH);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          descriptionDoc: body.descriptionDoc as Prisma.InputJsonValue,
          descriptionText,
          descriptionUpdatedAt: new Date(),
          descriptionVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.description.updated',
        beforeJson: {
          descriptionDoc: task.descriptionDoc,
          descriptionVersion: task.descriptionVersion,
          descriptionText: task.descriptionText,
        },
        afterJson: {
          descriptionDoc: updated.descriptionDoc,
          descriptionVersion: updated.descriptionVersion,
          descriptionText: updated.descriptionText,
        },
        correlationId: req.correlationId,
        outboxType: 'task.description.updated',
        payload: { taskId: id, descriptionVersion: updated.descriptionVersion },
      });
      await this.syncTaskMentions(
        tx,
        {
          taskId: id,
          sourceType: 'description',
          sourceId: '',
          mentionedUserIds: this.extractMentionUserIdsFromDoc(body.descriptionDoc),
        },
        req,
      );
      return updated;
    });
  }

  @Get('tasks/:id/mentions')
  async listMentions(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
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

  @Get('tasks/:id/comments')
  async listComments(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const comments = await this.prisma.taskComment.findMany({
      where: { taskId, deletedAt: null },
      include: { task: { select: { projectId: true } } },
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

  @Post('tasks/:id/comments')
  async createComment(
    @Param('id') taskId: string,
    @Body() body: CreateTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const trimmedBody = body.body.trim();
    if (!trimmedBody) throw new ConflictException('Comment body cannot be empty');
    if (trimmedBody.length > MAX_COMMENT_BODY_LENGTH) throw new ConflictException('Comment is too long');

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
      await this.syncTaskMentions(
        tx,
        {
          taskId,
          sourceType: 'comment',
          sourceId: comment.id,
          mentionedUserIds: this.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );
      return comment;
    });
  }

  @Patch('comments/:id')
  async patchComment(
    @Param('id') id: string,
    @Body() body: PatchTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const comment = await this.prisma.taskComment.findUniqueOrThrow({ where: { id }, include: { task: true } });
    await this.domain.requireProjectRole(comment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (comment.deletedAt) throw new NotFoundException('Comment not found');
    if (comment.authorUserId !== req.user.sub) throw new ForbiddenException('Can only edit your own comment');
    const trimmedBody = body.body.trim();
    if (!trimmedBody) throw new ConflictException('Comment body cannot be empty');
    if (trimmedBody.length > MAX_COMMENT_BODY_LENGTH) throw new ConflictException('Comment is too long');

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
      await this.syncTaskMentions(
        tx,
        {
          taskId: comment.taskId,
          sourceType: 'comment',
          sourceId: id,
          mentionedUserIds: this.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );
      return updated;
    });
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
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

  @Get('tasks/:id/attachments')
  async listAttachments(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const attachments = await this.prisma.taskAttachment.findMany({
      where: { taskId, deletedAt: null, completedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((item) => ({
      ...item,
      url: `/public/attachments/${item.id}/${item.uploadToken}`,
    }));
  }

  @Post('tasks/:id/attachments/initiate')
  async initiateAttachment(
    @Param('id') taskId: string,
    @Body() body: InitiateAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!IMAGE_MIME_ALLOWLIST.has(body.mimeType)) {
      throw new ConflictException('Unsupported image mime type');
    }
    if (body.sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
      throw new ConflictException('Image too large');
    }

    const uploadToken = randomBytes(16).toString('hex');
    const storageKey = `${taskId}/${randomUUID()}-${this.sanitizeFileName(body.fileName)}`;
    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskAttachment.create({
        data: {
          taskId,
          uploaderUserId: req.user.sub,
          fileName: this.sanitizeFileName(body.fileName),
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
          storageKey,
          uploadToken,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.attachment.initiated',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.initiated',
        payload: { taskId, attachmentId: created.id },
      });
      return created;
    });

    return {
      attachmentId: attachment.id,
      uploadUrl: `/attachments/${attachment.id}/upload?token=${uploadToken}`,
      maxBytes: MAX_IMAGE_UPLOAD_BYTES,
    };
  }

  @Post('attachments/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Query('token') token: string,
    @UploadedFile() file: { mimetype: string; size: number; buffer: Buffer },
    @CurrentRequest() req: AppRequest,
  ) {
    if (!token) throw new ConflictException('Missing upload token');
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!attachment.uploadToken || attachment.uploadToken !== token) {
      throw new ForbiddenException('Invalid upload token');
    }
    if (!file) throw new ConflictException('Missing file');
    if (!IMAGE_MIME_ALLOWLIST.has(file.mimetype)) throw new ConflictException('Unsupported image mime type');
    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) throw new ConflictException('Image too large');

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    await fs.mkdir(dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, file.buffer);

    await this.prisma.taskAttachment.update({
      where: { id: attachment.id },
      data: { sizeBytes: file.size, mimeType: file.mimetype },
    });
    return { ok: true };
  }

  @Post('tasks/:id/attachments/complete')
  async completeAttachment(
    @Param('id') taskId: string,
    @Body() body: CompleteAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id: body.attachmentId },
    });
    if (attachment.taskId !== taskId) throw new ConflictException('Attachment does not belong to task');
    if (attachment.deletedAt) throw new NotFoundException('Attachment not found');

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    const stat = await fs.stat(diskPath).catch(() => null);
    if (!stat) throw new ConflictException('Attachment upload not found');

    const accessToken = randomBytes(16).toString('hex');
    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.taskAttachment.update({
        where: { id: attachment.id },
        data: { completedAt: new Date(), uploadToken: accessToken, sizeBytes: Number(stat.size) },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.attachment.created',
        afterJson: completed,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.created',
        payload: { taskId, attachmentId: completed.id },
      });
      return {
        ...completed,
        url: `/public/attachments/${completed.id}/${accessToken}`,
      };
    });
  }

  @Delete('attachments/:id')
  async deleteAttachment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (attachment.deletedAt) return attachment;
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskAttachment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: attachment.taskId,
        action: 'task.attachment.deleted',
        beforeJson: attachment,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.deleted',
        payload: { taskId: attachment.taskId, attachmentId: id },
      });
      return deleted;
    });
  }

  @Post('tasks/bulk')
  async bulk(@Body() body: BulkTaskDto, @CurrentRequest() req: AppRequest) {
    const tasks = await this.prisma.task.findMany({ where: { id: { in: body.taskIds } } });
    if (!tasks.length) return { count: 0 };
    const firstTask = tasks[0];
    if (!firstTask) return { count: 0 };
    const projectId = firstTask.projectId;
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = [] as unknown[];
      for (const task of tasks) {
        const progress = body.progressPercent ?? task.progressPercent;
        const status = body.status ?? this.domain.deriveStatusForProgress(progress, task.status);
        const completedAt = status === TaskStatus.DONE ? task.completedAt ?? new Date() : null;

        const next = await tx.task.update({
          where: { id: task.id },
          data: {
            status,
            assigneeUserId: body.assigneeUserId,
            tags: body.tags,
            progressPercent: body.progressPercent,
            completedAt,
            version: { increment: 1 },
          },
        });
        updated.push(next);
        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'Task',
          entityId: task.id,
          action: 'task.bulk.updated',
          beforeJson: task,
          afterJson: next,
          correlationId: req.correlationId,
          outboxType: 'task.updated',
          payload: next,
        });
        await this.applyProgressRules(tx, task.id, req.correlationId);
      }
      return { count: updated.length };
    });
  }

  @Post('sections/:sectionId/tasks/reorder')
  async reorder(
    @Param('sectionId') targetSectionId: string,
    @Body() body: ReorderTaskDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: body.taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.expectedVersion && body.expectedVersion !== task.version) {
      const sectionTasks = await this.prisma.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId },
        orderBy: { position: 'asc' },
      });
      throw new ConflictException({ message: 'Version conflict', sectionTasks });
    }

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id } },
        orderBy: { position: 'asc' },
      });
      const before = body.beforeTaskId ? siblings.find((t) => t.id === body.beforeTaskId) : undefined;
      const after = body.afterTaskId ? siblings.find((t) => t.id === body.afterTaskId) : undefined;

      let newPosition: number;
      if (!before && !after) {
        const last = siblings.at(-1);
        newPosition = last ? last.position + 1000 : 1000;
      } else if (!before && after) {
        newPosition = after.position - 1000;
      } else if (before && !after) {
        newPosition = before.position + 1000;
      } else {
        newPosition = Math.floor((before!.position + after!.position) / 2);
      }

      if (siblings.some((t) => t.position === newPosition) || (before && after && before.position + 1 >= after.position)) {
        const rebalance = await tx.task.findMany({
          where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id } },
          orderBy: { position: 'asc' },
        });
        for (const [i, item] of rebalance.entries()) {
          await tx.task.update({ where: { id: item.id }, data: { position: (i + 1) * 1000 } });
        }
        const refreshedBefore = body.beforeTaskId
          ? await tx.task.findUnique({ where: { id: body.beforeTaskId } })
          : null;
        const refreshedAfter = body.afterTaskId ? await tx.task.findUnique({ where: { id: body.afterTaskId } }) : null;
        if (refreshedBefore && refreshedAfter) newPosition = Math.floor((refreshedBefore.position + refreshedAfter.position) / 2);
        else if (refreshedBefore) newPosition = refreshedBefore.position + 1000;
        else if (refreshedAfter) newPosition = refreshedAfter.position - 1000;
        else newPosition = (rebalance.length + 1) * 1000;
      }

      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          sectionId: targetSectionId,
          position: newPosition,
          version: { increment: 1 },
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: task.id,
        action: 'task.reordered',
        beforeJson: task,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.reordered',
        payload: { taskId: task.id, fromSectionId: task.sectionId, toSectionId: targetSectionId, position: newPosition },
      });

      const sectionTasks = await tx.task.findMany({
        where: { sectionId: targetSectionId, projectId: task.projectId },
        orderBy: { position: 'asc' },
      });
      return { task: updated, sectionTasks };
    });
  }

  private validateDescriptionDoc(descriptionDoc: Record<string, unknown>) {
    const encoded = JSON.stringify(descriptionDoc);
    if (encoded.length > MAX_DESCRIPTION_DOC_BYTES) {
      throw new ConflictException('descriptionDoc payload too large');
    }
    if (descriptionDoc.type !== 'doc' || !Array.isArray(descriptionDoc.content)) {
      throw new ConflictException('descriptionDoc must be a valid ProseMirror doc');
    }
  }

  private sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.bin';
  }

  private extractMentionUserIdsFromComment(body: string) {
    const ids = new Set<string>();
    const regex = /@\[(?<id>[a-zA-Z0-9:_-]+)\|[^\]]+\]/g;
    let match = regex.exec(body);
    while (match) {
      const id = match.groups?.id?.trim();
      if (id) ids.add(id);
      match = regex.exec(body);
    }
    return [...ids];
  }

  private extractMentionUserIdsFromDoc(node: unknown): string[] {
    const ids = new Set<string>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      const item = value as Record<string, unknown>;
      if (item.type === 'mention' && item.attrs && typeof item.attrs === 'object') {
        const mentionId = (item.attrs as Record<string, unknown>).id;
        if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
      }
      if (Array.isArray(item.marks)) {
        for (const mark of item.marks) {
          if (
            mark &&
            typeof mark === 'object' &&
            (mark as Record<string, unknown>).type === 'mention' &&
            (mark as Record<string, unknown>).attrs &&
            typeof (mark as Record<string, unknown>).attrs === 'object'
          ) {
            const mentionId = ((mark as Record<string, unknown>).attrs as Record<string, unknown>).id;
            if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
          }
        }
      }
      walk(item.content);
    };
    walk(node);
    return [...ids];
  }

  private async syncTaskMentions(
    tx: Prisma.TransactionClient,
    input: { taskId: string; sourceType: 'description' | 'comment'; sourceId: string; mentionedUserIds: string[] },
    req: AppRequest,
  ) {
    const sourceId = input.sourceId ?? '';
    const uniqueIncoming = [...new Set(input.mentionedUserIds)].filter(Boolean);
    const validUsers = uniqueIncoming.length
      ? await tx.projectMembership.findMany({
          where: {
            projectId: (await tx.task.findUniqueOrThrow({ where: { id: input.taskId }, select: { projectId: true } }))
              .projectId,
            userId: { in: uniqueIncoming },
          },
          select: { userId: true },
        })
      : [];
    const validUserIds = new Set(validUsers.map((item) => item.userId));
    const finalUserIds = uniqueIncoming.filter((id) => validUserIds.has(id));

    const existing = await tx.taskMention.findMany({
      where: { taskId: input.taskId, sourceType: input.sourceType, sourceId },
    });
    const existingSet = new Set(existing.map((item) => item.mentionedUserId));
    const toCreate = finalUserIds.filter((id) => !existingSet.has(id));
    const toDelete = existing.filter((item) => !finalUserIds.includes(item.mentionedUserId));

    for (const userId of toCreate) {
      const created = await tx.taskMention.create({
        data: { taskId: input.taskId, mentionedUserId: userId, sourceType: input.sourceType, sourceId },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'task.mention.created',
        payload: {
          taskId: input.taskId,
          mentionedUserId: userId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
    }

    for (const mention of toDelete) {
      await tx.taskMention.delete({ where: { id: mention.id } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.deleted',
        beforeJson: mention,
        correlationId: req.correlationId,
        outboxType: 'task.mention.deleted',
        payload: {
          taskId: input.taskId,
          mentionedUserId: mention.mentionedUserId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
    }
  }

  private extractPlainTextFromDoc(node: unknown): string {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map((child) => this.extractPlainTextFromDoc(child)).join(' ');
    if (typeof node === 'object') {
      const value = node as Record<string, unknown>;
      const text = typeof value.text === 'string' ? value.text : '';
      const nested = this.extractPlainTextFromDoc(value.content);
      return [text, nested].filter(Boolean).join(' ').trim();
    }
    return '';
  }

  private async applyProgressRules(tx: any, taskId: string, correlationId?: string) {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) return;
    const cid = correlationId ?? 'test-correlation-id';

    const rules = await tx.rule.findMany({ where: { projectId: task.projectId, enabled: true } });
    for (const rule of rules) {
      const cutoff = new Date(Date.now() - rule.cooldownSec * 1000);
      const recentRun = await tx.ruleRun.findFirst({
        where: { ruleId: rule.id, taskId, startedAt: { gte: cutoff } },
        orderBy: { startedAt: 'desc' },
      });
      if (recentRun) continue;

      const definition = this.resolveRuleDefinition(rule);
      const conditionsMatched = definition.conditions.every((condition) => {
        const value = task.progressPercent;
        if (condition.op === 'between') {
          return value >= Number(condition.min) && value <= Number(condition.max);
        }
        if (condition.op === 'eq') return value === Number(condition.value);
        if (condition.op === 'lt') return value < Number(condition.value);
        if (condition.op === 'lte') return value <= Number(condition.value);
        if (condition.op === 'gt') return value > Number(condition.value);
        if (condition.op === 'gte') return value >= Number(condition.value);
        return false;
      });

      let patch: any = null;
      if (conditionsMatched) {
        const next: Record<string, unknown> = {};
        for (const action of definition.actions) {
          if (action.type === 'setStatus' && action.status) next.status = action.status;
          if (action.type === 'setCompletedAtNow') next.completedAt = task.completedAt ?? new Date();
          if (action.type === 'setCompletedAtNull') next.completedAt = null;
        }
        if (Object.keys(next).length) {
          const statusUnchanged = next.status === undefined || next.status === task.status;
          const completedUnchanged =
            next.completedAt === undefined || String(next.completedAt) === String(task.completedAt);
          if (!(statusUnchanged && completedUnchanged)) {
            patch = { ...next, version: { increment: 1 } };
          }
        }
      }

      const run = await tx.ruleRun.create({
        data: { ruleId: rule.id, taskId, changed: Boolean(patch), correlationId: cid },
      });

      if (patch) {
        const before = { ...task };
        const updated = await tx.task.update({ where: { id: taskId }, data: patch });
        await this.domain.appendAuditOutbox({
          tx,
          actor: 'rule-engine',
          entityType: 'Task',
          entityId: taskId,
          action: 'rule.applied',
          beforeJson: before,
          afterJson: updated,
          correlationId: cid,
          outboxType: 'rule.applied',
          payload: { ruleId: rule.id, taskId },
        });
      }

      await tx.ruleRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
    }
  }

  private resolveRuleDefinition(rule: { definition: unknown; templateKey: string }): RuleDefinition {
    if (rule.definition) return parseRuleDefinition(rule.definition);
    return templateDefinition(rule.templateKey);
  }
}
