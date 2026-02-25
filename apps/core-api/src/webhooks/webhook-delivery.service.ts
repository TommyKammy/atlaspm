import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!this.isWorkerEnabled()) {
      this.logger.log('webhook delivery worker disabled by env');
      return;
    }
    const intervalMs = this.getIntervalMs();
    this.timer = setInterval(() => {
      void this.runScheduledTick();
    }, intervalMs);
    this.timer.unref?.();
    void this.runScheduledTick();
    this.logger.log(`webhook delivery worker started intervalMs=${intervalMs}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processDueEvents(now = new Date()) {
    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        deliveredAt: null,
        deadLetteredAt: null,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: this.getBatchSize(),
    });

    let processed = 0;
    for (const event of candidates) {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          deliveredAt: null,
          deadLetteredAt: null,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        data: { nextRetryAt: new Date(now.getTime() + this.getProcessingLockMs()) },
      });
      if (!claimed.count) continue;

      const delivered = await this.deliverEvent(event.id, now);
      if (delivered) processed += 1;
    }
    return processed;
  }

  private async deliverEvent(eventId: string, now: Date) {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.deliveredAt || event.deadLetteredAt) return false;

    const projectIds = await this.resolveProjectIds(event.payload);
    if (projectIds.length === 0) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { deliveredAt: now, nextRetryAt: null, lastError: null },
      });
      this.logEventInfo('webhook.delivery.skipped_no_project', {
        eventId: event.id,
        correlationId: event.correlationId,
      });
      return true;
    }

    const webhooks = await this.prisma.webhook.findMany({
      where: { active: true, projectId: { in: projectIds } },
      select: { id: true, projectId: true, targetUrl: true },
    });
    if (webhooks.length === 0) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { deliveredAt: now, nextRetryAt: null, lastError: null },
      });
      this.logEventInfo('webhook.delivery.skipped_no_active_webhook', {
        eventId: event.id,
        correlationId: event.correlationId,
        projectIds,
      });
      return true;
    }

    const failures: string[] = [];
    for (const webhook of webhooks) {
      const payload = {
        id: event.id,
        type: event.type,
        correlationId: event.correlationId,
        createdAt: event.createdAt.toISOString(),
        payload: event.payload,
      };
      const body = JSON.stringify(payload);
      const timestamp = `${Math.floor(Date.now() / 1000)}`;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-atlaspm-event-id': event.id,
        'x-atlaspm-event-type': event.type,
        'x-atlaspm-project-id': webhook.projectId,
        'x-atlaspm-correlation-id': event.correlationId,
        'x-atlaspm-timestamp': timestamp,
      };
      const signingSecret = process.env.WEBHOOK_SIGNING_SECRET;
      if (signingSecret) {
        headers['x-atlaspm-signature'] = this.signPayload(signingSecret, timestamp, body);
      }

      try {
        const res = await fetch(webhook.targetUrl, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(this.getRequestTimeoutMs()),
        });
        if (!res.ok) {
          this.logEventError('webhook.delivery.endpoint_failed', {
            eventId: event.id,
            correlationId: event.correlationId,
            webhookId: webhook.id,
            projectId: webhook.projectId,
            targetUrl: webhook.targetUrl,
            statusCode: res.status,
          });
          failures.push(`${webhook.id}:${res.status}`);
        } else {
          this.logEventInfo('webhook.delivery.endpoint_succeeded', {
            eventId: event.id,
            correlationId: event.correlationId,
            webhookId: webhook.id,
            projectId: webhook.projectId,
            targetUrl: webhook.targetUrl,
            statusCode: res.status,
          });
        }
      } catch (error) {
        this.logEventError('webhook.delivery.endpoint_failed', {
          eventId: event.id,
          correlationId: event.correlationId,
          webhookId: webhook.id,
          projectId: webhook.projectId,
          targetUrl: webhook.targetUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        failures.push(`${webhook.id}:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length === 0) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { deliveredAt: now, nextRetryAt: null, lastError: null },
      });
      this.logEventInfo('webhook.delivery.event_delivered', {
        eventId: event.id,
        correlationId: event.correlationId,
        webhookCount: webhooks.length,
      });
      return true;
    }

    const attempts = event.deliveryAttempts + 1;
    const errorText = failures.join('; ').slice(0, 2_000);
    if (attempts >= this.getMaxAttempts()) {
      await this.prisma.$transaction(async (tx) => {
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            deliveryAttempts: attempts,
            deadLetteredAt: now,
            nextRetryAt: null,
            lastError: errorText,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: 'webhook-worker',
            entityType: 'OutboxEvent',
            entityId: event.id,
            action: 'webhook.delivery.dead_lettered',
            beforeJson: {
              deliveryAttempts: event.deliveryAttempts,
              nextRetryAt: event.nextRetryAt,
            },
            afterJson: {
              deliveryAttempts: attempts,
              deadLetteredAt: now,
              error: errorText,
            },
            correlationId: event.correlationId,
          },
        });
      });
      this.logEventError('webhook.delivery.dead_lettered', {
        eventId: event.id,
        correlationId: event.correlationId,
        attempts,
        maxAttempts: this.getMaxAttempts(),
        error: errorText,
      });
      return false;
    }

    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        deliveryAttempts: attempts,
        nextRetryAt: new Date(now.getTime() + this.getBackoffMs(attempts)),
        lastError: errorText,
      },
    });
    this.logEventInfo('webhook.delivery.retry_scheduled', {
      eventId: event.id,
      correlationId: event.correlationId,
      attempts,
      nextRetryAt: new Date(now.getTime() + this.getBackoffMs(attempts)).toISOString(),
      error: errorText,
    });
    return false;
  }

  private async resolveProjectIds(payload: unknown) {
    const projectIds = new Set(this.collectStringValues(payload, 'projectId'));
    if (projectIds.size > 0) return [...projectIds];

    const taskIds = this.collectStringValues(payload, 'taskId');
    if (taskIds.length > 0) {
      const rows = await this.prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { projectId: true },
      });
      for (const row of rows) projectIds.add(row.projectId);
    }

    const sectionIds = this.collectStringValues(payload, 'sectionId');
    if (sectionIds.length > 0) {
      const rows = await this.prisma.section.findMany({
        where: { id: { in: sectionIds } },
        select: { projectId: true },
      });
      for (const row of rows) projectIds.add(row.projectId);
    }

    return [...projectIds];
  }

  private collectStringValues(value: unknown, key: string): string[] {
    const result = new Set<string>();
    const walk = (input: unknown) => {
      if (!input || typeof input !== 'object') return;
      if (Array.isArray(input)) {
        for (const item of input) walk(item);
        return;
      }
      const record = input as Record<string, unknown>;
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        result.add(candidate);
      }
      for (const nested of Object.values(record)) {
        walk(nested);
      }
    };
    walk(value);
    return [...result];
  }

  private signPayload(secret: string, timestamp: string, body: string) {
    const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
    return `v1=${digest}`;
  }

  private async runScheduledTick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const processed = await this.processDueEvents(new Date());
      if (processed > 0) {
        this.logger.log(`webhook delivery processed count=${processed}`);
      }
    } catch (error) {
      this.logger.error(
        `webhook delivery tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.inFlight = false;
    }
  }

  private isWorkerEnabled() {
    return process.env.WEBHOOK_DELIVERY_WORKER_ENABLED === 'true';
  }

  private getIntervalMs() {
    const raw = Number(process.env.WEBHOOK_DELIVERY_INTERVAL_MS ?? 15_000);
    if (Number.isFinite(raw) && raw >= 1_000) return Math.floor(raw);
    return 15_000;
  }

  private getBatchSize() {
    const raw = Number(process.env.WEBHOOK_DELIVERY_BATCH_SIZE ?? 25);
    if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
    return 25;
  }

  private getMaxAttempts() {
    const raw = Number(process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS ?? 5);
    if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
    return 5;
  }

  private getBackoffMs(attempts: number) {
    const base = Number(process.env.WEBHOOK_DELIVERY_BASE_DELAY_MS ?? 5_000);
    const safeBase = Number.isFinite(base) && base >= 0 ? base : 5_000;
    const max = Number(process.env.WEBHOOK_DELIVERY_MAX_DELAY_MS ?? 60_000);
    const safeMax = Number.isFinite(max) && max >= safeBase ? max : 60_000;
    const retryDelay = safeBase * Math.max(1, 2 ** (attempts - 1));
    return Math.min(retryDelay, safeMax);
  }

  private getRequestTimeoutMs() {
    const raw = Number(process.env.WEBHOOK_DELIVERY_REQUEST_TIMEOUT_MS ?? 8_000);
    if (Number.isFinite(raw) && raw >= 500) return Math.floor(raw);
    return 8_000;
  }

  private getProcessingLockMs() {
    const raw = Number(process.env.WEBHOOK_DELIVERY_LOCK_MS ?? 30_000);
    if (Number.isFinite(raw) && raw >= 1_000) return Math.floor(raw);
    return 30_000;
  }

  private logEventInfo(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        level: 'info',
        source: 'core-api',
        event,
        ...payload,
      }),
    );
  }

  private logEventError(event: string, payload: Record<string, unknown>) {
    this.logger.error(
      JSON.stringify({
        level: 'error',
        source: 'core-api',
        event,
        ...payload,
      }),
    );
  }
}
