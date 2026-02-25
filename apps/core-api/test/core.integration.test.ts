import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ReminderDeliveryService } from '../src/tasks/reminder-delivery.service';
import { WebhookDeliveryService } from '../src/webhooks/webhook-delivery.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';

describe('Core API Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let reminderWorker: ReminderDeliveryService;
  let webhookWorker: WebhookDeliveryService;

  beforeAll(async () => {
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret-change-me';
    process.env.COLLAB_JWT_SECRET = 'collab-jwt-secret';
    process.env.COLLAB_SERVICE_TOKEN = 'collab-service-secret';
    process.env.COLLAB_SERVER_URL = 'ws://localhost:18080';
    process.env.REMINDER_WORKER_ENABLED = 'false';
    process.env.WEBHOOK_DELIVERY_WORKER_ENABLED = 'false';
    process.env.WEBHOOK_DELIVERY_BASE_DELAY_MS = '0';
    process.env.WEBHOOK_DELIVERY_MAX_DELAY_MS = '0';
    process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS = '2';
    process.env.WEBHOOK_SIGNING_SECRET = 'webhook-test-secret';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    reminderWorker = moduleRef.get(ReminderDeliveryService);
    webhookWorker = moduleRef.get(WebhookDeliveryService);

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

    const invitationRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'invited-1@example.com', role: 'WS_MEMBER' })
      .expect(201);
    expect(invitationRes.body.inviteLink).toContain('inviteToken=');

    const invitationsList = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(invitationsList.body.length).toBeGreaterThan(0);

    const usersWithInvited = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/users?status=INVITED`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(usersWithInvited.body.some((u: any) => u.email === 'invited-1@example.com')).toBe(true);

    const auth = app.get(AuthService);
    const invitedToken = await auth.mintDevToken('invited-1', 'invited-1@example.com', 'Invited One');
    const inviteToken = String(invitationRes.body.inviteLink).split('inviteToken=')[1];
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ token: inviteToken })
      .expect(201);

    const invitedWorkspaces = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(200);
    const invitedWorkspace = invitedWorkspaces.body.find((ws: any) => ws.id === workspaceId);
    expect(invitedWorkspace?.role).toBe('WS_MEMBER');

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/users`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ email: 'forbidden-invite@example.com', role: 'WS_MEMBER' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/users/invited-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, status: 'SUSPENDED' })
      .expect(200);
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${invitedToken}`).expect(403);
    await request(app.getHttpServer())
      .patch('/users/invited-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, status: 'ACTIVE' })
      .expect(200);
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${invitedToken}`).expect(200);

    const revokedInvite = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'revoked-1@example.com', role: 'WS_MEMBER' })
      .expect(201);
    const revokedInvitationId = revokedInvite.body.invitationId;
    const revokedToken = String(revokedInvite.body.inviteLink).split('inviteToken=')[1];
    await request(app.getHttpServer())
      .delete(`/invitations/${revokedInvitationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const revokedUserToken = await auth.mintDevToken('revoked-1', 'revoked-1@example.com', 'Revoked One');
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${revokedUserToken}`)
      .send({ token: revokedToken })
      .expect(400);

    const expiredInvite = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'expired-1@example.com', role: 'WS_MEMBER' })
      .expect(201);
    await prisma.invitation.update({
      where: { id: expiredInvite.body.invitationId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredToken = String(expiredInvite.body.inviteLink).split('inviteToken=')[1];
    const expiredUserToken = await auth.mintDevToken('expired-1', 'expired-1@example.com', 'Expired One');
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${expiredUserToken}`)
      .send({ token: expiredToken })
      .expect(400);

    const reissueInvite = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'reissue-1@example.com', role: 'WS_MEMBER' })
      .expect(201);
    const firstInvitationId = reissueInvite.body.invitationId;
    const firstToken = String(reissueInvite.body.inviteLink).split('inviteToken=')[1];

    await request(app.getHttpServer())
      .post(`/invitations/${firstInvitationId}/reissue`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(403);

    const reissuedInvite = await request(app.getHttpServer())
      .post(`/invitations/${firstInvitationId}/reissue`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(reissuedInvite.body.invitationId).not.toBe(firstInvitationId);
    const secondToken = String(reissuedInvite.body.inviteLink).split('inviteToken=')[1];
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);

    const reissueUserToken = await auth.mintDevToken('reissue-1', 'reissue-1@example.com', 'Reissue One');
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${reissueUserToken}`)
      .send({ token: firstToken })
      .expect(400);
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${reissueUserToken}`)
      .send({ token: secondToken })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/invitations/${reissuedInvite.body.invitationId}/reissue`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Integration Project' })
      .expect(201);
    const projectId = projectRes.body.id;

    for (const userId of ['member-1', 'viewer-1', 'project-admin-1']) {
      await prisma.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          email: `${userId}@example.com`,
          displayName: userId,
          status: 'ACTIVE',
        },
        update: {},
      });
      await prisma.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        create: { workspaceId, userId, role: 'WS_MEMBER' },
        update: {},
      });
    }

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'member-1', role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'viewer-1', role: 'VIEWER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'project-admin-1', role: 'ADMIN' })
      .expect(201);

    const membersRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(membersRes.body.some((m: any) => m.user?.id === 'member-1')).toBe(true);

    const memberToken = await auth.mintDevToken('member-1', 'member-1@example.com', 'Member One');
    const viewerToken = await auth.mintDevToken('viewer-1', 'viewer-1@example.com', 'Viewer One');
    const projectAdminToken = await auth.mintDevToken('project-admin-1', 'project-admin-1@example.com', 'Project Admin');
    const outsiderToken = await auth.mintDevToken('outsider-1', 'outsider-1@example.com', 'Outsider One');

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/members/member-1`)
      .set('Authorization', `Bearer ${projectAdminToken}`)
      .send({ role: 'VIEWER' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/members/member-1`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ role: 'MEMBER' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/members/member-1`)
      .set('Authorization', `Bearer ${projectAdminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${projectAdminToken}`)
      .send({ userId: 'member-1', role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'Viewer should not create',
        templateKey: 'progress_to_done',
        enabled: true,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/webhooks')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        projectId,
        targetUrl: 'http://localhost:9999/webhook',
      })
      .expect(403);

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

    const createTaskCorrelationId = `it-task-create-${Date.now()}`;
    const t1 = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', createTaskCorrelationId)
      .send({ title: 'Task 1', sectionId: secA.body.id })
      .expect(201);
    const observedCreateTaskCorrelationId = String(t1.headers['x-correlation-id'] ?? '');
    expect(observedCreateTaskCorrelationId).toBe(createTaskCorrelationId);
    const t2 = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task 2', sectionId: secA.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tasks/${t2.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeTasksAfterDelete = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(activeTasksAfterDelete.body.some((task: any) => task.id === t2.body.id)).toBe(false);

    const deletedTasks = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks?deleted=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(deletedTasks.body.some((task: any) => task.id === t2.body.id)).toBe(true);

    await request(app.getHttpServer())
      .post(`/tasks/${t2.body.id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const activeTasksAfterRestore = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(activeTasksAfterRestore.body.some((task: any) => task.id === t2.body.id)).toBe(true);

    const memberCollabToken = await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/collab-token`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);
    expect(memberCollabToken.body.mode).toBe('readwrite');
    expect(memberCollabToken.body.roomId).toBe(`task:${t1.body.id}:description`);

    const viewerCollabToken = await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/collab-token`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(201);
    expect(viewerCollabToken.body.mode).toBe('readonly');

    await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/collab-token`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const snapshotCorrelationId = `it-snapshot-${Date.now()}`;
    const snapshotTaskId = t2.body.id;

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

    const snapshotSaved = await request(app.getHttpServer())
      .post(`/tasks/${snapshotTaskId}/description/snapshot`)
      .set('x-collab-service-token', 'collab-service-secret')
      .set('x-correlation-id', snapshotCorrelationId)
      .send({
        roomId: `task:${snapshotTaskId}:description`,
        descriptionDoc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'snapshot check' }] }],
        },
        descriptionText: 'snapshot check',
        participants: [{ userId: 'member-1', mode: 'readwrite' }],
        reason: 'idle',
      })
      .expect(201);
    const observedSnapshotCorrelationId = String(snapshotSaved.headers['x-correlation-id'] ?? '');
    expect(observedSnapshotCorrelationId).toBe(snapshotCorrelationId);

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

    const taskDetail = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskDetail.body.descriptionVersion).toBe(0);

    const descriptionSaved = await request(app.getHttpServer())
      .patch(`/tasks/${t1.body.id}/description`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        descriptionDoc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Task detail description for ' },
                { type: 'mention', attrs: { id: 'member-1', label: 'Member One' } },
              ],
            },
          ],
        },
        expectedVersion: 0,
      })
      .expect(200);
    expect(descriptionSaved.body.descriptionVersion).toBe(1);

    const mentionsAfterDescription = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/mentions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      mentionsAfterDescription.body.some(
        (m: any) => m.sourceType === 'description' && m.mentionedUserId === 'member-1',
      ),
    ).toBe(true);

    const memberNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const mentionNotification = memberNotifications.body.find(
      (item: any) => item.type === 'mention' && item.taskId === t1.body.id,
    );
    expect(mentionNotification).toBeTruthy();
    expect(mentionNotification.project?.id).toBe(projectId);

    const unreadCountBeforeRead = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(unreadCountBeforeRead.body.count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/notifications/${mentionNotification.id}/read`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ read: true })
      .expect(201);

    const unreadCountAfterRead = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(unreadCountAfterRead.body.count).toBeLessThan(unreadCountBeforeRead.body.count);

    await request(app.getHttpServer())
      .patch(`/tasks/${t1.body.id}/description`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        descriptionDoc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No mentions now' }] }],
        },
        expectedVersion: 1,
      })
      .expect(200);

    const mentionsAfterRemoval = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/mentions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      mentionsAfterRemoval.body.some(
        (m: any) => m.sourceType === 'description' && m.mentionedUserId === 'member-1',
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .patch(`/tasks/${t1.body.id}/description`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        descriptionDoc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale save' }] }],
        },
        expectedVersion: 0,
      })
      .expect(409);

    const commentCreated = await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Initial comment for @[member-1|Member One]' })
      .expect(201);
    expect(commentCreated.body.body).toContain('@[member-1|Member One]');

    const commentsList = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(commentsList.body.some((c: any) => c.id === commentCreated.body.id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/comments/${commentCreated.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Edited comment' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/comments/${commentCreated.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const onePxPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aY9kAAAAASUVORK5CYII=',
      'base64',
    );
    const attachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'tiny.png', mimeType: 'image/png', sizeBytes: onePxPng.length })
      .expect(201);
    expect(attachmentInit.body.attachmentId).toBeTruthy();
    expect(String(attachmentInit.body.uploadUrl)).toContain('/attachments/');

    await request(app.getHttpServer())
      .post(String(attachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', onePxPng, { filename: 'tiny.png', contentType: 'image/png' })
      .expect(201);

    const attachmentComplete = await request(app.getHttpServer())
      .post(`/tasks/${t1.body.id}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: attachmentInit.body.attachmentId })
      .expect(201);
    expect(attachmentComplete.body.url).toContain(`/public/attachments/${attachmentInit.body.attachmentId}/`);

    const attachments = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(attachments.body.some((a: any) => a.id === attachmentInit.body.attachmentId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/attachments/${attachmentInit.body.attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const attachmentsAfterDelete = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(attachmentsAfterDelete.body.some((a: any) => a.id === attachmentInit.body.attachmentId)).toBe(false);

    const attachmentsIncludingDeleted = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments?includeDeleted=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const deletedAttachment = attachmentsIncludingDeleted.body.find((a: any) => a.id === attachmentInit.body.attachmentId);
    expect(deletedAttachment).toBeTruthy();
    expect(Boolean(deletedAttachment.deletedAt)).toBe(true);

    await request(app.getHttpServer())
      .post(`/attachments/${attachmentInit.body.attachmentId}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const attachmentsAfterRestore = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(attachmentsAfterRestore.body.some((a: any) => a.id === attachmentInit.body.attachmentId)).toBe(true);

    const reminderSet = await request(app.getHttpServer())
      .put(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remindAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(200);
    expect(reminderSet.body.taskId).toBe(t1.body.id);

    const reminderGet = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reminderGet.body.id).toBe(reminderSet.body.id);

    await request(app.getHttpServer())
      .delete(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const reminderAfterClear = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reminderAfterClear.body?.id).toBeUndefined();

    const pastReminder = await request(app.getHttpServer())
      .put(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remindAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);
    expect(pastReminder.body.id).toBeTruthy();

    const deliveredCount = await reminderWorker.processDueReminders(new Date());
    expect(deliveredCount).toBeGreaterThan(0);

    const reminderAfterSend = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Boolean(reminderAfterSend.body?.sentAt)).toBe(true);

    const rulesRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const editableRule = rulesRes.body.find((r: any) => r.templateKey === 'progress_to_done');
    expect(editableRule).toBeTruthy();

    const ruleUpdated = await request(app.getHttpServer())
      .patch(`/rules/${editableRule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Progress to Done (Edited)',
        definition: {
          trigger: 'task.progress.changed',
          conditions: [{ field: 'progressPercent', op: 'eq', value: 100 }],
          actions: [{ type: 'setStatus', status: 'DONE' }, { type: 'setCompletedAtNow' }],
        },
      })
      .expect(200);
    expect(ruleUpdated.body.name).toBe('Progress to Done (Edited)');

    const outbox = await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((e: any) => e.type === 'task.reordered')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.description.updated')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.comment.created')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.comment.updated')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.comment.deleted')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.mention.created')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.mention.deleted')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.attachment.created')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.attachment.deleted')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.attachment.restored')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.reminder.set')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.reminder.cleared')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.reminder.sent')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.deleted')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.restored')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'rule.updated')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'notification.created')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'notification.read')).toBe(true);

    const taskCreateOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'task.created', correlationId: observedCreateTaskCorrelationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(taskCreateOutbox).toBeTruthy();
    expect((taskCreateOutbox?.payload as any)?.id).toBe(t1.body.id);

    const snapshotOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'task.description.snapshot_saved', correlationId: observedSnapshotCorrelationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(snapshotOutbox).toBeTruthy();
    expect((snapshotOutbox?.payload as any)?.taskId).toBe(snapshotTaskId);

    await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const t1Audit = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/audit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      t1Audit.body.some(
        (e: any) => e.action === 'task.created' && e.correlationId === observedCreateTaskCorrelationId,
      ),
    ).toBe(true);
    const t2Audit = await request(app.getHttpServer())
      .get(`/tasks/${t2.body.id}/audit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      t2Audit.body.some(
        (e: any) =>
          e.action === 'task.description.snapshot_saved' &&
          e.correlationId === observedSnapshotCorrelationId,
      ),
    ).toBe(true);

    expect(defaultSection).toBeTruthy();
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
      const delivered = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: successEvent.id } });
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
      await request(app.getHttpServer())
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
      let failedState = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: failingEvent.id } });
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
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
