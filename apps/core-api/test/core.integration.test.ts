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
    process.env.COLLAB_JWT_SECRET = 'collab-jwt-secret';
    process.env.COLLAB_SERVICE_TOKEN = 'collab-service-secret';
    process.env.COLLAB_SERVER_URL = 'ws://localhost:18080';
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

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'viewer-1', role: 'VIEWER' })
      .expect(201);

    const membersRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(membersRes.body.some((m: any) => m.user?.id === 'member-1')).toBe(true);

    const auth = app.get(AuthService);
    const memberToken = await auth.mintDevToken('member-1', 'member-1@example.com', 'Member One');
    const viewerToken = await auth.mintDevToken('viewer-1', 'viewer-1@example.com', 'Viewer One');
    const outsiderToken = await auth.mintDevToken('outsider-1', 'outsider-1@example.com', 'Outsider One');

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
      .get('/outbox')
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
    expect(outbox.body.some((e: any) => e.type === 'rule.updated')).toBe(true);

    expect(defaultSection).toBeTruthy();
  });
});
