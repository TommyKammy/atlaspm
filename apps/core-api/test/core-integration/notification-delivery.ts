import { expect, test } from 'vitest';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import type { CoreIntegrationBindings } from './testkit';

export function registerNotificationDeliveryIntegrationTests({
  app,
  prisma,
  token,
}: CoreIntegrationBindings) {
  test('GET /notifications/delivery-failures exposes retrying and dead-lettered webhook issues for project admins', async () => {
    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `Notification Delivery Visibility ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const retryingEvent = await prisma.outboxEvent.create({
      data: {
        type: 'task.updated',
        payload: { projectId, taskId: 'retrying-task' },
        correlationId: `notif-delivery-retrying-${Date.now()}`,
        deliveryAttempts: 2,
        nextRetryAt: new Date(Date.now() + 60_000),
        lastError: 'webhook-a:500',
      },
    });

    const deadLetteredEvent = await prisma.outboxEvent.create({
      data: {
        type: 'task.updated',
        payload: { projectId, taskId: 'dead-letter-task' },
        correlationId: `notif-delivery-dead-${Date.now()}`,
        deliveryAttempts: 5,
        deadLetteredAt: new Date(),
        lastError: 'webhook-b:timeout',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications/delivery-failures')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: retryingEvent.id,
          project: expect.objectContaining({ id: projectId }),
          status: 'retrying',
          deliveryAttempts: 2,
          lastError: 'webhook-a:500',
        }),
        expect.objectContaining({
          eventId: deadLetteredEvent.id,
          project: expect.objectContaining({ id: projectId }),
          status: 'dead_lettered',
          deliveryAttempts: 5,
          lastError: 'webhook-b:timeout',
        }),
      ]),
    );
    const retryingIndex = response.body.findIndex((item: any) => item.eventId === retryingEvent.id);
    const deadLetteredIndex = response.body.findIndex(
      (item: any) => item.eventId === deadLetteredEvent.id,
    );
    expect(deadLetteredIndex).toBeGreaterThanOrEqual(0);
    expect(retryingIndex).toBeGreaterThanOrEqual(0);
    expect(deadLetteredIndex).toBeLessThan(retryingIndex);
  });

  test('GET /notifications/delivery-failures paginates beyond unrelated failures to return admin project issues', async () => {
    const auth = app.get(AuthService);
    const ownerUserId = `delivery-pagination-owner-${Date.now()}`;
    const ownerToken = await auth.mintDevToken(
      ownerUserId,
      `${ownerUserId}@example.com`,
      'Delivery Pagination Owner',
    );

    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaceId, name: `Notification Delivery Pagination ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const laterRetryAt = new Date(Date.now() + 120_000);
    for (let index = 0; index < 120; index += 1) {
      await prisma.outboxEvent.create({
        data: {
          type: 'task.updated',
          payload: { projectId: `other-project-${index}`, taskId: `other-task-${index}` },
          correlationId: `notif-delivery-other-${index}-${Date.now()}`,
          deliveryAttempts: 1,
          nextRetryAt: laterRetryAt,
        },
      });
    }

    const targetEvent = await prisma.outboxEvent.create({
      data: {
        type: 'task.updated',
        payload: { projectId, taskId: 'owned-task' },
        correlationId: `notif-delivery-owned-${Date.now()}`,
        deliveryAttempts: 1,
        nextRetryAt: laterRetryAt,
        createdAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications/delivery-failures?take=1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        eventId: targetEvent.id,
        project: expect.objectContaining({ id: projectId }),
      }),
    ]);
  });
}
