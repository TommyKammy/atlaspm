import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';

describe('Capacity Integration', () => {
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
    token = await auth.mintDevToken('capacity-test-user', 'capacity-test@example.com', 'Capacity Test User');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  test('capacity schedules and time-off CRUD affect workload availability and enforce auth', async () => {
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

    const workspace = await prisma.workspace.create({
      data: { name: `Capacity Workspace ${Date.now()}` },
    });
    const workspaceId = workspace.id;
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: 'capacity-test-user' } },
      create: { workspaceId, userId: 'capacity-test-user', role: 'WS_ADMIN' },
      update: { role: 'WS_ADMIN' },
    });
    const startedAt = new Date();

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Capacity Project ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = sectionsRes.body.find((section: any) => section.isDefault)?.id as string;

    const assigneeId = `capacity-assignee-${Date.now()}`;
    const assigneeToken = await auth.mintDevToken(assigneeId, `${assigneeId}@example.com`, 'Capacity Assignee');
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${assigneeToken}`).expect(200);

    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
      create: { workspaceId, userId: assigneeId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: assigneeId, role: 'MEMBER' })
      .expect(201);

    const viewerId = `capacity-viewer-${Date.now()}`;
    const viewerToken = await auth.mintDevToken(viewerId, `${viewerId}@example.com`, 'Capacity Viewer');
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${viewerToken}`).expect(200);

    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      create: { workspaceId, userId: viewerId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: viewerId, role: 'VIEWER' })
      .expect(201);

    const workspaceSchedule = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        subjectType: 'WORKSPACE',
        name: 'Workspace default',
        timeZone: 'UTC',
        hoursPerDay: 8,
        daysOfWeek: [1, 2, 3, 4, 5],
      })
      .expect(201);

    expect(workspaceSchedule.body.subjectType).toBe('WORKSPACE');
    expect(workspaceSchedule.body.hoursPerDay).toBe(8);
    const workspaceScheduleId = workspaceSchedule.body.id as string;

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        subjectType: 'WORKSPACE',
        name: 'Duplicate workspace default',
        timeZone: 'UTC',
        hoursPerDay: 8,
        daysOfWeek: [1, 2, 3, 4, 5],
      })
      .expect(409);

    const userSchedule = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        subjectType: 'USER',
        subjectUserId: assigneeId,
        name: 'Reduced week',
        timeZone: 'UTC',
        hoursPerDay: 6,
        daysOfWeek: [1, 2, 3, 4],
      })
      .expect(201);

    const userScheduleId = userSchedule.body.id as string;
    expect(userSchedule.body.subjectUserId).toBe(assigneeId);
    expect(userSchedule.body.daysOfWeek).toEqual([1, 2, 3, 4]);

    const schedules = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(schedules.body).toHaveLength(2);
    expect(schedules.body.map((schedule: any) => schedule.id)).toEqual([
      workspaceScheduleId,
      userScheduleId,
    ]);

    await request(app.getHttpServer())
      .patch(`/capacity-schedules/${userScheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        timeZone: 'Asia/Tokyo',
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/capacity-schedules/${userScheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        hoursPerDay: 5,
        daysOfWeek: [1, 2, 3],
      })
      .expect(200);

    const timeOff = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/time-off`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: assigneeId,
        startDate: '2026-03-09',
        endDate: '2026-03-10',
        minutesPerDay: 300,
        reason: 'Conference',
      })
      .expect(201);

    const timeOffId = timeOff.body.id as string;
    expect(timeOff.body.userId).toBe(assigneeId);
    expect(timeOff.body.minutesPerDay).toBe(300);

    const listedTimeOff = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/time-off?userId=${assigneeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listedTimeOff.body).toHaveLength(1);
    expect(listedTimeOff.body[0].id).toBe(timeOffId);

    await request(app.getHttpServer())
      .patch(`/time-off/${timeOffId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minutesPerDay: 240, reason: 'Vacation' })
      .expect(200);

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Capacity-sensitive task',
        sectionId: defaultSectionId,
        assigneeUserId: assigneeId,
        dueAt: '2026-03-10T12:00:00.000Z',
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/estimate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estimateMinutes: 1200 })
      .expect(200);

    const assigneeWorkload = await request(app.getHttpServer())
      .get('/workload/me?viewMode=effort&startDate=2026-03-08&endDate=2026-03-21')
      .set('Authorization', `Bearer ${assigneeToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    const overloadedWeek = assigneeWorkload.body.overloadAlerts.find((week: any) => week.week === 'Mar 8');
    const workloadWeek = assigneeWorkload.body.weeklyBreakdown.find((week: any) => week.week === 'Mar 8');
    expect(overloadedWeek).toBeTruthy();
    expect(overloadedWeek.capacity).toBe(420);
    expect(overloadedWeek.excess).toBe(780);
    expect(workloadWeek).toBeTruthy();
    expect(workloadWeek.capacityMinutes).toBe(420);
    expect(workloadWeek.capacityTasks).toBe(2);

    const viewerSchedules = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(viewerSchedules.body).toHaveLength(2);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/capacity-schedules`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        subjectType: 'WORKSPACE',
        name: 'Viewer should fail',
        timeZone: 'UTC',
        hoursPerDay: 8,
        daysOfWeek: [1, 2, 3, 4, 5],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/time-off`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        userId: viewerId,
        startDate: '2026-03-12',
        endDate: '2026-03-12',
        minutesPerDay: 480,
      })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/time-off/${timeOffId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const timeOffAfterDelete = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/time-off?userId=${assigneeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(timeOffAfterDelete.body).toHaveLength(0);

    const auditActions = await prisma.auditEvent.findMany({
      where: {
        createdAt: { gte: startedAt },
        entityType: { in: ['CapacitySchedule', 'TimeOffEvent'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(auditActions.map((event) => event.action)).toEqual([
      'capacity_schedule.created',
      'capacity_schedule.created',
      'capacity_schedule.updated',
      'time_off.created',
      'time_off.updated',
      'time_off.deleted',
    ]);

    const outboxTypes = await prisma.outboxEvent.findMany({
      where: {
        createdAt: { gte: startedAt },
        type: {
          in: [
            'capacity_schedule.created',
            'capacity_schedule.updated',
            'time_off.created',
            'time_off.updated',
            'time_off.deleted',
          ],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(outboxTypes.map((event) => event.type)).toEqual([
      'capacity_schedule.created',
      'capacity_schedule.created',
      'capacity_schedule.updated',
      'time_off.created',
      'time_off.updated',
      'time_off.deleted',
    ]);
  });
});
