import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';

describe('Goals Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let token: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-integration-secret-123';
    process.env.COLLAB_JWT_SECRET = 'collab-jwt-secret';
    process.env.COLLAB_SERVICE_TOKEN = 'collab-service-secret';
    process.env.COLLAB_SERVER_URL = 'ws://localhost:18080';
    process.env.SEARCH_ENABLED = 'false';
    process.env.REMINDER_WORKER_ENABLED = 'false';
    process.env.TASK_RETENTION_WORKER_ENABLED = 'false';
    process.env.TASK_RETENTION_DAYS = '30';
    process.env.WEBHOOK_DELIVERY_WORKER_ENABLED = 'false';
    process.env.WEBHOOK_DELIVERY_BASE_DELAY_MS = '0';
    process.env.WEBHOOK_DELIVERY_MAX_DELAY_MS = '0';
    process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS = '2';
    process.env.WEBHOOK_SIGNING_SECRET = 'webhook-test-secret';
    process.env.RECURRING_WORKER_ENABLED = 'false';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
    auth = moduleRef.get(AuthService);
    token = await auth.mintDevToken('goals-test-user', 'goals-test@example.com', 'Goals Test User');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  test('goal CRUD and project linkage enforce uniqueness, audit/outbox, and auth', async () => {
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspacesRes.body[0].id as string;
    const testStartedAt = new Date();

    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Goal Project A ${Date.now()}` })
      .expect(201);

    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Goal Project B ${Date.now()}` })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        workspaceId,
        title: `Ship Q2 launch ${Date.now()}`,
        description: 'Cross-project launch objective',
        ownerUserId: 'goals-test-user',
        status: 'ON_TRACK',
        progressPercent: 25,
      })
      .expect(201);

    expect(created.body.workspaceId).toBe(workspaceId);
    expect(created.body.title).toContain('Ship Q2 launch');
    expect(created.body.status).toBe('ON_TRACK');
    expect(created.body.progressPercent).toBe(25);
    expect(created.body.archivedAt).toBeNull();
    const goalId = created.body.id as string;

    const listed = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.some((goal: any) => goal.id === goalId)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ownerUserId: 'goals-test-user',
        status: 'AT_RISK',
        progressPercent: 60,
        title: 'Ship Q2 launch rev 2',
      })
      .expect(200);

    const fetched = await request(app.getHttpServer())
      .get(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.status).toBe('AT_RISK');
    expect(fetched.body.progressPercent).toBe(60);
    expect(fetched.body.title).toBe('Ship Q2 launch rev 2');

    const linkA = await request(app.getHttpServer())
      .post(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectA.body.id })
      .expect(201);

    const linkB = await request(app.getHttpServer())
      .post(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectB.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectB.body.id })
      .expect(409);

    const linkedProjects = await request(app.getHttpServer())
      .get(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(linkedProjects.body.map((link: any) => link.projectId)).toEqual([projectA.body.id, projectB.body.id]);

    await request(app.getHttpServer())
      .delete(`/goals/${goalId}/projects/${projectA.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const linksAfterDelete = await request(app.getHttpServer())
      .get(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(linksAfterDelete.body).toHaveLength(1);
    expect(linksAfterDelete.body[0].projectId).toBe(projectB.body.id);

    const outsiderToken = await auth.mintDevToken(
      `goal-outsider-${Date.now()}`,
      `goal-outsider-${Date.now()}@example.com`,
      'Goal Outsider',
    );
    await request(app.getHttpServer())
      .get(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeAfterArchive = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(activeAfterArchive.body.some((goal: any) => goal.id === goalId)).toBe(false);

    const archivedList = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const archivedGoal = archivedList.body.find((goal: any) => goal.id === goalId);
    expect(Boolean(archivedGoal?.archivedAt)).toBe(true);

    const auditActions = await prisma.auditEvent.findMany({
      where: { entityType: 'Goal', entityId: goalId },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditActions.map((event) => event.action)).toEqual([
      'goal.created',
      'goal.updated',
      'goal.status_rollup_updated',
      'goal.archived',
    ]);

    const outboxTypes = (
      await prisma.outboxEvent.findMany({
        where: {
          createdAt: { gte: testStartedAt },
          type: {
            in: [
              'goal.created',
              'goal.updated',
              'goal.status_rollup_updated',
              'goal.archived',
              'goal.project_linked',
              'goal.project_unlinked',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    )
      .filter((event) => {
        const payload = event.payload as Record<string, unknown>;
        return payload.id === goalId || payload.goalId === goalId;
      })
      .map((event) => event.type);
    expect(outboxTypes).toContain('goal.created');
    expect(outboxTypes).toContain('goal.updated');
    expect(outboxTypes).toContain('goal.archived');
    expect(outboxTypes).toContain('goal.project_linked');
    expect(outboxTypes).toContain('goal.project_unlinked');

    const goalProjectLinks = await prisma.auditEvent.findMany({
      where: {
        entityType: 'GoalProjectLink',
        entityId: { in: [linkA.body.id as string, linkB.body.id as string] },
      },
    });
    expect(goalProjectLinks.map((event) => event.action)).toContain('goal.project_linked');
    expect(goalProjectLinks.map((event) => event.action)).toContain('goal.project_unlinked');
  });

  test('linked project status updates roll up goal progress and expose goal status history', async () => {
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspacesRes.body[0].id as string;

    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Goal Rollup Project A ${Date.now()}` })
      .expect(201);

    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Goal Rollup Project B ${Date.now()}` })
      .expect(201);

    const createdGoal = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        workspaceId,
        title: `Cross-project rollup ${Date.now()}`,
        description: 'Goal should follow linked project health',
        ownerUserId: 'goals-test-user',
      })
      .expect(201);
    const goalId = createdGoal.body.id as string;

    await request(app.getHttpServer())
      .post(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectA.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/goals/${goalId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectB.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectA.body.id}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'ON_TRACK',
        summary: 'Project A is on track.',
      })
      .expect(201);

    const afterFirstRollup = await request(app.getHttpServer())
      .get(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterFirstRollup.body.status).toBe('ON_TRACK');
    expect(afterFirstRollup.body.progressPercent).toBe(50);

    await request(app.getHttpServer())
      .post(`/projects/${projectB.body.id}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'AT_RISK',
        summary: 'Project B is at risk.',
      })
      .expect(201);

    const afterSecondRollup = await request(app.getHttpServer())
      .get(`/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterSecondRollup.body.status).toBe('AT_RISK');
    expect(afterSecondRollup.body.progressPercent).toBe(75);

    const historyRes = await request(app.getHttpServer())
      .get(`/goals/${goalId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(historyRes.body).toEqual([
      expect.objectContaining({
        action: 'goal.created',
        status: 'NOT_STARTED',
        progressPercent: 0,
      }),
      expect.objectContaining({
        action: 'goal.status_rollup_updated',
        status: 'ON_TRACK',
        progressPercent: 50,
      }),
      expect.objectContaining({
        action: 'goal.status_rollup_updated',
        status: 'AT_RISK',
        progressPercent: 75,
      }),
    ]);
  });
});
