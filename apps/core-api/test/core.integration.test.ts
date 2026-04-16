import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { setupCoreIntegrationSuite } from './core-integration/testkit';
import { registerAttachmentIntegrationTests } from './core-integration/attachments';
import { registerBackgroundWorkerIntegrationTests } from './core-integration/background-workers';
import { registerBootstrapAndReminderIntegrationTests } from './core-integration/bootstrap-and-reminders';
import { registerNotificationDeliveryIntegrationTests } from './core-integration/notification-delivery';

describe('Core API Integration', () => {
  const { app, prisma, token, reminderWorker, retentionWorker, webhookWorker, recurringWorker } =
    setupCoreIntegrationSuite();

  registerBootstrapAndReminderIntegrationTests({
    app,
    prisma,
    token,
    reminderWorker,
    retentionWorker,
    webhookWorker,
    recurringWorker,
  });
  registerAttachmentIntegrationTests({
    app,
    prisma,
    token,
    reminderWorker,
    retentionWorker,
    webhookWorker,
    recurringWorker,
  });
  registerBackgroundWorkerIntegrationTests({
    app,
    prisma,
    token,
    reminderWorker,
    retentionWorker,
    webhookWorker,
    recurringWorker,
  });
  registerNotificationDeliveryIntegrationTests({
    app,
    prisma,
    token,
    reminderWorker,
    retentionWorker,
    webhookWorker,
    recurringWorker,
  });

  test('project/member/sections/tasks/rules/reorder/audit/outbox flow', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
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

    const autoInviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'invited-auto@example.com', role: 'WS_MEMBER' })
      .expect(201);
    expect(autoInviteRes.body.inviteLink).toContain('inviteToken=');

    const autoInvitedToken = await auth.mintDevToken(
      'invited-auto',
      'invited-auto@example.com',
      'Invited Auto',
    );
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${autoInvitedToken}`)
      .expect(200);
    const autoInvitedWorkspaces = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${autoInvitedToken}`)
      .expect(200);
    expect(autoInvitedWorkspaces.body.some((ws: any) => ws.id === workspaceId)).toBe(true);

    const usersAfterAutoAccept = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/users?query=invited-auto@example.com`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      usersAfterAutoAccept.body.some(
        (u: any) => u.email === 'invited-auto@example.com' && u.status === 'ACTIVE',
      ),
    ).toBe(true);
    expect(
      usersAfterAutoAccept.body.some(
        (u: any) => u.email === 'invited-auto@example.com' && u.status === 'INVITED',
      ),
    ).toBe(false);

    const invitedToken = await auth.mintDevToken(
      'invited-1',
      'invited-1@example.com',
      'Invited One',
    );
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
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch('/users/invited-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, status: 'ACTIVE' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(200);

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
    const revokedUserToken = await auth.mintDevToken(
      'revoked-1',
      'revoked-1@example.com',
      'Revoked One',
    );
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
    const expiredUserToken = await auth.mintDevToken(
      'expired-1',
      'expired-1@example.com',
      'Expired One',
    );
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

    const reissueUserToken = await auth.mintDevToken(
      'reissue-1',
      'reissue-1@example.com',
      'Reissue One',
    );
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
    const projectAdminToken = await auth.mintDevToken(
      'project-admin-1',
      'project-admin-1@example.com',
      'Project Admin',
    );
    const outsiderToken = await auth.mintDevToken(
      'outsider-1',
      'outsider-1@example.com',
      'Outsider One',
    );

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
      .send({ name: 'Alpha Section' })
      .expect(201);

    const secB = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beta Section' })
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

    const milestone = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Milestone 1', sectionId: secA.body.id, type: 'MILESTONE' })
      .expect(201);
    expect(milestone.body.type).toBe('MILESTONE');
    expect(milestone.body.progressPercent).toBe(0);

    const milestoneDone = await request(app.getHttpServer())
      .patch(`/tasks/${milestone.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE', version: milestone.body.version })
      .expect(200);
    expect(milestoneDone.body.progressPercent).toBe(100);
    expect(milestoneDone.body.status).toBe('DONE');

    const milestoneReopened = await request(app.getHttpServer())
      .patch(`/tasks/${milestone.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS', version: milestoneDone.body.version })
      .expect(200);
    expect(milestoneReopened.body.progressPercent).toBe(0);
    expect(milestoneReopened.body.status).toBe('IN_PROGRESS');

    const childTaskCreated = await prisma.task.create({
      data: {
        projectId,
        sectionId: secA.body.id,
        parentId: t2.body.id,
        title: 'Task 2 child',
        position: t2.body.position - 1,
      },
    });

    const sectionSearch = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks?q=${encodeURIComponent('Alpha Section')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(sectionSearch.body.some((task: any) => task.id === t1.body.id)).toBe(true);
    expect(sectionSearch.body.some((task: any) => task.id === t2.body.id)).toBe(true);

    const openSubtasksBeforeComplete = await prisma.task.count({
      where: { parentId: t2.body.id, deletedAt: null, status: { not: 'DONE' } },
    });
    expect(openSubtasksBeforeComplete).toBeGreaterThan(0);

    const completed = await request(app.getHttpServer())
      .post(`/tasks/${t2.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ done: true, version: t2.body.version })
      .expect(409);
    const conflictCode = completed.body?.error?.details?.code ?? completed.body?.code;
    const conflictOpenCount =
      completed.body?.error?.details?.openSubtaskCount ?? completed.body?.openSubtaskCount;
    expect(conflictCode).toBe('INCOMPLETE_SUBTASKS');
    expect(conflictOpenCount).toBeGreaterThan(0);

    const completedForced = await request(app.getHttpServer())
      .post(`/tasks/${t2.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ done: true, version: t2.body.version, force: true })
      .expect(201);
    expect(completedForced.body.status).toBe('DONE');
    expect(completedForced.body.progressPercent).toBe(100);
    expect(Boolean(completedForced.body.completedAt)).toBe(true);

    const reopened = await request(app.getHttpServer())
      .post(`/tasks/${t2.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ done: false, version: completedForced.body.version })
      .expect(201);
    expect(reopened.body.status).toBe('IN_PROGRESS');
    expect(reopened.body.progressPercent).toBe(0);
    expect(reopened.body.completedAt).toBeNull();

    await prisma.task.update({
      where: { id: childTaskCreated.id },
      data: {
        status: 'DONE',
        progressPercent: 100,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });

    const parentCompletedAfterChild = await request(app.getHttpServer())
      .post(`/tasks/${t2.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ done: true, version: reopened.body.version })
      .expect(201);
    expect(parentCompletedAfterChild.body.status).toBe('DONE');

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
        actorUserId: 'member-1',
        reason: 'idle',
      })
      .expect(201);
    const observedSnapshotCorrelationId = String(snapshotSaved.headers['x-correlation-id'] ?? '');
    expect(observedSnapshotCorrelationId).toBe(snapshotCorrelationId);
    expect(snapshotSaved.body.noop).not.toBe(true);

    const snapshotNoopCorrelationId = `it-snapshot-noop-${Date.now()}`;
    const snapshotNoop = await request(app.getHttpServer())
      .post(`/tasks/${snapshotTaskId}/description/snapshot`)
      .set('x-collab-service-token', 'collab-service-secret')
      .set('x-correlation-id', snapshotNoopCorrelationId)
      .send({
        roomId: `task:${snapshotTaskId}:description`,
        descriptionDoc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'snapshot check' }] }],
        },
        descriptionText: 'snapshot check',
        participants: [{ userId: 'member-1', mode: 'readwrite' }],
        actorUserId: 'member-1',
        reason: 'disconnect',
      })
      .expect(201);
    expect(snapshotNoop.body.noop).toBe(true);
    expect(snapshotNoop.body.descriptionVersion).toBe(snapshotSaved.body.descriptionVersion);

    const snapshotRaceCorrelationA = `it-snapshot-race-a-${Date.now()}`;
    const snapshotRaceCorrelationB = `it-snapshot-race-b-${Date.now()}`;
    const snapshotRacePayload = {
      roomId: `task:${snapshotTaskId}:description`,
      descriptionDoc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'snapshot race value' }] }],
      },
      descriptionText: 'snapshot race value',
      participants: [{ userId: 'member-1', mode: 'readwrite' }],
      actorUserId: 'member-1',
      reason: 'idle' as const,
    };
    const [snapshotRaceA, snapshotRaceB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/tasks/${snapshotTaskId}/description/snapshot`)
        .set('x-collab-service-token', 'collab-service-secret')
        .set('x-correlation-id', snapshotRaceCorrelationA)
        .send(snapshotRacePayload),
      request(app.getHttpServer())
        .post(`/tasks/${snapshotTaskId}/description/snapshot`)
        .set('x-collab-service-token', 'collab-service-secret')
        .set('x-correlation-id', snapshotRaceCorrelationB)
        .send(snapshotRacePayload),
    ]);
    expect(snapshotRaceA.status).toBe(201);
    expect(snapshotRaceB.status).toBe(201);
    const raceNoopCount = [snapshotRaceA.body?.noop, snapshotRaceB.body?.noop].filter(
      Boolean,
    ).length;
    expect(raceNoopCount).toBe(1);

    const snapshotInvalidActorCorrelationId = `it-snapshot-invalid-actor-${Date.now()}`;
    const snapshotInvalidActor = await request(app.getHttpServer())
      .post(`/tasks/${snapshotTaskId}/description/snapshot`)
      .set('x-collab-service-token', 'collab-service-secret')
      .set('x-correlation-id', snapshotInvalidActorCorrelationId)
      .send({
        roomId: `task:${snapshotTaskId}:description`,
        descriptionDoc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'snapshot invalid actor' }] },
          ],
        },
        descriptionText: 'snapshot invalid actor',
        participants: [{ userId: 'member-1', mode: 'readwrite' }],
        actorUserId: 'not-project-member',
        reason: 'idle',
      })
      .expect(201);
    expect(snapshotInvalidActor.body.noop).not.toBe(true);

    await request(app.getHttpServer())
      .post(`/sections/${secA.body.id}/tasks/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        taskId: t1.body.id,
        beforeTaskId: t2.body.id,
        afterTaskId: null,
        expectedVersion: p100.body.version,
      })
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
    expect(attachmentComplete.body.url).toContain(
      `/public/attachments/${attachmentInit.body.attachmentId}`,
    );

    const attachments = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(attachments.body.some((a: any) => a.id === attachmentInit.body.attachmentId)).toBe(true);

    const deletedAttachmentRes = await request(app.getHttpServer())
      .delete(`/attachments/${attachmentInit.body.attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(deletedAttachmentRes.body.uploadToken).toBeUndefined();
    expect(deletedAttachmentRes.body.storageKey).toBeUndefined();
    expect(deletedAttachmentRes.body.url).toBeNull();

    const attachmentsAfterDelete = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      attachmentsAfterDelete.body.some((a: any) => a.id === attachmentInit.body.attachmentId),
    ).toBe(false);

    const attachmentsIncludingDeleted = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments?includeDeleted=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const deletedAttachment = attachmentsIncludingDeleted.body.find(
      (a: any) => a.id === attachmentInit.body.attachmentId,
    );
    expect(deletedAttachment).toBeTruthy();
    expect(Boolean(deletedAttachment.deletedAt)).toBe(true);
    expect(deletedAttachment.url).toBeNull();

    const restoredAttachmentRes = await request(app.getHttpServer())
      .post(`/attachments/${attachmentInit.body.attachmentId}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(restoredAttachmentRes.body.uploadToken).toBeUndefined();
    expect(restoredAttachmentRes.body.storageKey).toBeUndefined();
    expect(typeof restoredAttachmentRes.body.url).toBe('string');

    const attachmentsAfterRestore = await request(app.getHttpServer())
      .get(`/tasks/${t1.body.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      attachmentsAfterRestore.body.some((a: any) => a.id === attachmentInit.body.attachmentId),
    ).toBe(true);

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

    const reminderClear = await request(app.getHttpServer())
      .delete(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reminderClear.body.id).toBe(reminderSet.body.id);
    expect(typeof reminderClear.body.deletedAt).toBe('string');

    const reminderClearAgain = await request(app.getHttpServer())
      .delete(`/tasks/${t1.body.id}/reminder`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reminderClearAgain.body).toEqual({ ok: true });

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
    expect(outbox.body.some((e: any) => e.type === 'task.completed')).toBe(true);
    expect(outbox.body.some((e: any) => e.type === 'task.reopened')).toBe(true);
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
      where: {
        type: 'task.description.snapshot_saved',
        correlationId: observedSnapshotCorrelationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(snapshotOutbox).toBeTruthy();
    expect((snapshotOutbox?.payload as any)?.taskId).toBe(snapshotTaskId);
    expect((snapshotOutbox?.payload as any)?.actor).toBe('member-1');
    const snapshotNoopOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'task.description.snapshot_saved', correlationId: snapshotNoopCorrelationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(snapshotNoopOutbox).toBeNull();
    const snapshotRaceOutbox = await prisma.outboxEvent.findMany({
      where: {
        type: 'task.description.snapshot_saved',
        correlationId: { in: [snapshotRaceCorrelationA, snapshotRaceCorrelationB] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(snapshotRaceOutbox).toHaveLength(1);
    const snapshotInvalidOutbox = await prisma.outboxEvent.findFirst({
      where: {
        type: 'task.description.snapshot_saved',
        correlationId: snapshotInvalidActorCorrelationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(snapshotInvalidOutbox).toBeTruthy();
    expect((snapshotInvalidOutbox?.payload as any)?.actor).toBe('collab-server');

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
        (e: any) =>
          e.action === 'task.created' && e.correlationId === observedCreateTaskCorrelationId,
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
          e.correlationId === observedSnapshotCorrelationId &&
          e.actor === 'member-1',
      ),
    ).toBe(true);
    expect(
      t2Audit.body.some(
        (e: any) =>
          e.action === 'task.description.snapshot_saved' &&
          e.correlationId === snapshotNoopCorrelationId,
      ),
    ).toBe(false);
    const snapshotRaceAudit = t2Audit.body.filter(
      (e: any) =>
        e.action === 'task.description.snapshot_saved' &&
        [snapshotRaceCorrelationA, snapshotRaceCorrelationB].includes(e.correlationId),
    );
    expect(snapshotRaceAudit).toHaveLength(1);
    expect(
      t2Audit.body.some(
        (e: any) =>
          e.action === 'task.description.snapshot_saved' &&
          e.correlationId === snapshotInvalidActorCorrelationId &&
          e.actor === 'collab-server',
      ),
    ).toBe(true);

    expect(defaultSection).toBeTruthy();
  }, 15_000);

  test('task and project followers expose follow state, prevent duplicates, and enforce authorization', async () => {
    const auth = app.get(AuthService);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Follower Contract Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;
    expect(projectRes.body.followerCount).toBe(0);
    expect(projectRes.body.isFollowedByCurrentUser).toBe(false);

    const viewerId = `follower-viewer-${projectId}`;
    await prisma.user.upsert({
      where: { id: viewerId },
      create: {
        id: viewerId,
        email: `${viewerId}@example.com`,
        displayName: 'Follower Viewer',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      create: { workspaceId, userId: viewerId, role: 'WS_MEMBER' },
      update: {},
    });
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: viewerId, role: 'VIEWER' })
      .expect(201);

    const viewerToken = await auth.mintDevToken(
      viewerId,
      `${viewerId}@example.com`,
      'Follower Viewer',
    );
    const outsiderId = `follower-outsider-${projectId}`;
    const outsiderToken = await auth.mintDevToken(
      outsiderId,
      `${outsiderId}@example.com`,
      'Follower Outsider',
    );

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: defaultSectionId, title: 'Follower Contract Task' })
      .expect(201);
    const taskId = taskRes.body.id as string;
    expect(taskRes.body.followerCount).toBe(0);
    expect(taskRes.body.isFollowedByCurrentUser).toBe(false);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const projectFollowRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(201);
    expect(projectFollowRes.body.followerCount).toBe(1);
    expect(projectFollowRes.body.isFollowedByCurrentUser).toBe(true);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(409);

    const projectFollowersRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(projectFollowersRes.body.followerCount).toBe(1);
    expect(projectFollowersRes.body.isFollowedByCurrentUser).toBe(true);
    expect(projectFollowersRes.body.followers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          userId: viewerId,
          user: expect.objectContaining({ id: viewerId }),
        }),
      ]),
    );

    const viewerProjectsRes = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(viewerProjectsRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectId,
          followerCount: 1,
          isFollowedByCurrentUser: true,
        }),
      ]),
    );

    const ownerProjectsRes = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ownerProjectsRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectId,
          followerCount: 1,
          isFollowedByCurrentUser: false,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const taskFollowRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(201);
    expect(taskFollowRes.body.followerCount).toBe(1);
    expect(taskFollowRes.body.isFollowedByCurrentUser).toBe(true);

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(409);

    const taskFollowersRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(taskFollowersRes.body.followerCount).toBe(1);
    expect(taskFollowersRes.body.isFollowedByCurrentUser).toBe(true);
    expect(taskFollowersRes.body.followers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId,
          userId: viewerId,
          user: expect.objectContaining({ id: viewerId }),
        }),
      ]),
    );

    const viewerTaskListRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(viewerTaskListRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: taskId,
          followerCount: 1,
          isFollowedByCurrentUser: true,
        }),
      ]),
    );

    const ownerTaskDetailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ownerTaskDetailRes.body.followerCount).toBe(1);
    expect(ownerTaskDetailRes.body.isFollowedByCurrentUser).toBe(false);

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}/followers/me`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/followers/me`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const finalTaskDetailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(finalTaskDetailRes.body.followerCount).toBe(0);
    expect(finalTaskDetailRes.body.isFollowedByCurrentUser).toBe(false);

    const finalProjectFollowersRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(finalProjectFollowersRes.body.followerCount).toBe(0);
    expect(finalProjectFollowersRes.body.isFollowedByCurrentUser).toBe(false);
    expect(finalProjectFollowersRes.body.followers).toEqual([]);

    const followerAuditActions = await prisma.auditEvent.findMany({
      where: {
        action: {
          in: ['project.followed', 'project.unfollowed', 'task.followed', 'task.unfollowed'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(followerAuditActions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'project.followed',
        'project.unfollowed',
        'task.followed',
        'task.unfollowed',
      ]),
    );

    const followerOutboxEvents = await prisma.outboxEvent.findMany({
      where: {
        type: {
          in: ['project.followed', 'project.unfollowed', 'task.followed', 'task.unfollowed'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(followerOutboxEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'project.followed',
        'project.unfollowed',
        'task.followed',
        'task.unfollowed',
      ]),
    );
  });

  test('task comments and project status updates notify followers without duplicate delivery', async () => {
    const auth = app.get(AuthService);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Follower Notifications ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const followerOnlyId = `notif-follower-only-${projectId}`;
    const followerOnlyEmail = `${followerOnlyId}@example.com`;
    await prisma.user.upsert({
      where: { id: followerOnlyId },
      create: {
        id: followerOnlyId,
        email: followerOnlyEmail,
        displayName: 'Follower Only',
        status: 'ACTIVE',
      },
      update: {
        email: followerOnlyEmail,
        displayName: 'Follower Only',
        status: 'ACTIVE',
      },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: followerOnlyId } },
      create: { workspaceId, userId: followerOnlyId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: followerOnlyId } },
      create: { projectId, userId: followerOnlyId, role: 'VIEWER' },
      update: { role: 'VIEWER' },
    });

    const assigneeFollowerId = `notif-assignee-follower-${projectId}`;
    const assigneeFollowerEmail = `${assigneeFollowerId}@example.com`;
    await prisma.user.upsert({
      where: { id: assigneeFollowerId },
      create: {
        id: assigneeFollowerId,
        email: assigneeFollowerEmail,
        displayName: 'Assignee Follower',
        status: 'ACTIVE',
      },
      update: {
        email: assigneeFollowerEmail,
        displayName: 'Assignee Follower',
        status: 'ACTIVE',
      },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: assigneeFollowerId } },
      create: { workspaceId, userId: assigneeFollowerId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: assigneeFollowerId } },
      create: { projectId, userId: assigneeFollowerId, role: 'MEMBER' },
      update: { role: 'MEMBER' },
    });

    const followerOnlyToken = await auth.mintDevToken(
      followerOnlyId,
      followerOnlyEmail,
      'Follower Only',
    );
    const assigneeFollowerToken = await auth.mintDevToken(
      assigneeFollowerId,
      assigneeFollowerEmail,
      'Assignee Follower',
    );

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSectionId,
        title: 'Follower notification task',
        assigneeUserId: assigneeFollowerId,
      })
      .expect(201);
    const taskId = taskRes.body.id as string;
    const nextStatus = taskRes.body.status === 'TODO' ? 'IN_PROGRESS' : 'DONE';

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/followers`)
      .set('Authorization', `Bearer ${assigneeFollowerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/followers`)
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(201);

    const commentRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Follower fan-out comment' })
      .expect(201);

    const followerOnlyNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(200);
    const followerOnlyCommentNotifications = followerOnlyNotifications.body.filter(
      (item: any) =>
        item.type === 'comment' && item.sourceType === 'comment' && item.taskId === taskId,
    );
    expect(followerOnlyCommentNotifications).toHaveLength(1);
    expect(followerOnlyCommentNotifications[0]).toMatchObject({
      taskId,
      sourceId: commentRes.body.id,
      project: { id: projectId },
      triggeredBy: { id: 'test-user' },
    });

    const assigneeFollowerNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${assigneeFollowerToken}`)
      .expect(200);
    const assigneeFollowerCommentNotifications = assigneeFollowerNotifications.body.filter(
      (item: any) =>
        item.type === 'comment' && item.sourceType === 'comment' && item.taskId === taskId,
    );
    expect(assigneeFollowerCommentNotifications).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dueAt: '2026-04-15' })
      .expect(200);

    const followerOnlyNotificationsAfterDueDate = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(200);
    const followerOnlyDueDateNotifications = followerOnlyNotificationsAfterDueDate.body.filter(
      (item: any) =>
        item.type === 'due_date' && item.sourceType === 'task' && item.taskId === taskId,
    );
    expect(followerOnlyDueDateNotifications).toHaveLength(1);

    const assigneeFollowerNotificationsAfterDueDate = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${assigneeFollowerToken}`)
      .expect(200);
    const assigneeFollowerDueDateNotifications =
      assigneeFollowerNotificationsAfterDueDate.body.filter(
        (item: any) =>
          item.type === 'due_date' && item.sourceType === 'task' && item.taskId === taskId,
      );
    expect(assigneeFollowerDueDateNotifications).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: nextStatus })
      .expect(200);

    const followerOnlyNotificationsAfterStatusChange = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(200);
    const followerOnlyStatusNotifications = followerOnlyNotificationsAfterStatusChange.body.filter(
      (item: any) => item.type === 'status' && item.sourceType === 'task' && item.taskId === taskId,
    );
    expect(followerOnlyStatusNotifications).toHaveLength(1);

    const assigneeFollowerNotificationsAfterStatusChange = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${assigneeFollowerToken}`)
      .expect(200);
    const assigneeFollowerStatusNotifications =
      assigneeFollowerNotificationsAfterStatusChange.body.filter(
        (item: any) =>
          item.type === 'status' && item.sourceType === 'task' && item.taskId === taskId,
      );
    expect(assigneeFollowerStatusNotifications).toHaveLength(1);

    const statusUpdateRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'ON_TRACK',
        summary: 'Follower-only users should receive this project update.',
        blockers: [],
        nextSteps: ['Confirm follower inbox routing.'],
      })
      .expect(201);

    const followerOnlyNotificationsAfterProjectUpdate = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${followerOnlyToken}`)
      .expect(200);
    const followerProjectUpdateNotifications =
      followerOnlyNotificationsAfterProjectUpdate.body.filter(
        (item: any) =>
          item.type === 'status' &&
          item.sourceType === 'project_status_update' &&
          item.project?.id === projectId,
      );
    expect(followerProjectUpdateNotifications).toHaveLength(1);
    expect(followerProjectUpdateNotifications[0]).toMatchObject({
      sourceId: statusUpdateRes.body.id,
      statusUpdate: {
        id: statusUpdateRes.body.id,
        summary: 'Follower-only users should receive this project update.',
      },
      triggeredBy: { id: 'test-user' },
    });
  });

  test('GET /projects/:id/audit includes project-scoped member and rule changes', async () => {
    const auth = app.get(AuthService);

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Audit Scope ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const invitedUserId = `project-audit-member-${Date.now()}`;
    const invitedEmail = `${invitedUserId}@example.com`;
    const inviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: invitedEmail, role: 'WS_MEMBER' })
      .expect(201);
    const invitedToken = await auth.mintDevToken(
      invitedUserId,
      invitedEmail,
      'Project Audit Member',
    );
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ token: String(inviteRes.body.inviteLink).split('inviteToken=')[1] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: invitedUserId, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/members/${invitedUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'VIEWER' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Audit Rule ${Date.now()}`,
        templateKey: `custom_audit_scope_${Date.now()}`,
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'AND',
          conditions: [{ field: 'progressPercent', op: 'gte', value: 60 }],
          actions: [{ type: 'setStatus', status: 'DONE' }],
        },
      })
      .expect(201);

    const auditRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/audit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(auditRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'Project',
          action: 'project.created',
          entityId: projectId,
        }),
        expect.objectContaining({
          entityType: 'ProjectMembership',
          action: 'project.member.added',
        }),
        expect.objectContaining({
          entityType: 'ProjectMembership',
          action: 'project.member.role_changed',
        }),
        expect.objectContaining({ entityType: 'Rule', action: 'rule.created' }),
      ]),
    );
  });

  test('custom field definition APIs enforce RBAC and emit audit/outbox', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Custom Field ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const auth = app.get(AuthService);
    const memberId = `cf-member-${Date.now()}`;
    const viewerId = `cf-viewer-${Date.now()}`;
    for (const userId of [memberId, viewerId]) {
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
      .send({ userId: memberId, role: 'MEMBER' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: viewerId, role: 'VIEWER' })
      .expect(201);

    const memberToken = await auth.mintDevToken(memberId, `${memberId}@example.com`, 'CF Member');
    const viewerToken = await auth.mintDevToken(viewerId, `${viewerId}@example.com`, 'CF Viewer');

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Blocked Create', type: 'TEXT' })
      .expect(403);

    const createRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Customer Tier',
        type: 'SELECT',
        required: true,
        options: [
          { label: 'Gold', value: 'gold' },
          { label: 'Silver', value: 'silver' },
        ],
      })
      .expect(201);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.options.length).toBe(2);
    const fieldId = createRes.body.id as string;

    const viewerList = await request(app.getHttpServer())
      .get(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(viewerList.body.some((field: any) => field.id === fieldId)).toBe(true);

    const patchRes = await request(app.getHttpServer())
      .patch(`/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Customer Segment',
        options: [
          { label: 'Enterprise', value: 'enterprise' },
          { label: 'SMB', value: 'smb' },
        ],
      })
      .expect(200);
    expect(patchRes.body.name).toBe('Customer Segment');
    expect(patchRes.body.options.map((option: any) => option.value)).toEqual(['enterprise', 'smb']);

    const enterpriseOptionId = patchRes.body.options.find(
      (option: any) => option.value === 'enterprise',
    )?.id;
    const secondPatchRes = await request(app.getHttpServer())
      .patch(`/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Customer Segment Updated',
        options: [
          { label: 'Enterprise+', value: 'enterprise' },
          { label: 'SMB', value: 'smb' },
          { label: 'Startup', value: 'startup' },
        ],
      })
      .expect(200);
    expect(secondPatchRes.body.name).toBe('Customer Segment Updated');
    expect(secondPatchRes.body.options.map((option: any) => option.value)).toEqual([
      'enterprise',
      'smb',
      'startup',
    ]);
    expect(
      secondPatchRes.body.options.find((option: any) => option.value === 'enterprise')?.id,
    ).toBe(enterpriseOptionId);

    await request(app.getHttpServer())
      .delete(`/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const activeList = await request(app.getHttpServer())
      .get(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(activeList.body.some((field: any) => field.id === fieldId)).toBe(false);

    const includeArchivedList = await request(app.getHttpServer())
      .get(`/projects/${projectId}/custom-fields?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const archivedField = includeArchivedList.body.find((field: any) => field.id === fieldId);
    expect(archivedField).toBeTruthy();
    expect(Boolean(archivedField.archivedAt)).toBe(true);

    const customFieldAudit = await prisma.auditEvent.findMany({
      where: { entityType: 'CustomFieldDefinition', entityId: fieldId },
      orderBy: { createdAt: 'asc' },
    });
    expect(customFieldAudit.map((event) => event.action)).toEqual([
      'custom_field.created',
      'custom_field.updated',
      'custom_field.updated',
      'custom_field.archived',
    ]);

    const outbox = await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((event: any) => event.type === 'custom_field.created')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'custom_field.updated')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'custom_field.archived')).toBe(true);
  }, 15_000);

  test('task custom field value APIs enforce optimistic locking and expose values on task responses', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Task Custom Values ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const textField = await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Customer Note', type: 'TEXT' })
      .expect(201);

    const selectField = await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Customer Segment',
        type: 'SELECT',
        options: [
          { label: 'Enterprise', value: 'enterprise' },
          { label: 'SMB', value: 'smb' },
        ],
      })
      .expect(201);

    const scoreField = await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Priority Score', type: 'NUMBER' })
      .expect(201);

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task with custom values', sectionId: defaultSection.id })
      .expect(201);
    const taskId = taskRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: taskRes.body.version + 1,
        values: [{ fieldId: textField.body.id, value: 'stale write' }],
      })
      .expect(409);

    const patchRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: taskRes.body.version,
        values: [
          { fieldId: textField.body.id, value: 'important account' },
          { fieldId: selectField.body.id, value: selectField.body.options[0].id },
          { fieldId: scoreField.body.id, value: 82 },
        ],
      })
      .expect(200);
    expect(patchRes.body.version).toBe(taskRes.body.version + 1);
    expect(patchRes.body.customFieldValues.length).toBe(3);

    const taskDetail = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      taskDetail.body.customFieldValues.some((value: any) => value.fieldId === textField.body.id),
    ).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const listedTask = listRes.body.find((item: any) => item.id === taskId);
    expect(listedTask).toBeTruthy();
    expect(
      listedTask.customFieldValues.some((value: any) => value.fieldId === selectField.body.id),
    ).toBe(true);

    const filteredBySelect = await request(app.getHttpServer())
      .get(
        `/projects/${projectId}/tasks?customFieldFilters=${encodeURIComponent(
          JSON.stringify([
            {
              fieldId: selectField.body.id,
              type: 'SELECT',
              optionIds: [selectField.body.options[0].id],
            },
          ]),
        )}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(filteredBySelect.body.some((item: any) => item.id === taskId)).toBe(true);

    const sortedByScore = await request(app.getHttpServer())
      .get(
        `/projects/${projectId}/tasks?customFieldSortFieldId=${scoreField.body.id}&customFieldSortOrder=desc`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(sortedByScore.body[0].id).toBe(taskId);

    const searchByCustomField = await request(app.getHttpServer())
      .get(`/search?q=${encodeURIComponent('important account')}&projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(searchByCustomField.body.hits.some((hit: any) => hit.objectID === taskId)).toBe(true);

    const customRule = await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'High score moves to blocked',
        templateKey: 'custom_field_score_gate',
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'OR',
          conditions: [
            { field: 'progressPercent', op: 'eq', value: 100 },
            { field: 'customFieldNumber', fieldId: scoreField.body.id, op: 'gt', value: 80 },
          ],
          actions: [{ type: 'setStatus', status: 'BLOCKED' }],
        },
      })
      .expect(201);
    expect(customRule.body.id).toBeTruthy();
    expect(customRule.body.definition?.logicalOperator).toBe('OR');

    const andRule = await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Only done when all conditions match',
        templateKey: 'custom_field_score_gate_and',
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'AND',
          conditions: [
            { field: 'progressPercent', op: 'eq', value: 100 },
            { field: 'customFieldNumber', fieldId: scoreField.body.id, op: 'gt', value: 80 },
          ],
          actions: [{ type: 'setStatus', status: 'DONE' }],
        },
      })
      .expect(201);
    expect(andRule.body.id).toBeTruthy();
    expect(andRule.body.definition?.logicalOperator).toBe('AND');

    const patchTriggerRule = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: patchRes.body.version,
        values: [{ fieldId: scoreField.body.id, value: 90 }],
      })
      .expect(200);
    expect(patchTriggerRule.body.status).toBe('BLOCKED');

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid empty conditions',
        templateKey: 'custom_field_score_gate',
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'AND',
          conditions: [],
          actions: [{ type: 'setStatus', status: 'BLOCKED' }],
        },
      })
      .expect(400);

    const customFieldAudit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Task', entityId: taskId, action: 'task.custom_fields.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(customFieldAudit).toBeTruthy();

    const outbox = await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((event: any) => event.type === 'task.custom_fields.updated')).toBe(
      true,
    );
  }, 15_000);

  test('time tracking APIs update spent/estimate and reject logs on soft-deleted tasks', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Time Tracking ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Time tracked task', sectionId: defaultSection.id })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const firstLog = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/time-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 30, description: 'Initial log' })
      .expect(201);
    expect(firstLog.body.minutes).toBe(30);

    const taskAfterCreate = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskAfterCreate.body.spentMinutes).toBe(30);

    await request(app.getHttpServer())
      .patch(`/time-logs/${firstLog.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 45, description: 'Adjusted log' })
      .expect(200);

    const taskAfterUpdate = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskAfterUpdate.body.spentMinutes).toBe(45);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/estimate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estimateMinutes: 120 })
      .expect(200);

    const agg = await request(app.getHttpServer())
      .get(`/projects/${projectId}/time-tracking/aggregation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(agg.body.totalEstimateMinutes).toBe(120);
    expect(agg.body.totalSpentMinutes).toBe(45);
    expect(
      agg.body.byTask.some((item: any) => item.taskId === taskId && item.totalMinutes === 45),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/time-logs/${firstLog.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const taskAfterDelete = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskAfterDelete.body.spentMinutes).toBe(0);

    const secondLog = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/time-logs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 10, description: 'Log before task soft delete' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/time-logs/${secondLog.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 11 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/time-logs/${secondLog.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const outbox = await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((event: any) => event.type === 'time_log.created')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'time_log.updated')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'time_log.deleted')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'task.estimate.updated')).toBe(true);
  });

  test('workload effort mode accepts numeric query params and enforces supported period list', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id as string;

    const effortRes = await request(app.getHttpServer())
      .get('/workload/me?viewMode=effort&periodWeeks=8')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    expect(Array.isArray(effortRes.body.weeklyBreakdown)).toBe(true);
    expect(effortRes.body.weeklyBreakdown.length).toBe(8);
    expect(typeof effortRes.body.weeklyBreakdown[0]?.capacityMinutes).toBe('number');
    expect(typeof effortRes.body.weeklyBreakdown[0]?.capacityTasks).toBe('number');
    expect(typeof effortRes.body.totalEstimateMinutes).toBe('number');
    expect(typeof effortRes.body.totalSpentMinutes).toBe('number');

    await request(app.getHttpServer())
      .get('/workload/me?viewMode=effort&periodWeeks=3')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .expect(400);
  });

  test('task project links support multi-home with primary switch and auth checks', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id as string;

    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Multi-home A ${Date.now()}` })
      .expect(201);
    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Multi-home B ${Date.now()}` })
      .expect(201);

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectA.body.id}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectA.body.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Multi-home Task', sectionId: defaultSection.id })
      .expect(201);
    const taskId = taskRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: projectB.body.id })
      .expect(201);

    const linksAfterAdd = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(linksAfterAdd.body.length).toBe(2);
    expect(
      linksAfterAdd.body.some((link: any) => link.projectId === projectA.body.id && link.isPrimary),
    ).toBe(true);
    expect(
      linksAfterAdd.body.some(
        (link: any) => link.projectId === projectB.body.id && !link.isPrimary,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/projects/${projectB.body.id}/primary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const taskAfterSwitch = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taskAfterSwitch.body.projectId).toBe(projectB.body.id);

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}/projects/${projectA.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const linksAfterDelete = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(linksAfterDelete.body.length).toBe(1);
    expect(linksAfterDelete.body[0].projectId).toBe(projectB.body.id);
    expect(linksAfterDelete.body[0].isPrimary).toBe(true);

    const auth = app.get(AuthService);
    const outsiderToken = await auth.mintDevToken(
      `multi-home-outsider-${Date.now()}`,
      `multi-home-outsider-${Date.now()}@example.com`,
      'Multi-home Outsider',
    );
    await request(app.getHttpServer())
      .get(`/tasks/${taskId}/projects`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const outbox = await request(app.getHttpServer())
      .get(`/outbox?projectId=${projectB.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(outbox.body.some((event: any) => event.type === 'task.project_linked')).toBe(true);
    expect(outbox.body.some((event: any) => event.type === 'task.primary_project_changed')).toBe(
      true,
    );
  });

  test('DELETE /rules/:id deletes custom rules with audit/outbox and returns 404 for missing rules', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Rule Delete Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const customRule = await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Custom rule to delete',
        templateKey: 'custom_delete_test',
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'AND',
          conditions: [{ field: 'progressPercent', op: 'gte', value: 50 }],
          actions: [{ type: 'setStatus', status: 'IN_PROGRESS' }],
        },
      })
      .expect(201);
    const customRuleId = customRule.body.id;

    await request(app.getHttpServer())
      .delete(`/rules/${customRuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const deletedRule = await prisma.rule.findUnique({ where: { id: customRuleId } });
    expect(deletedRule).toBeNull();

    const deleteAudit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Rule', entityId: customRuleId, action: 'rule.deleted' },
      orderBy: { createdAt: 'desc' },
    });
    expect(deleteAudit).toBeTruthy();
    expect(deleteAudit?.beforeJson).toBeTruthy();
    expect(deleteAudit?.afterJson).toBeNull();

    const recentRuleDeletedOutboxEvents = await prisma.outboxEvent.findMany({
      where: { type: 'rule.deleted' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const deleteOutbox = recentRuleDeletedOutboxEvents.find(
      (event) => (event.payload as any)?.id === customRuleId,
    );
    expect(deleteOutbox).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/rules/non-existent-rule-id`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  test('POST /projects/:id/rules creates rule with audit/outbox events', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Rule Create Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const ruleName = `Test Rule ${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: ruleName,
        templateKey: `custom_create_test_${Date.now()}`,
        enabled: true,
        definition: {
          trigger: 'task.progress.changed',
          logicalOperator: 'AND',
          conditions: [{ field: 'progressPercent', op: 'gte', value: 75 }],
          actions: [{ type: 'setStatus', status: 'DONE' }],
        },
      })
      .expect(201);

    const createdRule = createRes.body;
    expect(createdRule.id).toBeTruthy();
    expect(createdRule.name).toBe(ruleName);
    expect(createdRule.projectId).toBe(projectId);
    expect(createdRule.enabled).toBe(true);
    expect(createdRule.definition).toMatchObject({
      trigger: 'task.progress.changed',
      logicalOperator: 'AND',
      conditions: [{ field: 'progressPercent', op: 'gte', value: 75 }],
      actions: [{ type: 'setStatus', status: 'DONE' }],
    });

    const createAudit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Rule', entityId: createdRule.id, action: 'rule.created' },
      orderBy: { createdAt: 'desc' },
    });
    expect(createAudit).toBeTruthy();
    expect(createAudit?.beforeJson).toBeNull();
    expect(createAudit?.afterJson).toBeTruthy();
    expect((createAudit?.afterJson as any)?.name).toBe(ruleName);

    const recentRuleCreatedOutboxEvents = await prisma.outboxEvent.findMany({
      where: { type: 'rule.created' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const createOutbox = recentRuleCreatedOutboxEvents.find(
      (event) => (event.payload as any)?.id === createdRule.id,
    );
    expect(createOutbox).toBeTruthy();
    expect((createOutbox?.payload as any)?.name).toBe(ruleName);
    expect((createOutbox?.payload as any)?.projectId).toBe(projectId);
  });

  test('DELETE /rules/:id returns 409 for template-backed rules', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Template Guard Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const rules = await request(app.getHttpServer())
      .get(`/projects/${projectId}/rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const templateRule = rules.body.find(
      (r: any) =>
        r.templateKey === 'progress_to_done' || r.templateKey === 'progress_to_in_progress',
    );
    expect(templateRule).toBeTruthy();
    const templateRuleId = templateRule.id;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/rules/${templateRuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(deleteRes.body).toMatchObject({
      code: 'TEMPLATE_RULE_DELETION_FORBIDDEN',
      message: expect.stringContaining('Template-backed rules cannot be deleted'),
    });

    const ruleStillExists = await prisma.rule.findUnique({ where: { id: templateRuleId } });
    expect(ruleStillExists).toBeTruthy();
  });

  test('POST /projects/:id/tasks rejects invalid date range', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Date Range Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with invalid date range',
        startAt: futureDate.toISOString(),
        dueAt: pastDate.toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      message: expect.stringContaining('startAt must be before or equal to dueAt'),
    });
  });

  test('POST /projects/:id/tasks accepts valid date range', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Valid Date Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const createStart = new Date();
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with valid date range',
        startAt: startDate.toISOString(),
        dueAt: dueDate.toISOString(),
      })
      .expect(201);

    expect(res.body.startAt).toBeTruthy();
    expect(res.body.dueAt).toBeTruthy();

    const taskId = res.body.id as string;
    const dateCreateAudit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Task', entityId: taskId, action: 'task.created' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dateCreateAudit).toBeTruthy();
    expect((dateCreateAudit?.afterJson as any)?.startAt).toBeTruthy();
    expect((dateCreateAudit?.afterJson as any)?.dueAt).toBeTruthy();

    const dateCreateOutboxEvents = await prisma.outboxEvent.findMany({
      where: { type: 'task.created', createdAt: { gte: createStart } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const dateCreateOutbox = dateCreateOutboxEvents.find(
      (event) => (event.payload as any)?.id === taskId,
    );
    expect(dateCreateOutbox).toBeTruthy();
    expect((dateCreateOutbox?.payload as any)?.startAt).toBeTruthy();
    expect((dateCreateOutbox?.payload as any)?.dueAt).toBeTruthy();
  });

  test('GET /projects/:id/tasks rejects unsupported due date query values', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Task List Date Filter Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with due date',
        sectionId: defaultSectionId,
        dueAt: '2026-03-12T00:00:00.000Z',
      })
      .expect(201);

    const missingTimezoneRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks?dueFrom=${encodeURIComponent('2026-03-10T12:30:00')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(missingTimezoneRes.body).toMatchObject({
      code: 'INVALID_DATE_FORMAT',
      message: expect.stringContaining('dueFrom'),
    });

    const invalidOffsetRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks?dueTo=${encodeURIComponent('2026-03-12T23:59:59+14:30')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(invalidOffsetRes.body).toMatchObject({
      code: 'INVALID_DATE_FORMAT',
      message: expect.stringContaining('dueTo'),
    });
  });

  test('GET /projects/:id/tasks accepts explicit due date query formats', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Task List Valid Date Filter Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    const includedTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Included due date task',
        sectionId: defaultSectionId,
        dueAt: '2026-03-12T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Excluded due date task',
        sectionId: defaultSectionId,
        dueAt: '2026-03-08T00:00:00.000Z',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(
        `/projects/${projectId}/tasks?dueFrom=${encodeURIComponent('2026-03-10')}&dueTo=${encodeURIComponent(
          '2026-03-12T23:59:59Z',
        )}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.map((task: { id: string }) => task.id)).toContain(includedTaskRes.body.id);
    expect(res.body).toHaveLength(1);
  });

  test('schedule APIs normalize mixed timestamps to UTC date-only persistence', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Date Only Normalization ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const createRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Date only normalization task',
        sectionId: defaultSection.id,
        startAt: '2026-03-10T23:00:00.000Z',
        dueAt: '2026-03-12T05:30:00.000Z',
        baselineStartAt: '2026-03-09T18:45:00.000Z',
        baselineDueAt: '2026-03-11T22:15:00.000Z',
      })
      .expect(201);

    expect(createRes.body.startAt).toBe('2026-03-10T00:00:00.000Z');
    expect(createRes.body.dueAt).toBe('2026-03-12T00:00:00.000Z');
    expect(createRes.body.baselineStartAt).toBe('2026-03-09T00:00:00.000Z');
    expect(createRes.body.baselineDueAt).toBe('2026-03-11T00:00:00.000Z');

    const taskId = createRes.body.id as string;

    const patchRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dueAt: '2026-03-14T18:20:00.000Z',
        baselineDueAt: '2026-03-15T03:40:00.000Z',
        version: createRes.body.version,
      })
      .expect(200);

    expect(patchRes.body.dueAt).toBe('2026-03-14T00:00:00.000Z');
    expect(patchRes.body.baselineDueAt).toBe('2026-03-15T00:00:00.000Z');

    const rescheduleRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: '2026-03-11T21:10:00.000Z',
        dueAt: '2026-03-16T22:50:00.000Z',
        version: patchRes.body.version,
      })
      .expect(200);

    expect(rescheduleRes.body.startAt).toBe('2026-03-11T00:00:00.000Z');
    expect(rescheduleRes.body.dueAt).toBe('2026-03-16T00:00:00.000Z');

    const moveRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: '2026-03-20T23:59:00.000Z',
        dueAt: '2026-03-22T04:10:00.000Z',
        version: rescheduleRes.body.version,
      })
      .expect(200);

    expect(moveRes.body.startAt).toBe('2026-03-20T00:00:00.000Z');
    expect(moveRes.body.dueAt).toBe('2026-03-22T00:00:00.000Z');

    const storedTask = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(storedTask.startAt?.toISOString()).toBe('2026-03-20T00:00:00.000Z');
    expect(storedTask.dueAt?.toISOString()).toBe('2026-03-22T00:00:00.000Z');
    expect(storedTask.baselineStartAt?.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(storedTask.baselineDueAt?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  test('POST /projects/:id/tasks accepts open-ended date ranges', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Open Range Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const startOnly = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with start date only',
        startAt: futureDate.toISOString(),
      })
      .expect(201);
    expect(startOnly.body.startAt).toBeTruthy();

    const dueOnly = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with due date only',
        dueAt: futureDate.toISOString(),
      })
      .expect(201);
    expect(dueOnly.body.dueAt).toBeTruthy();

    const noDates = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with no dates',
      })
      .expect(201);
    expect(noDates.body.startAt).toBeNull();
    expect(noDates.body.dueAt).toBeNull();
  });

  test('PATCH /tasks/:id rejects invalid date range update', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Patch Date Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task to update' })
      .expect(201);
    const taskId = taskRes.body.id;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const res = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: futureDate.toISOString(),
        dueAt: pastDate.toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      message: expect.stringContaining('startAt must be before or equal to dueAt'),
    });
  });

  test('PATCH /tasks/:id rejects partial update that creates invalid range', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Partial Update Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with dates',
        startAt: startDate.toISOString(),
        dueAt: dueDate.toISOString(),
      })
      .expect(201);
    const taskId = taskRes.body.id;

    const earlierDueDate = new Date();
    earlierDueDate.setDate(earlierDueDate.getDate() - 1);

    const res = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dueAt: earlierDueDate.toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      message: expect.stringContaining('startAt must be before or equal to dueAt'),
    });
  });

  test('PATCH /tasks/:id/reschedule updates dates with optimistic locking and emits audit/outbox', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Reschedule Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);
    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task to reschedule',
        startAt: startDate.toISOString(),
        dueAt: dueDate.toISOString(),
      })
      .expect(201);

    const taskId = taskRes.body.id as string;
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 10);
    const rescheduleRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dueAt: newDueDate.toISOString(),
        version: taskRes.body.version,
      })
      .expect(200);

    expect(rescheduleRes.body.id).toBe(taskId);
    expect(rescheduleRes.body.version).toBe(taskRes.body.version + 1);
    expect(String(rescheduleRes.body.dueAt).slice(0, 10)).toBe(
      newDueDate.toISOString().slice(0, 10),
    );

    const rescheduleAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: 'Task',
        entityId: taskId,
        action: 'task.rescheduled',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(rescheduleAudit).toBeTruthy();
    expect((rescheduleAudit?.beforeJson as any)?.dueAt).toBeTruthy();
    expect((rescheduleAudit?.afterJson as any)?.dueAt).toBeTruthy();

    const rescheduleOutboxEvents = await prisma.outboxEvent.findMany({
      where: { type: 'task.rescheduled' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const rescheduleOutbox = rescheduleOutboxEvents.find(
      (event) => (event.payload as any)?.taskId === taskId,
    );
    expect(rescheduleOutbox).toBeTruthy();
    expect((rescheduleOutbox?.payload as any)?.projectId).toBe(projectId);
    expect((rescheduleOutbox?.payload as any)?.dueAt).toBeTruthy();
  });

  test('PATCH /tasks/:id/reschedule returns 409 with latest server truth on version conflict', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Reschedule Conflict ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task with conflict' })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const staleVersion = taskRes.body.version - 1;
    const conflictRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: new Date().toISOString(),
        version: staleVersion,
      })
      .expect(409);

    expect(conflictRes.body).toMatchObject({
      message: 'Version conflict',
      latest: {
        version: taskRes.body.version,
      },
    });
    expect(conflictRes.body.latest).toHaveProperty('startAt');
    expect(conflictRes.body.latest).toHaveProperty('dueAt');
  });

  test('PATCH /tasks/:id/reschedule prioritizes 409 over date validation when version is stale', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Reschedule Stale Version ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);
    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Task with stale version and invalid date payload',
        startAt: startDate.toISOString(),
        dueAt: dueDate.toISOString(),
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const invalidDueDate = new Date();
    invalidDueDate.setDate(invalidDueDate.getDate() + 1);
    const conflictRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dueAt: invalidDueDate.toISOString(),
        version: taskRes.body.version - 1,
      })
      .expect(409);

    expect(conflictRes.body).toMatchObject({
      message: 'Version conflict',
      latest: {
        version: taskRes.body.version,
      },
    });
    expect(conflictRes.body.code).toBeUndefined();
  });

  test('POST /tasks/:id/subtasks rejects invalid date range', async () => {
    const wsRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = wsRes.body[0].id;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Subtask Date Test ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const parentTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Parent task' })
      .expect(201);
    const parentTaskId = parentTaskRes.body.id as string;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${parentTaskId}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Subtask with invalid date range',
        startAt: futureDate.toISOString(),
        dueAt: pastDate.toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      message: expect.stringContaining('startAt must be before or equal to dueAt'),
    });
  });

  // Dependency cycle detection tests for Issue #119
  describe('Task dependency cycle detection', () => {
    test('POST /tasks/:id/dependencies rejects self-dependency', async () => {
      const workspaceRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = workspaceRes.body[0].id;

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Dependency Test Project - Self' })
        .expect(201);
      const projectId = projectRes.body.id as string;

      const taskRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task for self-dependency test' })
        .expect(201);
      const taskId = taskRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskId })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'DEPENDENCY_CYCLE_DETECTED',
        message: expect.stringContaining('cannot depend on itself'),
      });
    });

    test('POST /tasks/:id/dependencies rejects direct cycle (A -> B -> A)', async () => {
      const workspaceRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = workspaceRes.body[0].id;

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Dependency Test Project - Direct Cycle' })
        .expect(201);
      const projectId = projectRes.body.id as string;

      const taskARes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task A' })
        .expect(201);
      const taskAId = taskARes.body.id as string;

      const taskBRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task B' })
        .expect(201);
      const taskBId = taskBRes.body.id as string;

      // Create A -> B dependency
      await request(app.getHttpServer())
        .post(`/tasks/${taskAId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskBId })
        .expect(201);

      // Try to create B -> A (should fail with cycle error)
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskBId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskAId })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'DEPENDENCY_CYCLE_DETECTED',
        message: expect.stringContaining('circular dependency'),
      });
    });

    test('POST /tasks/:id/dependencies rejects transitive cycle (A -> B -> C -> A)', async () => {
      const workspaceRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = workspaceRes.body[0].id;

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Dependency Test Project - Transitive Cycle' })
        .expect(201);
      const projectId = projectRes.body.id as string;

      const taskARes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task A' })
        .expect(201);
      const taskAId = taskARes.body.id as string;

      const taskBRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task B' })
        .expect(201);
      const taskBId = taskBRes.body.id as string;

      const taskCRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task C' })
        .expect(201);
      const taskCId = taskCRes.body.id as string;

      // Create A -> B -> C chain
      await request(app.getHttpServer())
        .post(`/tasks/${taskAId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskBId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/tasks/${taskBId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskCId })
        .expect(201);

      // Try to create C -> A (should fail with cycle error)
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskCId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskAId })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'DEPENDENCY_CYCLE_DETECTED',
        message: expect.stringContaining('circular dependency'),
      });
    });

    test('POST /tasks/:id/dependencies rejects cross-project dependency', async () => {
      const workspaceRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = workspaceRes.body[0].id;

      const project1Res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Project 1' })
        .expect(201);
      const project1Id = project1Res.body.id as string;

      const project2Res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Project 2' })
        .expect(201);
      const project2Id = project2Res.body.id as string;

      const task1Res = await request(app.getHttpServer())
        .post(`/projects/${project1Id}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task in Project 1' })
        .expect(201);
      const task1Id = task1Res.body.id as string;

      const task2Res = await request(app.getHttpServer())
        .post(`/projects/${project2Id}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task in Project 2' })
        .expect(201);
      const task2Id = task2Res.body.id as string;

      const res = await request(app.getHttpServer())
        .post(`/tasks/${task1Id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: task2Id })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'CROSS_PROJECT_DEPENDENCY',
        message: expect.stringContaining('same project'),
      });
    });

    test('POST /tasks/:id/dependencies accepts valid dependency', async () => {
      const workspaceRes = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const workspaceId = workspaceRes.body[0].id;

      const projectRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, name: 'Dependency Test Project - Valid' })
        .expect(201);
      const projectId = projectRes.body.id as string;

      const taskARes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task A' })
        .expect(201);
      const taskAId = taskARes.body.id as string;

      const taskBRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task B' })
        .expect(201);
      const taskBId = taskBRes.body.id as string;

      const createStart = new Date();
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskAId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependsOnId: taskBId })
        .expect(201);

      expect(res.body).toMatchObject({
        taskId: taskAId,
        dependsOnId: taskBId,
      });

      const dependencyId = res.body.id as string;
      const dependencyCreateAudit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'TaskDependency',
          entityId: dependencyId,
          action: 'task.dependency.created',
          createdAt: { gte: createStart },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(dependencyCreateAudit).toBeTruthy();

      const dependencyCreateOutboxEvents = await prisma.outboxEvent.findMany({
        where: { type: 'task.dependency.created', createdAt: { gte: createStart } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const dependencyCreateOutbox = dependencyCreateOutboxEvents.find(
        (event) => (event.payload as any)?.id === dependencyId,
      );
      expect(dependencyCreateOutbox).toBeTruthy();
      expect((dependencyCreateOutbox?.payload as any)?.taskId).toBe(taskAId);
      expect((dependencyCreateOutbox?.payload as any)?.dependsOnId).toBe(taskBId);

      const removeStart = new Date();
      await request(app.getHttpServer())
        .delete(`/tasks/${taskAId}/dependencies/${taskBId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const dependencyRemoveAudit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'TaskDependency',
          entityId: dependencyId,
          action: 'task.dependency.removed',
          createdAt: { gte: removeStart },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(dependencyRemoveAudit).toBeTruthy();

      const dependencyRemoveOutboxEvents = await prisma.outboxEvent.findMany({
        where: { type: 'task.dependency.removed', createdAt: { gte: removeStart } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const dependencyRemoveOutbox = dependencyRemoveOutboxEvents.find(
        (event) => (event.payload as any)?.id === dependencyId,
      );
      expect(dependencyRemoveOutbox).toBeTruthy();
      expect((dependencyRemoveOutbox?.payload as any)?.taskId).toBe(taskAId);
      expect((dependencyRemoveOutbox?.payload as any)?.dependsOnId).toBe(taskBId);
    });
  });

  test('timeline preferences and timeline move APIs persist contracts with audit/outbox', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Interaction Foundation Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const timelineAssigneeId = 'timeline-member-1';
    await prisma.user.upsert({
      where: { id: timelineAssigneeId },
      create: {
        id: timelineAssigneeId,
        email: 'timeline-member-1@example.com',
        displayName: 'Timeline Member 1',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: timelineAssigneeId } },
      create: { workspaceId, userId: timelineAssigneeId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: timelineAssigneeId } },
      create: { projectId, userId: timelineAssigneeId, role: 'VIEWER' },
      update: {},
    });

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    const timelineTaskA = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSectionId,
        title: 'Timeline layout task A',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);
    const timelineTaskB = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSectionId,
        title: 'Timeline layout task B',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);
    const timelineTaskC = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSectionId,
        title: 'Timeline layout task C',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);
    const timelineTaskStatus = String(timelineTaskA.body.status);
    expect(timelineTaskB.body.status).toBe(timelineTaskStatus);
    expect(timelineTaskC.body.status).toBe(timelineTaskStatus);
    const timelineStatusLaneId = `status:${timelineTaskStatus}`;
    const invalidTimelineStatusLaneId =
      timelineStatusLaneId === 'status:DONE' ? 'status:TODO' : 'status:DONE';

    const initialPrefsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/timeline/preferences`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(initialPrefsRes.body.laneOrderBySection).toEqual([]);
    expect(initialPrefsRes.body.laneOrderByAssignee).toEqual([]);
    expect(initialPrefsRes.body.timelineManualLayout).toEqual({
      section: {},
      assignee: {},
      status: {},
    });
    expect(initialPrefsRes.body.timelineViewState).toBeNull();
    expect(initialPrefsRes.body.ganttViewState).toBeNull();

    const sectionPrefsRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/section`)
      .set('Authorization', `Bearer ${token}`)
      .send({ laneOrder: [' section-a ', 'section-b', 'section-a', ''] })
      .expect(200);
    expect(sectionPrefsRes.body.laneOrderBySection).toEqual(['section-a', 'section-b']);

    const assigneePrefsRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/assignee`)
      .set('Authorization', `Bearer ${token}`)
      .send({ laneOrder: ['unassigned', timelineAssigneeId, timelineAssigneeId] })
      .expect(200);
    expect(assigneePrefsRes.body.laneOrderByAssignee).toEqual(['unassigned', timelineAssigneeId]);

    const extraMemberIds = Array.from(
      { length: 501 },
      (_, index) => `timeline-member-extra-${projectId}-${index + 1}`,
    );
    await prisma.user.createMany({
      data: extraMemberIds.map((userId) => ({
        id: userId,
        email: `${userId}@example.com`,
        displayName: userId,
        status: 'ACTIVE',
      })),
    });
    await prisma.workspaceMembership.createMany({
      data: extraMemberIds.map((userId) => ({
        workspaceId,
        userId,
        role: 'WS_MEMBER',
      })),
    });
    await prisma.projectMembership.createMany({
      data: extraMemberIds.map((userId) => ({
        projectId,
        userId,
        role: 'VIEWER',
      })),
    });

    const membersRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const largeAssigneeLaneOrder = [
      'assignee:__unassigned__',
      ...membersRes.body.map((member: { userId: string }) => `assignee:${member.userId}`),
    ];
    expect(largeAssigneeLaneOrder.length).toBeGreaterThan(500);

    const largeAssigneePrefsRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/assignee`)
      .set('Authorization', `Bearer ${token}`)
      .send({ laneOrder: largeAssigneeLaneOrder })
      .expect(200);
    expect(largeAssigneePrefsRes.body.laneOrderByAssignee).toEqual(largeAssigneeLaneOrder);

    const sectionManualLayoutRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/section`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [`section:${defaultSectionId}`]: {
            orderedTaskIds: [
              timelineTaskC.body.id,
              ` ${timelineTaskA.body.id} `,
              timelineTaskC.body.id,
              '',
            ],
            rowByTaskId: {
              [timelineTaskA.body.id]: 1,
            },
          },
        },
      })
      .expect(200);
    expect(sectionManualLayoutRes.body.timelineManualLayout.section).toEqual({
      [`section:${defaultSectionId}`]: {
        orderedTaskIds: [timelineTaskC.body.id, timelineTaskA.body.id],
        rowByTaskId: {
          [timelineTaskA.body.id]: 1,
        },
      },
    });
    expect(sectionManualLayoutRes.body.timelineManualLayout.assignee).toEqual({});
    expect(sectionManualLayoutRes.body.timelineManualLayout.status).toEqual({});

    const assigneeManualLayoutRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/assignee`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [`assignee:${timelineAssigneeId}`]: [timelineTaskB.body.id, timelineTaskA.body.id],
        },
      })
      .expect(200);
    expect(assigneeManualLayoutRes.body.timelineManualLayout.section).toEqual({
      [`section:${defaultSectionId}`]: {
        orderedTaskIds: [timelineTaskC.body.id, timelineTaskA.body.id],
        rowByTaskId: {
          [timelineTaskA.body.id]: 1,
        },
      },
    });
    expect(assigneeManualLayoutRes.body.timelineManualLayout.assignee).toEqual({
      [`assignee:${timelineAssigneeId}`]: {
        orderedTaskIds: [timelineTaskB.body.id, timelineTaskA.body.id],
      },
    });

    const statusManualLayoutRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [timelineStatusLaneId]: [
            timelineTaskA.body.id,
            timelineTaskB.body.id,
            timelineTaskC.body.id,
          ],
        },
      })
      .expect(200);
    expect(statusManualLayoutRes.body.timelineManualLayout.section).toEqual({
      [`section:${defaultSectionId}`]: {
        orderedTaskIds: [timelineTaskC.body.id, timelineTaskA.body.id],
        rowByTaskId: {
          [timelineTaskA.body.id]: 1,
        },
      },
    });
    expect(statusManualLayoutRes.body.timelineManualLayout.assignee).toEqual({
      [`assignee:${timelineAssigneeId}`]: {
        orderedTaskIds: [timelineTaskB.body.id, timelineTaskA.body.id],
      },
    });
    expect(statusManualLayoutRes.body.timelineManualLayout.status).toEqual({
      [timelineStatusLaneId]: {
        orderedTaskIds: [timelineTaskA.body.id, timelineTaskB.body.id, timelineTaskC.body.id],
      },
    });

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [invalidTimelineStatusLaneId]: [timelineTaskA.body.id],
        },
      })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/section`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [`section:${defaultSectionId}`]: ['00000000-0000-4000-8000-000000000000'],
        },
      })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/section`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [`section:${defaultSectionId}`]: {
            orderedTaskIds: [timelineTaskA.body.id, timelineTaskC.body.id],
            rowByTaskId: {
              [timelineTaskA.body.id]: 9999,
            },
          },
        },
      })
      .expect(400);

    const timelineViewStateRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/view-state/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        zoom: 'month',
        anchorDate: '2026-03-18T00:00:00.000Z',
        swimlane: 'status',
        sortMode: 'dueAt',
        scheduleFilter: 'scheduled',
        workingDaysOnly: true,
        ganttStrictMode: true,
      })
      .expect(200);
    expect(timelineViewStateRes.body.timelineViewState).toEqual({
      zoom: 'month',
      anchorDate: '2026-03-18T00:00:00.000Z',
      swimlane: 'status',
      sortMode: 'dueAt',
      scheduleFilter: 'scheduled',
      workingDaysOnly: true,
    });
    expect(timelineViewStateRes.body.ganttViewState).toBeNull();

    const ganttViewStateRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/view-state/gantt`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        zoom: 'day',
        anchorDate: '2026-03-21T00:00:00.000Z',
        ganttRiskFilterMode: 'risk',
        ganttStrictMode: true,
        swimlane: 'assignee',
      })
      .expect(200);
    expect(ganttViewStateRes.body.timelineViewState).toEqual({
      zoom: 'month',
      anchorDate: '2026-03-18T00:00:00.000Z',
      swimlane: 'status',
      sortMode: 'dueAt',
      scheduleFilter: 'scheduled',
      workingDaysOnly: true,
    });
    expect(ganttViewStateRes.body.ganttViewState).toEqual({
      zoom: 'day',
      anchorDate: '2026-03-21T00:00:00.000Z',
      ganttRiskFilterMode: 'risk',
      ganttStrictMode: true,
    });

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/view-state/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        zoom: 'year',
      })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/view-state/gantt`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheduleFilter: 'scheduled',
      })
      .expect(400);

    const persistedPrefsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/timeline/preferences`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(persistedPrefsRes.body.timelineViewState).toEqual({
      zoom: 'month',
      anchorDate: '2026-03-18T00:00:00.000Z',
      swimlane: 'status',
      sortMode: 'dueAt',
      scheduleFilter: 'scheduled',
      workingDaysOnly: true,
    });
    expect(persistedPrefsRes.body.ganttViewState).toEqual({
      zoom: 'day',
      anchorDate: '2026-03-21T00:00:00.000Z',
      ganttRiskFilterMode: 'risk',
      ganttStrictMode: true,
    });
    expect(persistedPrefsRes.body.timelineManualLayout).toEqual({
      section: {
        [`section:${defaultSectionId}`]: {
          orderedTaskIds: [timelineTaskC.body.id, timelineTaskA.body.id],
          rowByTaskId: {
            [timelineTaskA.body.id]: 1,
          },
        },
      },
      assignee: {
        [`assignee:${timelineAssigneeId}`]: {
          orderedTaskIds: [timelineTaskB.body.id, timelineTaskA.body.id],
        },
      },
      status: {
        [timelineStatusLaneId]: {
          orderedTaskIds: [timelineTaskA.body.id, timelineTaskB.body.id, timelineTaskC.body.id],
        },
      },
    });

    const createdTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline move target',
        assigneeUserId: 'test-user',
        startAt: '2026-03-12T00:00:00.000Z',
        dueAt: '2026-03-14T00:00:00.000Z',
      })
      .expect(201);
    const taskId = createdTaskRes.body.id as string;

    const timelineMoveStart = new Date();
    const movedTaskRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        assigneeUserId: timelineAssigneeId,
        dropAt: '2026-03-20T00:00:00.000Z',
        version: createdTaskRes.body.version,
      })
      .expect(200);
    expect(movedTaskRes.body.assigneeUserId).toBe(timelineAssigneeId);
    expect(movedTaskRes.body.startAt).toContain('2026-03-20');
    expect(movedTaskRes.body.dueAt).toContain('2026-03-22');

    const timelineAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: 'Task',
        entityId: taskId,
        action: 'task.timeline.moved',
        createdAt: { gte: timelineMoveStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(timelineAudit).toBeTruthy();

    const matchingTimelineOutbox = await prisma.outboxEvent.findMany({
      where: {
        type: 'task.timeline.moved',
        createdAt: { gte: timelineMoveStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(
      matchingTimelineOutbox.find((event) => (event.payload as any)?.taskId === taskId),
    ).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        assigneeUserId: 'test-user',
        version: createdTaskRes.body.version,
      })
      .expect(409);
  });

  test('project status update APIs persist structured updates with authorship, history, read access, and audit/outbox', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Project Status Update Contract Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const memberId = `status-member-${projectId}`;
    await prisma.user.upsert({
      where: { id: memberId },
      create: {
        id: memberId,
        email: `${memberId}@example.com`,
        displayName: 'Status Member',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
      create: { workspaceId, userId: memberId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: memberId } },
      create: { projectId, userId: memberId, role: 'VIEWER' },
      update: {},
    });

    const memberToken = await app
      .get(AuthService)
      .mintDevToken(memberId, `${memberId}@example.com`, 'Status Member');

    const createStart = new Date();
    const firstCreateRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'ON_TRACK',
        summary: 'Milestone delivery remains on track.',
        blockers: ['Awaiting vendor confirmation'],
        nextSteps: ['Finalize launch checklist', 'Confirm support coverage'],
      })
      .expect(201);

    expect(firstCreateRes.body).toMatchObject({
      projectId,
      authorUserId: 'test-user',
      health: 'ON_TRACK',
      summary: 'Milestone delivery remains on track.',
      blockers: ['Awaiting vendor confirmation'],
      nextSteps: ['Finalize launch checklist', 'Confirm support coverage'],
      author: {
        id: 'test-user',
        displayName: 'Test User',
        email: 'test@example.com',
      },
    });
    expect(firstCreateRes.body.id).toEqual(expect.any(String));
    expect(firstCreateRes.body.createdAt).toEqual(expect.any(String));
    expect(firstCreateRes.body.updatedAt).toEqual(expect.any(String));

    const secondCreateRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'AT_RISK',
        summary: 'Integration testing found two release blockers.',
        blockers: ['Staging deploy is flaky', 'Open schema migration review'],
        nextSteps: ['Stabilize staging deploy', 'Complete migration review'],
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(listRes.body).toEqual({
      items: [
        expect.objectContaining({
          id: secondCreateRes.body.id,
          projectId,
          authorUserId: 'test-user',
          health: 'AT_RISK',
          summary: 'Integration testing found two release blockers.',
          blockers: ['Staging deploy is flaky', 'Open schema migration review'],
          nextSteps: ['Stabilize staging deploy', 'Complete migration review'],
          author: {
            id: 'test-user',
            displayName: 'Test User',
            email: 'test@example.com',
          },
        }),
        expect.objectContaining({
          id: firstCreateRes.body.id,
          health: 'ON_TRACK',
          summary: 'Milestone delivery remains on track.',
        }),
      ],
      nextCursor: null,
      hasNextPage: false,
    });

    const detailRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/status-updates/${secondCreateRes.body.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(detailRes.body).toMatchObject({
      id: secondCreateRes.body.id,
      projectId,
      authorUserId: 'test-user',
      health: 'AT_RISK',
      summary: 'Integration testing found two release blockers.',
      blockers: ['Staging deploy is flaky', 'Open schema migration review'],
      nextSteps: ['Stabilize staging deploy', 'Complete migration review'],
      author: {
        id: 'test-user',
        displayName: 'Test User',
        email: 'test@example.com',
      },
    });

    const createAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: 'ProjectStatusUpdate',
        entityId: firstCreateRes.body.id,
        action: 'project_status_update.created',
        createdAt: { gte: createStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(createAudit).toBeTruthy();
    expect(createAudit?.afterJson).toMatchObject({
      id: firstCreateRes.body.id,
      projectId,
      authorUserId: 'test-user',
      health: 'ON_TRACK',
      summary: 'Milestone delivery remains on track.',
      blockers: ['Awaiting vendor confirmation'],
      nextSteps: ['Finalize launch checklist', 'Confirm support coverage'],
    });

    const createOutbox = await prisma.outboxEvent.findFirst({
      where: {
        type: 'project_status_update.created',
        createdAt: { gte: createStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(createOutbox).toBeTruthy();
    expect(createOutbox?.payload).toMatchObject({
      statusUpdateId: expect.any(String),
      projectId,
      authorUserId: 'test-user',
      health: expect.any(String),
    });
  });

  test('project status update APIs validate structured payloads and permissions', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Project Status Update Validation Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const viewerId = `status-viewer-${projectId}`;
    await prisma.user.upsert({
      where: { id: viewerId },
      create: {
        id: viewerId,
        email: `${viewerId}@example.com`,
        displayName: 'Status Viewer',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      create: { workspaceId, userId: viewerId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: viewerId } },
      create: { projectId, userId: viewerId, role: 'VIEWER' },
      update: {},
    });

    const viewerToken = await app
      .get(AuthService)
      .mintDevToken(viewerId, `${viewerId}@example.com`, 'Status Viewer');

    const paddedSummary = ` ${'x'.repeat(5000)} `;
    const trimmedSummary = 'x'.repeat(5000);

    const trimmedCreateRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'ON_TRACK',
        summary: paddedSummary,
        blockers: [' blocker still open ', '   '],
        nextSteps: [' next step ', ''],
      })
      .expect(201);
    expect(trimmedCreateRes.body.summary).toBe(trimmedSummary);
    expect(trimmedCreateRes.body.blockers).toEqual(['blocker still open']);
    expect(trimmedCreateRes.body.nextSteps).toEqual(['next step']);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'NOT_A_REAL_HEALTH',
        summary: 'This should be rejected.',
        blockers: [],
        nextSteps: [],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'OFF_TRACK',
        summary: '   ',
        blockers: [],
        nextSteps: [],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        health: 'ON_TRACK',
        summary: 'Viewer should not be able to create status updates.',
        blockers: [],
        nextSteps: [],
      })
      .expect(403);
  });

  test('project status updates fan out mention notifications and include mention context for reminder hooks', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Project Status Update Mentions ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const mentionedUserId = `status.mentioned-${projectId}`;
    const mentionedEmail = `${mentionedUserId}@example.com`;
    await prisma.user.upsert({
      where: { id: mentionedUserId },
      create: {
        id: mentionedUserId,
        email: mentionedEmail,
        displayName: 'Status Mentioned Member',
        status: 'ACTIVE',
      },
      update: {
        email: mentionedEmail,
        displayName: 'Status Mentioned Member',
        status: 'ACTIVE',
      },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: mentionedUserId } },
      create: { workspaceId, userId: mentionedUserId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: mentionedUserId } },
      create: { projectId, userId: mentionedUserId, role: 'MEMBER' },
      update: { role: 'MEMBER' },
    });
    await prisma.projectFollower.create({
      data: { projectId, userId: mentionedUserId },
    });

    const mentionedToken = await app
      .get(AuthService)
      .mintDevToken(mentionedUserId, mentionedEmail, 'Status Mentioned Member');

    const createStart = new Date();
    const createdRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/status-updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        health: 'AT_RISK',
        summary: `Need input from @${mentionedUserId} before launch.`,
        blockers: [
          `Waiting on @[${mentionedUserId}|Status Mentioned Member] to confirm the rollout checklist.`,
        ],
        nextSteps: [`Review the mitigation plan with @${mentionedUserId}.`],
      })
      .expect(201);

    const memberNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${mentionedToken}`)
      .expect(200);
    const mentionNotification = memberNotifications.body.find(
      (item: any) => item.type === 'mention' && item.sourceType === 'project_status_update',
    );
    const statusNotification = memberNotifications.body.find(
      (item: any) => item.type === 'status' && item.sourceType === 'project_status_update',
    );

    expect(mentionNotification).toMatchObject({
      userId: mentionedUserId,
      project: { id: projectId },
      triggeredBy: { id: 'test-user' },
      statusUpdate: {
        id: createdRes.body.id,
        summary: `Need input from @${mentionedUserId} before launch.`,
      },
    });
    expect(statusNotification).toBeUndefined();

    const createOutbox = await prisma.outboxEvent.findFirst({
      where: {
        type: 'project_status_update.created',
        createdAt: { gte: createStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(createOutbox).toBeTruthy();
    expect(createOutbox?.payload).toMatchObject({
      statusUpdateId: createdRes.body.id,
      projectId,
      authorUserId: 'test-user',
      mentionedUserIds: [mentionedUserId],
    });
  });

  test('task description mention notifications stay distinct per task when sourceId is blank', async () => {
    const auth = app.get(AuthService);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Description Mention Notifications ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Backlog' })
      .expect(201);

    const mentionedUserId = `description.mention-${projectId}`;
    const mentionedEmail = `${mentionedUserId}@example.com`;
    await prisma.user.upsert({
      where: { id: mentionedUserId },
      create: {
        id: mentionedUserId,
        email: mentionedEmail,
        displayName: 'Description Mention Member',
        status: 'ACTIVE',
      },
      update: {
        email: mentionedEmail,
        displayName: 'Description Mention Member',
        status: 'ACTIVE',
      },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: mentionedUserId } },
      create: { workspaceId, userId: mentionedUserId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: mentionedUserId } },
      create: { projectId, userId: mentionedUserId, role: 'MEMBER' },
      update: { role: 'MEMBER' },
    });
    const mentionedToken = await auth.mintDevToken(
      mentionedUserId,
      mentionedEmail,
      'Description Mention Member',
    );

    const firstTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: sectionRes.body.id, title: 'Mention Task One' })
      .expect(201);
    const secondTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: sectionRes.body.id, title: 'Mention Task Two' })
      .expect(201);

    for (const taskId of [firstTaskRes.body.id, secondTaskRes.body.id]) {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/description`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          descriptionDoc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Need feedback from ' },
                  {
                    type: 'mention',
                    attrs: { id: mentionedUserId, label: 'Description Mention Member' },
                  },
                ],
              },
            ],
          },
          expectedVersion: 0,
        })
        .expect(200);
    }

    const memberNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${mentionedToken}`)
      .expect(200);

    const mentionTaskIds = memberNotifications.body
      .filter((item: any) => item.type === 'mention' && item.sourceType === 'description')
      .map((item: any) => item.taskId)
      .sort();

    expect(mentionTaskIds).toEqual([firstTaskRes.body.id, secondTaskRes.body.id].sort());
  });

  test('approval request notifications use the normalized inbox taxonomy and emit notification outbox events', async () => {
    const auth = app.get(AuthService);
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Approval Notification Project ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const approverId = `approval-approver-${projectId}`;
    const approverEmail = `${approverId}@example.com`;
    await prisma.user.upsert({
      where: { id: approverId },
      create: {
        id: approverId,
        email: approverEmail,
        displayName: 'Approval Approver',
        status: 'ACTIVE',
      },
      update: {
        email: approverEmail,
        displayName: 'Approval Approver',
        status: 'ACTIVE',
      },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: approverId } },
      create: { workspaceId, userId: approverId, role: 'WS_MEMBER' },
      update: { role: 'WS_MEMBER' },
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: approverId } },
      create: { projectId, userId: approverId, role: 'MEMBER' },
      update: { role: 'MEMBER' },
    });
    const approverToken = await auth.mintDevToken(approverId, approverEmail, 'Approval Approver');

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSectionId = sectionsRes.body[0].id as string;

    const approvalTask = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Needs approval',
        type: 'APPROVAL',
        sectionId: defaultSectionId,
        assigneeUserId: 'test-user',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${approvalTask.body.id}/request-approval`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approverUserId: approverId, comment: 'Please review this approval task.' })
      .expect(201);

    const approverNotifications = await request(app.getHttpServer())
      .get('/notifications?status=unread')
      .set('Authorization', `Bearer ${approverToken}`)
      .expect(200);
    const approvalRequestNotification = approverNotifications.body.find(
      (item: any) => item.taskId === approvalTask.body.id,
    );

    expect(approvalRequestNotification).toBeTruthy();
    expect(approvalRequestNotification).toEqual(
      expect.objectContaining({
        taskId: approvalTask.body.id,
        type: 'approval_requested',
        sourceType: 'task',
        sourceId: approvalTask.body.id,
      }),
    );

    const notificationCreatedOutbox = await prisma.outboxEvent.findMany({
      where: { type: 'notification.created' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const matchingOutbox = notificationCreatedOutbox.find((event) => {
      const payload = event.payload as Record<string, unknown> | null;
      return (
        payload?.taskId === approvalTask.body.id &&
        payload?.userId === approverId &&
        payload?.type === 'approval_requested'
      );
    });
    expect(matchingOutbox).toBeTruthy();
  });

  test('saved view APIs persist per-user defaults and named views and reject invalid project references', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Saved View Backend Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const otherProjectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Saved View Isolation Project' })
      .expect(201);
    const otherProjectId = otherProjectRes.body.id as string;

    const validAssigneeId = `saved-view-member-${projectId}`;
    await prisma.user.upsert({
      where: { id: validAssigneeId },
      create: {
        id: validAssigneeId,
        email: `${validAssigneeId}@example.com`,
        displayName: 'Saved View Member',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: validAssigneeId } },
      create: { workspaceId, userId: validAssigneeId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: validAssigneeId } },
      create: { projectId, userId: validAssigneeId, role: 'VIEWER' },
      update: {},
    });

    const invalidAssigneeId = `saved-view-outsider-${projectId}`;
    await prisma.user.upsert({
      where: { id: invalidAssigneeId },
      create: {
        id: invalidAssigneeId,
        email: `${invalidAssigneeId}@example.com`,
        displayName: 'Saved View Outsider',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: invalidAssigneeId } },
      create: { workspaceId, userId: invalidAssigneeId, role: 'WS_MEMBER' },
      update: {},
    });

    const sharedField = await prisma.customFieldDefinition.create({
      data: {
        projectId,
        name: 'Priority Bucket',
        type: 'SELECT',
        position: 1000,
        options: {
          create: [
            { label: 'P0', value: 'p0', position: 1000 },
            { label: 'P1', value: 'p1', position: 2000 },
          ],
        },
      },
      include: {
        options: {
          where: { archivedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    const otherProjectField = await prisma.customFieldDefinition.create({
      data: {
        projectId: otherProjectId,
        name: 'Other Project Field',
        type: 'BOOLEAN',
        position: 1000,
      },
    });

    const initialSavedViewsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(initialSavedViewsRes.body.defaultsByMode).toEqual({
      list: null,
      board: null,
      timeline: null,
      gantt: null,
    });
    expect(initialSavedViewsRes.body.views).toEqual([]);

    const saveDefaultRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/saved-views/defaults/list`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        state: {
          grouping: { field: 'section' },
          sorting: { field: 'title', direction: 'desc' },
          filters: {
            statusIds: ['TODO', 'DONE'],
            assigneeIds: [validAssigneeId],
            customFieldFilters: [
              {
                fieldId: sharedField.id,
                type: 'SELECT',
                optionIds: [sharedField.options[0]?.id],
              },
            ],
          },
          visibleFieldIds: ['name', 'status'],
        },
      })
      .expect(200);
    expect(saveDefaultRes.body.defaultsByMode.list).toEqual({
      grouping: { field: 'section' },
      sorting: { field: 'title', direction: 'desc' },
      filters: {
        statusIds: ['TODO', 'DONE'],
        assigneeIds: [validAssigneeId],
        customFieldFilters: [
          {
            fieldId: sharedField.id,
            type: 'SELECT',
            optionIds: [sharedField.options[0]?.id],
          },
        ],
      },
      visibleFieldIds: ['name', 'status'],
    });

    const createSavedViewRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: ' My Focus ',
        mode: 'list',
        state: {
          grouping: { field: 'assignee' },
          sorting: { field: 'priority', direction: 'asc' },
          filters: {
            assigneeIds: [validAssigneeId],
            statusIds: ['IN_PROGRESS'],
          },
          visibleFieldIds: ['name', 'assignee', 'status'],
        },
      })
      .expect(201);
    expect(createSavedViewRes.body.name).toBe('My Focus');
    expect(createSavedViewRes.body.mode).toBe('list');
    expect(createSavedViewRes.body.state).toEqual({
      grouping: { field: 'assignee' },
      sorting: { field: 'priority', direction: 'asc' },
      filters: {
        assigneeIds: [validAssigneeId],
        statusIds: ['IN_PROGRESS'],
      },
      visibleFieldIds: ['name', 'assignee', 'status'],
    });
    const savedViewId = createSavedViewRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid assignee view',
        mode: 'list',
        state: {
          filters: {
            assigneeIds: [invalidAssigneeId],
          },
        },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid field view',
        mode: 'list',
        state: {
          filters: {
            customFieldFilters: [
              {
                fieldId: otherProjectField.id,
                type: 'BOOLEAN',
                booleanValue: true,
              },
            ],
          },
        },
      })
      .expect(400);

    const updateSavedViewRes = await request(app.getHttpServer())
      .patch(`/saved-views/${savedViewId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Renamed Focus',
        state: {
          grouping: { field: 'section' },
          sorting: { field: 'position', direction: 'asc' },
          filters: {
            assigneeIds: [validAssigneeId],
            statusIds: ['TODO'],
          },
          visibleFieldIds: ['name', 'dueDate'],
        },
      })
      .expect(200);
    expect(updateSavedViewRes.body.name).toBe('Renamed Focus');
    expect(updateSavedViewRes.body.state).toEqual({
      grouping: { field: 'section' },
      sorting: { field: 'position', direction: 'asc' },
      filters: {
        assigneeIds: [validAssigneeId],
        statusIds: ['TODO'],
      },
      visibleFieldIds: ['name', 'dueDate'],
    });

    const persistedSavedViewsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(persistedSavedViewsRes.body.defaultsByMode.list).toEqual({
      grouping: { field: 'section' },
      sorting: { field: 'title', direction: 'desc' },
      filters: {
        statusIds: ['TODO', 'DONE'],
        assigneeIds: [validAssigneeId],
        customFieldFilters: [
          {
            fieldId: sharedField.id,
            type: 'SELECT',
            optionIds: [sharedField.options[0]?.id],
          },
        ],
      },
      visibleFieldIds: ['name', 'status'],
    });
    expect(persistedSavedViewsRes.body.views).toEqual([
      expect.objectContaining({
        id: savedViewId,
        name: 'Renamed Focus',
        mode: 'list',
        state: {
          grouping: { field: 'section' },
          sorting: { field: 'position', direction: 'asc' },
          filters: {
            assigneeIds: [validAssigneeId],
            statusIds: ['TODO'],
          },
          visibleFieldIds: ['name', 'dueDate'],
        },
      }),
    ]);

    const recentAuditEvents = await prisma.auditEvent.findMany({
      where: {
        entityType: 'ProjectSavedView',
        entityId: { in: [savedViewId] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(recentAuditEvents.some((event) => event.action === 'project.saved_view.created')).toBe(
      true,
    );
    expect(recentAuditEvents.some((event) => event.action === 'project.saved_view.updated')).toBe(
      true,
    );

    const recentOutboxEvents = await prisma.outboxEvent.findMany({
      where: {
        type: {
          in: [
            'project.view_default.updated',
            'project.saved_view.created',
            'project.saved_view.updated',
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      recentOutboxEvents.some(
        (event) =>
          event.type === 'project.view_default.updated' &&
          (event.payload as any)?.projectId === projectId &&
          (event.payload as any)?.mode === 'list',
      ),
    ).toBe(true);
    expect(
      recentOutboxEvents.some(
        (event) =>
          event.type === 'project.saved_view.created' && (event.payload as any)?.id === savedViewId,
      ),
    ).toBe(true);
    expect(
      recentOutboxEvents.some(
        (event) =>
          event.type === 'project.saved_view.updated' && (event.payload as any)?.id === savedViewId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/saved-views/${savedViewId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDeleteRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDeleteRes.body.views).toEqual([]);

    const deletedAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: 'ProjectSavedView',
        entityId: savedViewId,
        action: 'project.saved_view.deleted',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(deletedAudit).toBeTruthy();
  });

  test('saved view list sanitizes stale assignee and custom field references for fallback resolution', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Saved View Fallback Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const validAssigneeId = `saved-view-fallback-member-${projectId}`;
    await prisma.user.upsert({
      where: { id: validAssigneeId },
      create: {
        id: validAssigneeId,
        email: `${validAssigneeId}@example.com`,
        displayName: 'Saved View Fallback Member',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: validAssigneeId } },
      create: { workspaceId, userId: validAssigneeId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: validAssigneeId } },
      create: { projectId, userId: validAssigneeId, role: 'VIEWER' },
      update: {},
    });

    const staleField = await prisma.customFieldDefinition.create({
      data: {
        projectId,
        name: 'Fallback Bucket',
        type: 'SELECT',
        position: 1000,
        options: {
          create: [
            { label: 'Keep', value: 'keep', position: 1000 },
            { label: 'Drop', value: 'drop', position: 2000 },
          ],
        },
      },
      include: {
        options: {
          where: { archivedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    const staleOptionId = staleField.options[0]?.id;
    expect(staleOptionId).toBeTruthy();

    await request(app.getHttpServer())
      .put(`/projects/${projectId}/saved-views/defaults/list`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        state: {
          grouping: { field: 'section' },
          sorting: { field: 'position', direction: 'asc' },
          filters: {
            assigneeIds: [validAssigneeId],
            customFieldFilters: [
              {
                fieldId: staleField.id,
                type: 'SELECT',
                optionIds: [staleOptionId],
              },
            ],
          },
          visibleFieldIds: ['name', 'status'],
        },
      })
      .expect(200);

    const namedViewRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stale only',
        mode: 'list',
        state: {
          filters: {
            assigneeIds: [validAssigneeId],
            customFieldFilters: [
              {
                fieldId: staleField.id,
                type: 'SELECT',
                optionIds: [staleOptionId],
              },
            ],
          },
        },
      })
      .expect(201);

    await prisma.projectMembership.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: validAssigneeId,
        },
      },
    });
    await prisma.customFieldOption.update({
      where: { id: staleOptionId },
      data: { archivedAt: new Date() },
    });

    const savedViewsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(savedViewsRes.body.defaultsByMode.list).toEqual({
      grouping: { field: 'section' },
      sorting: { field: 'position', direction: 'asc' },
      visibleFieldIds: ['name', 'status'],
    });
    expect(savedViewsRes.body.views).toEqual([
      expect.objectContaining({
        id: namedViewRes.body.id,
        name: 'Stale only',
        mode: 'list',
        state: {},
      }),
    ]);
  });

  test('timeline manual layout preserves legacy per-swimlane task order state when upgrading from #232', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Legacy Manual Layout Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const timelineAssigneeId = 'timeline-legacy-member-1';
    await prisma.user.upsert({
      where: { id: timelineAssigneeId },
      create: {
        id: timelineAssigneeId,
        email: 'timeline-legacy-member-1@example.com',
        displayName: 'Timeline Legacy Member 1',
        status: 'ACTIVE',
      },
      update: {},
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: timelineAssigneeId } },
      create: { workspaceId, userId: timelineAssigneeId, role: 'WS_MEMBER' },
      update: {},
    });
    await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId: timelineAssigneeId } },
      create: { projectId, userId: timelineAssigneeId, role: 'VIEWER' },
      update: {},
    });

    const defaultSection = await prisma.section.findFirstOrThrow({
      where: { projectId, isDefault: true },
    });
    const timelineTaskARes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSection.id,
        title: 'Timeline legacy task A',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);
    const timelineTaskBRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSection.id,
        title: 'Timeline legacy task B',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);
    const timelineTaskCRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: defaultSection.id,
        title: 'Timeline legacy task C',
        assigneeUserId: timelineAssigneeId,
        status: 'TODO',
      })
      .expect(201);

    const legacySectionLayout = {
      [`section:${defaultSection.id}`]: [timelineTaskCRes.body.id, timelineTaskARes.body.id],
    };
    const legacyAssigneeLayout = {
      [`assignee:${timelineAssigneeId}`]: [timelineTaskBRes.body.id, timelineTaskARes.body.id],
    };
    const legacyStatusLaneId = `status:${timelineTaskARes.body.status as string}`;

    await prisma.projectTimelinePreference.create({
      data: {
        projectId,
        userId: 'test-user',
        laneOrderBySection: [],
        laneOrderByAssignee: [],
      },
    });
    await prisma.$executeRawUnsafe(
      `
        UPDATE "ProjectTimelinePreference"
        SET "taskOrderBySection" = $1::jsonb,
            "taskOrderByAssignee" = $2::jsonb
        WHERE "projectId" = $3 AND "userId" = $4
      `,
      JSON.stringify(legacySectionLayout),
      JSON.stringify(legacyAssigneeLayout),
      projectId,
      'test-user',
    );

    const legacyPrefsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/timeline/preferences`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(legacyPrefsRes.body.timelineManualLayout).toEqual({
      section: Object.fromEntries(
        Object.entries(legacySectionLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      assignee: Object.fromEntries(
        Object.entries(legacyAssigneeLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      status: {},
    });

    const statusManualLayoutRes = await request(app.getHttpServer())
      .put(`/projects/${projectId}/timeline/preferences/manual-layout/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        laneTaskOrder: {
          [legacyStatusLaneId]: [
            timelineTaskARes.body.id,
            timelineTaskBRes.body.id,
            timelineTaskCRes.body.id,
          ],
        },
      })
      .expect(200);
    expect(statusManualLayoutRes.body.timelineManualLayout).toEqual({
      section: Object.fromEntries(
        Object.entries(legacySectionLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      assignee: Object.fromEntries(
        Object.entries(legacyAssigneeLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      status: {
        [legacyStatusLaneId]: {
          orderedTaskIds: [
            timelineTaskARes.body.id,
            timelineTaskBRes.body.id,
            timelineTaskCRes.body.id,
          ],
        },
      },
    });

    const persistedPrefsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/timeline/preferences`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(persistedPrefsRes.body.timelineManualLayout).toEqual({
      section: Object.fromEntries(
        Object.entries(legacySectionLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      assignee: Object.fromEntries(
        Object.entries(legacyAssigneeLayout).map(([laneId, orderedTaskIds]) => [
          laneId,
          { orderedTaskIds },
        ]),
      ),
      status: {
        [legacyStatusLaneId]: {
          orderedTaskIds: [
            timelineTaskARes.body.id,
            timelineTaskBRes.body.id,
            timelineTaskCRes.body.id,
          ],
        },
      },
    });
  });

  test('timeline move supports section, status, and custom field lane reassignment', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Lane Reassignment Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const laneSectionRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Doing Lane' })
      .expect(201);

    const laneFieldRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/custom-fields`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Timeline Lane',
        type: 'SELECT',
        options: [
          { label: 'Backlog', value: 'backlog' },
          { label: 'In Flight', value: 'in-flight' },
        ],
      })
      .expect(201);

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline lane move target',
        sectionId: defaultSection.id,
        status: 'TODO',
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const moveStart = new Date();
    const movedTaskRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: laneSectionRes.body.id,
        status: 'IN_PROGRESS',
        customFieldMove: {
          fieldId: laneFieldRes.body.id,
          value: laneFieldRes.body.options[1].id,
        },
        version: taskRes.body.version,
      })
      .expect(200);

    expect(movedTaskRes.body.sectionId).toBe(laneSectionRes.body.id);
    expect(movedTaskRes.body.status).toBe('IN_PROGRESS');
    expect(movedTaskRes.body.customFieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: laneFieldRes.body.id,
          optionId: laneFieldRes.body.options[1].id,
        }),
      ]),
    );

    const detailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detailRes.body.sectionId).toBe(laneSectionRes.body.id);
    expect(detailRes.body.status).toBe('IN_PROGRESS');
    expect(detailRes.body.customFieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: laneFieldRes.body.id,
          optionId: laneFieldRes.body.options[1].id,
        }),
      ]),
    );

    const timelineAudit = await prisma.auditEvent.findFirst({
      where: {
        entityType: 'Task',
        entityId: taskId,
        action: 'task.timeline.moved',
        createdAt: { gte: moveStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(timelineAudit).toBeTruthy();
    expect(timelineAudit?.afterJson).toMatchObject({
      sectionId: laneSectionRes.body.id,
      status: 'IN_PROGRESS',
    });

    const matchingTimelineOutbox = await prisma.outboxEvent.findMany({
      where: {
        type: 'task.timeline.moved',
        createdAt: { gte: moveStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    const timelineOutboxPayload = matchingTimelineOutbox.find(
      (event) => (event.payload as any)?.taskId === taskId,
    )?.payload as any;
    expect(timelineOutboxPayload).toBeTruthy();
    expect(timelineOutboxPayload?.taskId).toBe(taskId);
    expect(timelineOutboxPayload?.sectionId).toBe(laneSectionRes.body.id);
    expect(timelineOutboxPayload?.status).toBe('IN_PROGRESS');
    expect(timelineOutboxPayload?.customFieldMove).toEqual({
      fieldId: laneFieldRes.body.id,
      value: laneFieldRes.body.options[1].id,
    });

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customFieldMove: {
          fieldId: laneFieldRes.body.id,
        },
        version: movedTaskRes.body.version,
      })
      .expect(400);
  });

  test('timeline move preserves edited duration after general date updates', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Date Consistency Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline duration source of truth',
        sectionId: defaultSection.id,
        startAt: '2026-04-10T00:00:00.000Z',
        dueAt: '2026-04-12T00:00:00.000Z',
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const editedTaskRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dueAt: '2026-04-14T00:00:00.000Z',
        version: taskRes.body.version,
      })
      .expect(200);

    expect(editedTaskRes.body.startAt).toContain('2026-04-10');
    expect(editedTaskRes.body.dueAt).toContain('2026-04-14');

    const movedTaskRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dropAt: '2026-04-20T00:00:00.000Z',
        version: editedTaskRes.body.version,
      })
      .expect(200);

    expect(movedTaskRes.body.startAt).toContain('2026-04-20');
    expect(movedTaskRes.body.dueAt).toContain('2026-04-24');

    const detailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detailRes.body.startAt).toContain('2026-04-20');
    expect(detailRes.body.dueAt).toContain('2026-04-24');
  });

  test('timeline reschedule preserves descendant schedules and reports parent move policy', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Parent Move Policy Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const parentTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline parent move policy target',
        sectionId: defaultSection.id,
        startAt: '2026-04-10T00:00:00.000Z',
        dueAt: '2026-04-12T00:00:00.000Z',
      })
      .expect(201);
    const parentTaskId = parentTaskRes.body.id as string;

    const childTaskRes = await request(app.getHttpServer())
      .post(`/tasks/${parentTaskId}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline child preserved',
        startAt: '2026-04-11T00:00:00.000Z',
        dueAt: '2026-04-11T00:00:00.000Z',
      })
      .expect(201);

    const rescheduleRes = await request(app.getHttpServer())
      .patch(`/tasks/${parentTaskId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: '2026-04-14T00:00:00.000Z',
        dueAt: '2026-04-16T00:00:00.000Z',
        version: parentTaskRes.body.version,
      })
      .expect(200);

    expect(rescheduleRes.body.startAt).toContain('2026-04-14');
    expect(rescheduleRes.body.dueAt).toContain('2026-04-16');
    expect(rescheduleRes.body.subtaskMovePolicy).toEqual({
      mode: 'preserve',
      descendantCount: 1,
      largeImpact: false,
    });

    const childDetailRes = await request(app.getHttpServer())
      .get(`/tasks/${childTaskRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(childDetailRes.body.startAt).toContain('2026-04-11');
    expect(childDetailRes.body.dueAt).toContain('2026-04-11');
  });

  test('POST /tasks/:id/subtasks rejects nested subtasks', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Nested Subtask Rejection Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const parentTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Nested parent target',
        sectionId: defaultSection.id,
      })
      .expect(201);

    const childTaskRes = await request(app.getHttpServer())
      .post(`/tasks/${parentTaskRes.body.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Nested child target',
      })
      .expect(201);

    const nestedRes = await request(app.getHttpServer())
      .post(`/tasks/${childTaskRes.body.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Should fail',
      })
      .expect(400);

    const errorMessage = nestedRes.body?.error?.message ?? nestedRes.body?.message ?? '';
    expect(String(errorMessage)).toContain('Nested subtasks are not supported');
  });

  test('timeline move marks large subtask impact when a parent has many descendants', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Parent Move Impact Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection?.id).toBeTruthy();

    const parentTaskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline large impact parent',
        sectionId: defaultSection.id,
        startAt: '2026-05-01T00:00:00.000Z',
        dueAt: '2026-05-03T00:00:00.000Z',
      })
      .expect(201);
    const parentTaskId = parentTaskRes.body.id as string;

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post(`/tasks/${parentTaskId}/subtasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: `Large impact child ${index + 1}`,
          startAt: `2026-05-0${index + 1}T00:00:00.000Z`,
          dueAt: `2026-05-0${index + 1}T00:00:00.000Z`,
        })
        .expect(201);
    }

    const movedTaskRes = await request(app.getHttpServer())
      .patch(`/tasks/${parentTaskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: '2026-05-06T00:00:00.000Z',
        dueAt: '2026-05-08T00:00:00.000Z',
        version: parentTaskRes.body.version,
      })
      .expect(200);

    expect(movedTaskRes.body.subtaskMovePolicy).toEqual({
      mode: 'preserve',
      descendantCount: 5,
      largeImpact: true,
    });
  });

  test('timeline move rejects unknown section and unknown custom field lane targets', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Lane Validation Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Timeline lane validation target' })
      .expect(201);
    const taskId = taskRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: '2bc8bcf5-11d3-4ea8-b67f-bf2d8f2d1a99',
        version: taskRes.body.version,
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.statusCode).toBe(404);
        expect(res.body.message).toBe('Section not found');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customFieldMove: {
          fieldId: 'dc8c55d5-8606-404d-bfaf-5efad17900f8',
          value: 'anything',
        },
        version: taskRes.body.version,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body).toBeDefined();
        expect(res.body.message).toContain('Unknown or archived custom field definition');
      });
  });

  test('timeline move blocks subtasks from crossing grouping lanes', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Subtask Lane Guard Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    const secondSectionRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Timeline child target' })
      .expect(201);

    const parentRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline child parent',
        sectionId: defaultSection.id,
        startAt: '2026-05-01T00:00:00.000Z',
        dueAt: '2026-05-02T00:00:00.000Z',
      })
      .expect(201);

    const childRes = await request(app.getHttpServer())
      .post(`/tasks/${parentRes.body.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline child guarded',
        startAt: '2026-05-01T00:00:00.000Z',
        dueAt: '2026-05-01T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tasks/${childRes.body.id}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: secondSectionRes.body.id,
        version: childRes.body.version,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toContain(
          'Subtasks must stay in the same timeline group as their parent',
        );
      });
  });

  test('timeline move blocks parents with subtasks from crossing grouping lanes', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Parent Lane Guard Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    const secondSectionRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Timeline parent target' })
      .expect(201);

    const parentRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline parent guarded',
        sectionId: defaultSection.id,
        startAt: '2026-05-01T00:00:00.000Z',
        dueAt: '2026-05-02T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${parentRes.body.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline child preserved',
        startAt: '2026-05-01T00:00:00.000Z',
        dueAt: '2026-05-01T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tasks/${parentRes.body.id}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: secondSectionRes.body.id,
        version: parentRes.body.version,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toContain(
          'Subtasks must stay in the same timeline group as their parent',
        );
      });
  });

  test('timeline move conflict payload includes section and status server truth', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: 'Timeline Conflict Payload Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultSection = sectionsRes.body.find((section: any) => section.isDefault);
    expect(defaultSection).toBeDefined();

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Timeline conflict payload target',
        sectionId: defaultSection.id,
        status: 'TODO',
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const firstMove = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'BLOCKED',
        version: taskRes.body.version,
      })
      .expect(200);

    const conflictRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/timeline-move`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'DONE',
        version: taskRes.body.version,
      })
      .expect(409);

    expect(firstMove.body.status).toBe('BLOCKED');
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.body.message).toBe('Version conflict');
    expect(conflictRes.body.latest).toMatchObject({
      version: firstMove.body.version,
      sectionId: defaultSection.id,
      status: 'BLOCKED',
    });
  });
});
