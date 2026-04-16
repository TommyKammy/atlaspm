import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, test, vi } from 'vitest';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import type { CoreIntegrationBindings } from './testkit';

export function registerBackgroundWorkerIntegrationTests({
  app,
  prisma,
  token,
  retentionWorker,
  webhookWorker,
  recurringWorker,
}: CoreIntegrationBindings) {
  test('task retention worker purges expired soft-deleted tasks and keeps recent deletions', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Retention ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const expiredTask = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Retention expired', sectionId: defaultSection.id })
      .expect(201);

    const recentTask = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Retention recent', sectionId: defaultSection.id })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tasks/${expiredTask.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/tasks/${recentTask.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const now = new Date();
    const oldDeletedAt = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    await prisma.task.update({
      where: { id: expiredTask.body.id },
      data: { deletedAt: oldDeletedAt },
    });

    const purgedCount = await retentionWorker.processExpiredDeletes(now);
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    const expiredAfter = await prisma.task.findUnique({ where: { id: expiredTask.body.id } });
    expect(expiredAfter).toBeNull();

    const recentAfter = await prisma.task.findUnique({ where: { id: recentTask.body.id } });
    expect(recentAfter).toBeTruthy();
    expect(Boolean(recentAfter?.deletedAt)).toBe(true);

    const purgeAudit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Task', entityId: expiredTask.body.id, action: 'task.purged' },
      orderBy: { createdAt: 'desc' },
    });
    expect(purgeAudit).toBeTruthy();
    expect(typeof purgeAudit?.correlationId).toBe('string');
    expect(purgeAudit?.correlationId.startsWith('task-retention-')).toBe(true);

    const purgeOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'task.purged' },
      orderBy: { createdAt: 'desc' },
    });
    expect(purgeOutbox).toBeTruthy();
    expect((purgeOutbox?.payload as any)?.taskId).toBe(expiredTask.body.id);
    expect((purgeOutbox?.payload as any)?.projectId).toBe(projectId);
  });

  test('recurring worker generates overdue slots end to end and emits audit/outbox without duplicates', async () => {
    const frozenNow = new Date();
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);

    try {
      const wsRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = wsRes.body[0].id;

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: `Recurring Integration ${Date.now()}` })
        .expect(201);
      const projectId = projectRes.body.id as string;

      const sectionsRes = await request(app.getHttpServer())
        .get(`/projects/${projectId}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const defaultSection =
        sectionsRes.body.find((section: any) => section.isDefault) ?? sectionsRes.body[0];
      expect(defaultSection?.id).toBeTruthy();

      const sourceTask = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Recurring source', sectionId: defaultSection.id })
        .expect(201);

      const todayUtc = new Date(
        Date.UTC(frozenNow.getUTCFullYear(), frozenNow.getUTCMonth(), frozenNow.getUTCDate()),
      );
      const yesterdayUtc = new Date(todayUtc);
      yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
      const tomorrowUtc = new Date(todayUtc);
      tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
      const createCorrelationId = `recurring-rule-${Date.now()}`;

      const ruleRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/recurring-rules`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-correlation-id', createCorrelationId)
        .send({
          title: 'Recurring source',
          description: 'Generated via worker',
          frequency: 'DAILY',
          interval: 1,
          sectionId: defaultSection.id,
          sourceTaskId: sourceTask.body.id,
          startDate: yesterdayUtc.toISOString(),
          endDate: todayUtc.toISOString(),
        })
        .expect(201);
      const ruleId = ruleRes.body.id as string;

      await prisma.recurringRule.update({
        where: { id: ruleId },
        data: { nextScheduledAt: yesterdayUtc },
      });

      const firstRun = await recurringWorker.processDueRecurringTasks();
      expect(firstRun).toEqual({ processed: 2, errors: 0 });

      const secondRun = await recurringWorker.processDueRecurringTasks();
      expect(secondRun).toEqual({ processed: 0, errors: 0 });

      const ruleAfter = await prisma.recurringRule.findUniqueOrThrow({
        where: { id: ruleId },
      });
      expect(ruleAfter.nextScheduledAt?.toISOString()).toBe(tomorrowUtc.toISOString());

      const generations = await prisma.recurringTaskGeneration.findMany({
        where: { ruleId },
        orderBy: { scheduledAt: 'asc' },
      });
      expect(generations).toHaveLength(2);
      expect(generations.map((generation) => generation.scheduledAt.toISOString())).toEqual([
        yesterdayUtc.toISOString(),
        todayUtc.toISOString(),
      ]);
      expect(generations.map((generation) => generation.status)).toEqual([
        'completed',
        'completed',
      ]);

      const generatedTasks = await prisma.task.findMany({
        where: { recurringRuleId: ruleId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          recurringRuleId: true,
        },
      });
      expect(generatedTasks).toHaveLength(2);
      expect(generatedTasks.every((task) => task.recurringRuleId === ruleId)).toBe(true);
      expect(generatedTasks.map((task) => task.title)).toEqual([
        'Recurring source',
        'Recurring source',
      ]);
      expect(generatedTasks.map((task) => task.description)).toEqual([
        'Generated via worker',
        'Generated via worker',
      ]);
      expect(generatedTasks.map((task) => task.status)).toEqual(['TODO', 'TODO']);

      const createdRuleAudit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'RecurringRule',
          entityId: ruleId,
          action: 'recurring_rule.created',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(createdRuleAudit?.correlationId).toBe(createCorrelationId);

      const generationAudit = await prisma.auditEvent.findMany({
        where: {
          entityType: 'RecurringTaskGeneration',
          entityId: { in: generations.map((generation) => generation.id) },
          action: 'recurring_task.generated',
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(generationAudit).toHaveLength(2);

      const recurringOutboxEvents = (
        await prisma.outboxEvent.findMany({
          where: { type: 'recurring_task.generated' },
          orderBy: { createdAt: 'asc' },
        })
      ).filter((event) => (event.payload as any)?.ruleId === ruleId);
      expect(recurringOutboxEvents).toHaveLength(2);
      expect(
        recurringOutboxEvents.map((event) => {
          const scheduledAt = (event.payload as any)?.scheduledAt;
          if (typeof scheduledAt === 'string') {
            return scheduledAt;
          }
          return scheduledAt?.toISOString?.() ?? null;
        }),
      ).toEqual([yesterdayUtc.toISOString(), todayUtc.toISOString()]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('webhook delivery worker retries failed events, signs payloads, and exposes DLQ', async () => {
    await prisma.outboxEvent.deleteMany({});

    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;
    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Webhook Delivery ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const received: Array<{ signature?: string; timestamp?: string; body: string }> = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (req.url === '/ok') {
          received.push({
            signature: req.headers['x-atlaspm-signature']?.toString(),
            timestamp: req.headers['x-atlaspm-timestamp']?.toString(),
            body,
          });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to obtain webhook test server port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const okWebhook = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId, targetUrl: `${baseUrl}/ok` })
        .expect(201);

      await prisma.outboxEvent.deleteMany({});

      const successEvent = await prisma.outboxEvent.create({
        data: {
          type: 'task.updated',
          payload: { projectId, taskId: 'fake-task' },
          correlationId: `webhook-success-${Date.now()}`,
        },
      });

      await webhookWorker.processDueEvents(new Date());
      const delivered = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: successEvent.id },
      });
      expect(Boolean(delivered.deliveredAt)).toBe(true);
      expect(delivered.deadLetteredAt).toBeNull();
      const captured = received.find((entry) => {
        try {
          return JSON.parse(entry.body).id === successEvent.id;
        } catch {
          return false;
        }
      });
      expect(captured).toBeTruthy();
      expect(captured?.signature).toMatch(/^v1=/);
      expect(captured?.timestamp).toBeTruthy();
      const expectedSig = `v1=${createHmac('sha256', 'webhook-test-secret')
        .update(`${captured?.timestamp}.${captured?.body}`, 'utf8')
        .digest('hex')}`;
      expect(captured?.signature).toBe(expectedSig);

      await prisma.webhook.update({
        where: { id: okWebhook.body.id },
        data: { active: false },
      });
      const failWebhook = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId, targetUrl: `${baseUrl}/fail` })
        .expect(201);

      const failingEvent = await prisma.outboxEvent.create({
        data: {
          type: 'task.updated',
          payload: { projectId, taskId: 'fake-task' },
          correlationId: `webhook-fail-${Date.now()}`,
        },
      });

      await webhookWorker.processDueEvents(new Date());
      let failedState = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      expect(failedState.deliveryAttempts).toBe(1);
      expect(failedState.deadLetteredAt).toBeNull();
      expect(failedState.deliveredAt).toBeNull();
      expect(failedState.lastError).toContain('500');

      await prisma.outboxEvent.update({
        where: { id: failingEvent.id },
        data: { nextRetryAt: new Date(Date.now() - 1_000) },
      });
      await webhookWorker.processDueEvents(new Date());
      failedState = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: failingEvent.id } });
      expect(failedState.deliveryAttempts).toBe(2);
      expect(Boolean(failedState.deadLetteredAt)).toBe(true);
      expect(failedState.deliveredAt).toBeNull();

      const dlq = await request(app.getHttpServer())
        .get(`/webhooks/dlq?projectId=${projectId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(dlq.body.some((event: any) => event.id === failingEvent.id)).toBe(true);

      const auth = app.get(AuthService);
      const projectMemberToken = await auth.mintDevToken(
        `webhook-member-${Date.now()}`,
        `webhook-member-${Date.now()}@example.com`,
        'Webhook Member',
      );
      await request(app.getHttpServer())
        .get(`/webhooks/dlq?projectId=${projectId}`)
        .set('Authorization', `Bearer ${projectMemberToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/webhooks/dlq/${failingEvent.id}/retry`)
        .set('Authorization', `Bearer ${projectMemberToken}`)
        .send({ projectId })
        .expect(404);

      await prisma.webhook.update({
        where: { id: okWebhook.body.id },
        data: { active: true },
      });
      await prisma.webhook.update({
        where: { id: failWebhook.body.id },
        data: { active: false },
      });

      const redriveCorrelationId = `webhook-redrive-${Date.now()}`;
      await request(app.getHttpServer())
        .post(`/webhooks/dlq/${failingEvent.id}/retry`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-correlation-id', redriveCorrelationId)
        .send({ projectId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/webhooks/dlq/${failingEvent.id}/retry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId })
        .expect(409);

      const resetState = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      expect(resetState.deadLetteredAt).toBeNull();
      expect(resetState.deliveryAttempts).toBe(0);
      expect(resetState.deliveredAt).toBeNull();

      await webhookWorker.processDueEvents(new Date());
      const redrivenState = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      expect(Boolean(redrivenState.deliveredAt)).toBe(true);
      expect(redrivenState.deadLetteredAt).toBeNull();
      const redriveDelivered = received.find((entry) => {
        try {
          return JSON.parse(entry.body).id === failingEvent.id;
        } catch {
          return false;
        }
      });
      expect(redriveDelivered).toBeTruthy();

      const redriveAudit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'OutboxEvent',
          entityId: failingEvent.id,
          action: 'webhook.delivery.retry_requested',
          correlationId: redriveCorrelationId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(redriveAudit).toBeTruthy();
      const redriveOutbox = await prisma.outboxEvent.findFirst({
        where: {
          type: 'webhook.delivery.retry_requested',
          correlationId: redriveCorrelationId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(redriveOutbox).toBeTruthy();
      expect((redriveOutbox?.payload as any)?.projectId).toBe(projectId);
      expect((redriveOutbox?.payload as any)?.outboxEventId).toBe(failingEvent.id);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
}
