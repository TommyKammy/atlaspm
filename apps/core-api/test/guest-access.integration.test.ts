import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';
import { GuestAccessScopeType, GuestAccessStatus, ProjectRole } from '@prisma/client';

describe('Guest access integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

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
    auth = moduleRef.get(AuthService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
  });

  test('guests are limited to granted projects and lose access after revocation', async () => {
    const ownerId = `guest-owner-${Date.now()}`;
    const ownerToken = await auth.mintDevToken(ownerId, `${ownerId}@example.com`, 'Guest Owner');

    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const grantedProjectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaceId, name: `Guest Granted ${Date.now()}` })
      .expect(201);
    const grantedProjectId = grantedProjectRes.body.id as string;

    const deniedProjectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaceId, name: `Guest Denied ${Date.now()}` })
      .expect(201);
    const deniedProjectId = deniedProjectRes.body.id as string;

    const guestId = `guest-user-${Date.now()}`;
    const guestToken = await auth.mintDevToken(guestId, `${guestId}@example.com`, 'Scoped Guest');

    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${guestToken}`).expect(200);

    const createdBy = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    await prisma.guestAccessGrant.create({
      data: {
        workspaceId,
        userId: guestId,
        projectId: grantedProjectId,
        scopeType: GuestAccessScopeType.PROJECT,
        projectRole: ProjectRole.VIEWER,
        status: GuestAccessStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdByUserId: createdBy.id,
      },
    });

    const guestProjectsRes = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(guestProjectsRes.body.map((project: { id: string }) => project.id)).toContain(grantedProjectId);
    expect(guestProjectsRes.body.map((project: { id: string }) => project.id)).not.toContain(deniedProjectId);

    await request(app.getHttpServer())
      .get(`/projects/${grantedProjectId}/sections`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/projects/${deniedProjectId}/sections`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/users`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(404);

    await prisma.guestAccessGrant.updateMany({
      where: { userId: guestId, projectId: grantedProjectId },
      data: {
        status: GuestAccessStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await request(app.getHttpServer())
      .get(`/projects/${grantedProjectId}/sections`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(403);
  });

  test('guest viewers cannot write and expired grants are removed from visibility', async () => {
    const ownerId = `guest-owner-write-${Date.now()}`;
    const ownerToken = await auth.mintDevToken(ownerId, `${ownerId}@example.com`, 'Guest Owner Write');

    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaceId, name: `Guest Write Denial ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const defaultSectionId = sectionsRes.body[0].id as string;

    const guestId = `guest-viewer-${Date.now()}`;
    const guestToken = await auth.mintDevToken(guestId, `${guestId}@example.com`, 'Guest Viewer');

    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${guestToken}`).expect(200);

    await prisma.guestAccessGrant.create({
      data: {
        workspaceId,
        userId: guestId,
        projectId,
        scopeType: GuestAccessScopeType.PROJECT,
        projectRole: ProjectRole.VIEWER,
        status: GuestAccessStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdByUserId: ownerId,
      },
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ sectionId: defaultSectionId, title: 'Guest should not create this task' })
      .expect(403);

    await prisma.guestAccessGrant.updateMany({
      where: { userId: guestId, projectId },
      data: {
        status: GuestAccessStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const projectsAfterExpiryRes = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(projectsAfterExpiryRes.body.map((project: { id: string }) => project.id)).not.toContain(projectId);

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(403);
  });
});
