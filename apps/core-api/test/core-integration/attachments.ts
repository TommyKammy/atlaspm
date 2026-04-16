import { expect, test, vi } from 'vitest';
import request from 'supertest';
import type { CoreIntegrationBindings } from './testkit';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aY9kAAAAASUVORK5CYII=',
  'base64',
);

async function createAttachmentTask(
  app: CoreIntegrationBindings['app'],
  token: CoreIntegrationBindings['token'],
  projectName: string,
  taskTitle: string,
) {
  await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

  const workspaceRes = await request(app.getHttpServer())
    .get('/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const workspaceId = workspaceRes.body[0].id as string;

  const projectRes = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ workspaceId, name: projectName })
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

  const taskRes = await request(app.getHttpServer())
    .post(`/projects/${projectId}/tasks`)
    .set('Authorization', `Bearer ${token}`)
    .send({ sectionId: defaultSectionId, title: taskTitle })
    .expect(201);

  return { projectId, taskId: taskRes.body.id as string };
}

export function registerAttachmentIntegrationTests({
  app,
  prisma,
  token,
}: CoreIntegrationBindings) {
  test('attachment list responses do not expose persistent download tokens', async () => {
    const { taskId } = await createAttachmentTask(
      app,
      token,
      `Attachment list tokens ${Date.now()}`,
      'Attachment list token leak',
    );

    const attachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'tiny.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
      .expect(201);

    await request(app.getHttpServer())
      .post(String(attachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'tiny.png', contentType: 'image/png' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: attachmentInit.body.attachmentId })
      .expect(201);

    const attachmentsRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const attachment = attachmentsRes.body.find(
      (item: any) => item.id === attachmentInit.body.attachmentId,
    );
    expect(attachment).toBeTruthy();
    expect(attachment.uploadToken).toBeUndefined();
  });

  test('attachment uploads reject deleted and completed attachments without mutating them', async () => {
    const { taskId } = await createAttachmentTask(
      app,
      token,
      `Attachment upload guard ${Date.now()}`,
      'Attachment upload guards',
    );

    const deletedAttachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'deleted.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/attachments/${deletedAttachmentInit.body.attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(String(deletedAttachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'deleted.png', contentType: 'image/png' })
      .expect(404);

    const completedAttachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'completed.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
      .expect(201);

    await request(app.getHttpServer())
      .post(String(completedAttachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'completed.png', contentType: 'image/png' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: completedAttachmentInit.body.attachmentId })
      .expect(201);

    const completedAttachment = await prisma.taskAttachment.findUniqueOrThrow({
      where: { id: completedAttachmentInit.body.attachmentId },
    });
    expect(completedAttachment.uploadToken).toBeTruthy();

    await request(app.getHttpServer())
      .post(
        `/attachments/${completedAttachment.id}/upload?token=${completedAttachment.uploadToken as string}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'completed.png', contentType: 'image/png' })
      .expect(409);
  });

  test('attachment initiation rejects declared sizes above the upload limit at validation time', async () => {
    const { taskId } = await createAttachmentTask(
      app,
      token,
      `Attachment validation ${Date.now()}`,
      'Attachment validation limit',
    );

    const oversizeInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'large.png', mimeType: 'image/png', sizeBytes: 5_000_001 })
      .expect(409);
    expect(oversizeInit.body.message).toContain('Image too large');
  });

  test('attachment public download URLs expire after a short TTL', async () => {
    const frozenNow = new Date('2026-03-10T03:00:00.000Z');
    const previousAttachmentDownloadTtl = process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC;
    process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC = '300';
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);

    try {
      const { taskId } = await createAttachmentTask(
        app,
        token,
        `Attachment download TTL ${Date.now()}`,
        'Attachment download TTL',
      );

      const attachmentInit = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/attachments/initiate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'tiny.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
        .expect(201);

      await request(app.getHttpServer())
        .post(String(attachmentInit.body.uploadUrl))
        .set('Authorization', `Bearer ${token}`)
        .attach('file', ONE_PIXEL_PNG, { filename: 'tiny.png', contentType: 'image/png' })
        .expect(201);

      const attachmentComplete = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/attachments/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ attachmentId: attachmentInit.body.attachmentId })
        .expect(201);
      const downloadUrl = String(attachmentComplete.body.url);

      await request(app.getHttpServer()).get(downloadUrl).expect(200);

      vi.setSystemTime(new Date(frozenNow.getTime() + 10 * 60 * 1000));

      await request(app.getHttpServer()).get(downloadUrl).expect(404);
    } finally {
      if (previousAttachmentDownloadTtl === undefined) {
        delete process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC;
      } else {
        process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC = previousAttachmentDownloadTtl;
      }
      vi.useRealTimers();
    }
  });

  test('attachment public download URLs are revoked when an attachment is deleted', async () => {
    const { taskId } = await createAttachmentTask(
      app,
      token,
      `Attachment revoke ${Date.now()}`,
      'Attachment revoke',
    );

    const attachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'tiny.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
      .expect(201);

    await request(app.getHttpServer())
      .post(String(attachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'tiny.png', contentType: 'image/png' })
      .expect(201);

    const attachmentComplete = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: attachmentInit.body.attachmentId })
      .expect(201);
    const downloadUrl = String(attachmentComplete.body.url);

    await request(app.getHttpServer()).get(downloadUrl).expect(200);

    await request(app.getHttpServer())
      .delete(`/attachments/${attachmentInit.body.attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer()).get(downloadUrl).expect(404);
  });

  test('attachment completion is idempotent on retry', async () => {
    const { taskId } = await createAttachmentTask(
      app,
      token,
      `Attachment completion retry ${Date.now()}`,
      'Attachment completion retry',
    );

    const attachmentInit = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/initiate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'retry.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length })
      .expect(201);

    await request(app.getHttpServer())
      .post(String(attachmentInit.body.uploadUrl))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', ONE_PIXEL_PNG, { filename: 'retry.png', contentType: 'image/png' })
      .expect(201);

    const outboxBefore = await prisma.outboxEvent.count({
      where: { type: 'task.attachment.created' },
    });

    const firstComplete = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: attachmentInit.body.attachmentId })
      .expect(201);

    const storedAfterFirstComplete = await prisma.taskAttachment.findUniqueOrThrow({
      where: { id: attachmentInit.body.attachmentId },
    });

    const secondComplete = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/attachments/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentId: attachmentInit.body.attachmentId })
      .expect(201);

    const storedAfterSecondComplete = await prisma.taskAttachment.findUniqueOrThrow({
      where: { id: attachmentInit.body.attachmentId },
    });
    const outboxAfter = await prisma.outboxEvent.count({
      where: { type: 'task.attachment.created' },
    });

    expect(secondComplete.body).toEqual(firstComplete.body);
    expect(storedAfterSecondComplete.uploadToken).toBe(storedAfterFirstComplete.uploadToken);
    expect(storedAfterSecondComplete.completedAt?.toISOString()).toBe(
      storedAfterFirstComplete.completedAt?.toISOString(),
    );
    expect(outboxAfter).toBe(outboxBefore + 1);
  });
}
