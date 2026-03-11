import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';
import { ProjectRole } from '@prisma/client';

describe('Guest access management integration', () => {
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

  test('workspace admins can invite, list, and revoke project guests with derived state', async () => {
    const ownerId = `guest-admin-${Date.now()}`;
    const ownerEmail = `${ownerId}@example.com`;
    const ownerToken = await auth.mintDevToken(ownerId, ownerEmail, 'Guest Admin');

    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${ownerToken}`).expect(200);

    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaceId, name: `Guest Access UI ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const inviteEmail = `external-${Date.now()}@vendor.example`;

    const invitationRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/guest-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: inviteEmail, role: ProjectRole.VIEWER, expiresInDays: 3 })
      .expect(201);

    expect(invitationRes.body).toMatchObject({
      invitationId: expect.any(String),
      email: inviteEmail,
      state: 'pending',
      inviteLink: expect.stringContaining('inviteToken='),
      scope: {
        type: 'project',
        workspaceId,
        projectId,
        role: ProjectRole.VIEWER,
      },
    });

    const guestAccessRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/guest-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(guestAccessRes.body).toEqual([
      expect.objectContaining({
        invitationId: invitationRes.body.invitationId,
        email: inviteEmail,
        state: 'pending',
        grantStatus: null,
        projectId,
        workspaceId,
        projectRole: ProjectRole.VIEWER,
        userId: null,
        revokedAt: null,
      }),
    ]);

    const guestId = `guest-collab-${Date.now()}`;
    const guestToken = await auth.mintDevToken(guestId, inviteEmail, 'External Collaborator');
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${guestToken}`).expect(200);

    const acceptedGuestAccessRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/guest-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(acceptedGuestAccessRes.body).toEqual([
      expect.objectContaining({
        invitationId: invitationRes.body.invitationId,
        email: inviteEmail,
        state: 'accepted',
        grantStatus: 'ACTIVE',
        userId: guestId,
        acceptedAt: expect.any(String),
      }),
    ]);

    const revokeRes = await request(app.getHttpServer())
      .delete(`/guest-invitations/${invitationRes.body.invitationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(revokeRes.body).toMatchObject({ ok: true });

    const guestAccessAfterRevokeRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/guest-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(guestAccessAfterRevokeRes.body).toEqual([
      expect.objectContaining({
        invitationId: invitationRes.body.invitationId,
        email: inviteEmail,
        state: 'revoked',
        revokedAt: expect.any(String),
      }),
    ]);
  });
});
