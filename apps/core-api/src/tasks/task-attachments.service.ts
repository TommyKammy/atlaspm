import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { promises as fs } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { DomainService } from '../common/domain.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentDownloadUrlService } from './attachment-download-url.service';
import { MAX_IMAGE_UPLOAD_BYTES } from './task-attachments.constants';
import { resolveAttachmentPath } from './attachment-storage';

const IMAGE_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

@Injectable()
export class TaskAttachmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(AttachmentDownloadUrlService)
    private readonly attachmentDownloadUrls: AttachmentDownloadUrlService,
  ) {}

  async listAttachments(taskId: string, includeDeletedRaw: string | undefined, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const includeDeleted = String(includeDeletedRaw ?? '').toLowerCase() === 'true';
    const where: Prisma.TaskAttachmentWhereInput = {
      taskId,
      completedAt: { not: null },
      ...(includeDeleted ? {} : { deletedAt: null }),
    };
    const attachments = await this.prisma.taskAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((item) => this.serializeAttachment(item));
  }

  async initiateAttachment(
    taskId: string,
    body: { fileName: string; mimeType: string; sizeBytes: number },
    req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!IMAGE_MIME_ALLOWLIST.has(body.mimeType)) {
      throw new ConflictException('Unsupported image mime type');
    }
    if (body.sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
      throw new ConflictException('Image too large');
    }

    const uploadToken = randomBytes(16).toString('hex');
    const sanitizedFileName = this.sanitizeFileName(body.fileName);
    const storageKey = `${taskId}/${randomUUID()}-${sanitizedFileName}`;
    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskAttachment.create({
        data: {
          taskId,
          uploaderUserId: req.user.sub,
          fileName: sanitizedFileName,
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

  async uploadAttachment(
    id: string,
    token: string,
    file: { mimetype: string; size: number; buffer: Buffer },
    req: AppRequest,
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
    if (attachment.deletedAt) {
      throw new NotFoundException('Attachment not found');
    }
    if (attachment.completedAt) {
      throw new ConflictException('Attachment already completed');
    }
    if (!file) throw new ConflictException('Missing file');
    if (!IMAGE_MIME_ALLOWLIST.has(file.mimetype)) throw new ConflictException('Unsupported image mime type');
    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) throw new ConflictException('Image too large');

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    const { count } = await this.prisma.taskAttachment.updateMany({
      where: {
        id: attachment.id,
        uploadToken: token,
        deletedAt: null,
        completedAt: null,
      },
      data: { sizeBytes: file.size, mimeType: file.mimetype },
    });
    if (count !== 1) {
      throw new ConflictException('Attachment is no longer uploadable');
    }

    await fs.mkdir(dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, file.buffer);
    return { ok: true };
  }

  async completeAttachment(taskId: string, attachmentId: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    if (attachment.taskId !== taskId) throw new ConflictException('Attachment does not belong to task');
    if (attachment.deletedAt) throw new NotFoundException('Attachment not found');
    if (attachment.completedAt) return this.serializeAttachment(attachment);

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    const stat = await fs.stat(diskPath).catch(() => null);
    if (!stat) throw new ConflictException('Attachment upload not found');

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taskAttachment.findUniqueOrThrow({
        where: { id: attachment.id },
      });
      if (current.deletedAt) {
        throw new NotFoundException('Attachment not found');
      }
      if (current.completedAt) {
        return this.serializeAttachment(current);
      }

      const accessToken = randomBytes(16).toString('hex');
      const completed = await tx.taskAttachment.update({
        where: { id: current.id },
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
      return this.serializeAttachment(completed);
    });
  }

  async deleteAttachment(id: string, req: AppRequest) {
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (attachment.deletedAt) return this.serializeAttachment(attachment);
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
      return this.serializeAttachment(deleted);
    });
  }

  async restoreAttachment(id: string, req: AppRequest) {
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!attachment.deletedAt) return this.serializeAttachment(attachment);
    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.taskAttachment.update({
        where: { id },
        data: { deletedAt: null, uploadToken: randomBytes(16).toString('hex') },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: attachment.taskId,
        action: 'task.attachment.restored',
        beforeJson: attachment,
        afterJson: restored,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.restored',
        payload: { taskId: attachment.taskId, attachmentId: id },
      });
      return this.serializeAttachment(restored);
    });
  }

  private sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.bin';
  }

  private serializeAttachment(item: {
    id: string;
    taskId: string;
    uploaderUserId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    completedAt: Date | null;
    createdAt: Date;
    deletedAt: Date | null;
    uploadToken: string | null;
  }) {
    return {
      id: item.id,
      taskId: item.taskId,
      uploaderUserId: item.uploaderUserId,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
      deletedAt: item.deletedAt,
      url: item.deletedAt || !item.completedAt ? null : this.attachmentDownloadUrls.buildUrl(item),
    };
  }
}
