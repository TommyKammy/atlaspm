import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

describe('Core API Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret-change-me';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.$connect();
    const auth = moduleRef.get(AuthService);
    token = await auth.mintDevToken('test-user', 'test@example.com', 'Test User');
  });

  afterAll(async () => {
    await app.close();
  });

  test('project/member/sections/tasks/rules/reorder/audit/outbox flow', async () => {
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Integration Project' })
      .expect(201);
    const projectId = projectRes.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'member-1', role: 'MEMBER' })
      .expect(201);

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((s: any) => s.isDefault);

    const secA = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' })
      .expect(201);

    const secB = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'B' })
      .expect(201);

    const t1 = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task 1', sectionId: secA.body.id })
      .expect(201);
    const t2 = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task 2', sectionId: secA.body.id })
      .expect(201);

    const p50 = await request(app.getHttpServer())
      .patch(`/tasks/${t1.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ progressPercent: 50, version: t1.body.version })
      .expect(200);
    expect(p50.body.status).toBe('IN_PROGRESS');
    expect(p50.body.completedAt).toBeNull();

    const p100 = await request(app.getHttpServer())
      .patch(`/tasks/${t1.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ progressPercent: 100, version: p50.body.version })
      .expect(200);
    expect(p100.body.status).toBe('DONE');
    expect(p100.body.completedAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/sections/${secA.body.id}/tasks/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ taskId: t1.body.id, beforeTaskId: t2.body.id, afterTaskId: null, expectedVersion: p100.body.version })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/sections/${secB.body.id}/tasks/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ taskId: t1.body.id, beforeTaskId: null, afterTaskId: null })
      .expect(201);

    const grouped = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks?groupBy=section`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const secBGroup = grouped.body.find((g: any) => g.section.id === secB.body.id);
    expect(secBGroup.tasks[0].id).toBe(t1.body.id);

    const taskAudit = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/audit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskAudit.body.length).toBeGreaterThan(0);

    const outbox = await request(app.getHttpServer())
      .get('/outbox')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((e: any) => e.type === 'task.reordered')).toBe(true);

    expect(defaultSection).toBeTruthy();
  });
});
