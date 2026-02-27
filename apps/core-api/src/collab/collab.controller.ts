import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { SignJWT } from 'jose';
import { createSecretKey, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { Prisma, ProjectRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_DESCRIPTION_DOC_BYTES = 200_000;
const MAX_DESCRIPTION_TEXT_LENGTH = 20_000;

class SnapshotBodyDto {
  @IsString()
  roomId!: string;

  @IsObject()
  descriptionDoc!: Record<string, unknown>;

  @IsString()
  descriptionText!: string;

  @IsOptional()
  participants?: Array<{ userId: string; mode: 'readonly' | 'readwrite' }>;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsIn(['idle', 'interval', 'disconnect'])
  reason!: 'idle' | 'interval' | 'disconnect';
}

@Controller()
export class CollabController {
  private readonly logger = new Logger(CollabController.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Post('tasks/:id/collab-token')
  @UseGuards(AuthGuard)
  async issueToken(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const membership = await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);

    const mode: 'readonly' | 'readwrite' = membership.role === ProjectRole.VIEWER ? 'readonly' : 'readwrite';
    const roomId = `task:${taskId}:description`;
    const now = Math.floor(Date.now() / 1000);
    const ttlSec = Number(process.env.COLLAB_TOKEN_TTL_SEC ?? 600);

    const token = await new SignJWT({ taskId, projectId: task.projectId, roomId, mode })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(req.user.sub)
      .setIssuer('atlaspm-core-api')
      .setAudience('atlaspm-collab')
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSec)
      .sign(this.collabJwtKey());

    const response = {
      url: process.env.COLLAB_SERVER_URL ?? 'ws://localhost:18080',
      token,
      roomId,
      mode,
      user: {
        id: req.user.sub,
        name: req.user.name ?? req.user.email ?? req.user.sub,
        color: this.colorForUser(req.user.sub),
      },
    };
    this.logger.log(
      JSON.stringify({
        event: 'collab.token.issued',
        correlationId: req.correlationId ?? 'unknown',
        taskId,
        projectId: task.projectId,
        roomId,
        mode,
        userId: req.user.sub,
      }),
    );
    return response;
  }

  @Get('internal/tasks/:id/description')
  async getInternalTaskDescription(
    @Param('id') taskId: string,
    @Headers('x-collab-service-token') serviceToken?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    this.assertServiceToken(serviceToken);
    const cid = (correlationId ?? randomUUID()).toString();
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    this.logger.log(
      JSON.stringify({
        event: 'collab.snapshot.load',
        correlationId: cid,
        taskId,
        roomId: `task:${taskId}:description`,
        descriptionVersion: task.descriptionVersion,
      }),
    );
    return {
      taskId,
      roomId: `task:${taskId}:description`,
      descriptionDoc: task.descriptionDoc,
      descriptionText: task.descriptionText,
      descriptionVersion: task.descriptionVersion,
    };
  }

  @Post('tasks/:id/description/snapshot')
  async saveSnapshot(
    @Param('id') taskId: string,
    @Body() body: SnapshotBodyDto,
    @Headers('x-collab-service-token') serviceToken?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    this.assertServiceToken(serviceToken);
    const roomId = `task:${taskId}:description`;
    if (body.roomId !== roomId) throw new BadRequestException('roomId mismatch');
    this.validateDoc(body.descriptionDoc);
    const cid = (correlationId ?? randomUUID()).toString();
    const nextDescriptionText = String(body.descriptionText ?? '').slice(0, MAX_DESCRIPTION_TEXT_LENGTH);
    const participantCount = Array.isArray(body.participants) ? body.participants.length : 0;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const current = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: {
            descriptionDoc: true,
            descriptionText: true,
            descriptionVersion: true,
            projectId: true,
          },
        });

        const sameDoc = this.isSameJson(current.descriptionDoc ?? null, body.descriptionDoc);
        const sameText = (current.descriptionText ?? '') === nextDescriptionText;
        if (sameDoc && sameText) {
          return { kind: 'noop' as const, descriptionVersion: current.descriptionVersion };
        }

        const claimed = await tx.task.updateMany({
          where: { id: taskId, descriptionVersion: current.descriptionVersion },
          data: {
            descriptionDoc: body.descriptionDoc as Prisma.InputJsonValue,
            descriptionText: nextDescriptionText,
            descriptionUpdatedAt: new Date(),
            descriptionVersion: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (!claimed.count) {
          return { kind: 'retry' as const };
        }

        const updated = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: { descriptionVersion: true, descriptionText: true },
        });

        const snapshotActor = await this.resolveSnapshotActor(tx, current.projectId, body.actorUserId);

        await this.syncDescriptionMentions(
          tx,
          current.projectId,
          taskId,
          this.extractMentionUserIdsFromDoc(body.descriptionDoc),
          cid,
          snapshotActor,
        );

        await this.domain.appendAuditOutbox({
          tx,
          actor: snapshotActor,
          entityType: 'Task',
          entityId: taskId,
          action: 'task.description.snapshot_saved',
          beforeJson: {
            descriptionVersion: current.descriptionVersion,
            descriptionText: current.descriptionText,
          },
          afterJson: {
            descriptionVersion: updated.descriptionVersion,
            descriptionText: updated.descriptionText,
            reason: body.reason,
            participantCount,
          },
          correlationId: cid,
          outboxType: 'task.description.snapshot_saved',
          payload: {
            taskId,
            roomId,
            reason: body.reason,
            participantCount,
            actor: snapshotActor,
            descriptionVersion: updated.descriptionVersion,
          },
        });

        return { kind: 'saved' as const, descriptionVersion: updated.descriptionVersion };
      });

      if (outcome.kind === 'retry') {
        continue;
      }

      if (outcome.kind === 'noop') {
        this.logger.log(
          JSON.stringify({
            event: 'collab.snapshot.noop',
            correlationId: cid,
            taskId,
            roomId,
            reason: body.reason,
            participantCount,
            descriptionVersion: outcome.descriptionVersion,
          }),
        );
        return {
          ok: true,
          noop: true,
          descriptionVersion: outcome.descriptionVersion,
        };
      }

      this.logger.log(
        JSON.stringify({
          event: 'collab.snapshot.saved',
          correlationId: cid,
          taskId,
          roomId,
          reason: body.reason,
          participantCount,
          descriptionVersion: outcome.descriptionVersion,
        }),
      );
      return {
        ok: true,
        descriptionVersion: outcome.descriptionVersion,
      };
    }

    throw new ConflictException('Concurrent snapshot write conflict');
  }

  private collabJwtKey() {
    const secret = process.env.COLLAB_JWT_SECRET;
    if (!secret) throw new ConflictException('COLLAB_JWT_SECRET is not configured');
    return createSecretKey(Buffer.from(secret));
  }

  private assertServiceToken(token?: string) {
    const expected = process.env.COLLAB_SERVICE_TOKEN;
    if (!expected) throw new ConflictException('COLLAB_SERVICE_TOKEN is not configured');
    if (!token || token !== expected) throw new UnauthorizedException('Invalid collab service token');
  }

  private colorForUser(userId: string) {
    const palette = ['#5B8CFF', '#22C55E', '#F59E0B', '#EF4444', '#0EA5E9', '#A855F7'];
    let hash = 0;
    for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length] ?? '#5B8CFF';
  }

  private validateDoc(doc: Record<string, unknown>) {
    const encoded = JSON.stringify(doc);
    if (encoded.length > MAX_DESCRIPTION_DOC_BYTES) {
      throw new ConflictException('descriptionDoc payload too large');
    }
    if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
      throw new BadRequestException('descriptionDoc must be a valid ProseMirror doc');
    }
  }

  private isSameJson(left: unknown, right: unknown) {
    return this.stableJsonStringify(left) === this.stableJsonStringify(right);
  }

  private stableJsonStringify(value: unknown) {
    return JSON.stringify(this.normalizeJsonValue(value));
  }

  private normalizeJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeJsonValue(item));
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        normalized[key] = this.normalizeJsonValue(record[key]);
      }
      return normalized;
    }
    return value;
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

  private async resolveSnapshotActor(
    tx: Prisma.TransactionClient,
    projectId: string,
    candidateActorUserId?: string,
  ) {
    if (!candidateActorUserId || !candidateActorUserId.trim()) {
      return 'collab-server';
    }
    const userId = candidateActorUserId.trim();
    const membership = await tx.projectMembership.findFirst({
      where: { projectId, userId },
      select: { userId: true },
    });
    return membership?.userId ?? 'collab-server';
  }

  private async syncDescriptionMentions(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    incomingMentionUserIds: string[],
    correlationId: string,
    actor: string,
  ) {
    const validUsers = incomingMentionUserIds.length
      ? await tx.projectMembership.findMany({
          where: { projectId, userId: { in: incomingMentionUserIds } },
          select: { userId: true },
        })
      : [];
    const validSet = new Set(validUsers.map((item) => item.userId));
    const desiredIds = [...new Set(incomingMentionUserIds)].filter((id) => validSet.has(id));

    const existing = await tx.taskMention.findMany({
      where: { taskId, sourceType: 'description', sourceId: '' },
    });
    const existingSet = new Set(existing.map((item) => item.mentionedUserId));

    const toCreate = desiredIds.filter((id) => !existingSet.has(id));
    const toDelete = existing.filter((item) => !desiredIds.includes(item.mentionedUserId));

    for (const userId of toCreate) {
      const created = await tx.taskMention.create({
        data: { taskId, mentionedUserId: userId, sourceType: 'description', sourceId: '' },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.mention.created',
        afterJson: created,
        correlationId,
        outboxType: 'task.mention.created',
        payload: { taskId, mentionedUserId: userId, sourceType: 'description', sourceId: '' },
      });
      await this.notifications.upsertMentionNotification(tx, {
        userId,
        projectId,
        taskId,
        sourceType: 'description',
        sourceId: '',
        actor,
        correlationId,
      });
    }

    for (const mention of toDelete) {
      await tx.taskMention.delete({ where: { id: mention.id } });
      await this.domain.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.mention.deleted',
        beforeJson: mention,
        correlationId,
        outboxType: 'task.mention.deleted',
        payload: {
          taskId,
          mentionedUserId: mention.mentionedUserId,
          sourceType: 'description',
          sourceId: '',
        },
      });
    }
  }
}
