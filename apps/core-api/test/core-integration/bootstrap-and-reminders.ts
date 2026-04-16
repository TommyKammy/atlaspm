import { expect, test } from 'vitest';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import type { CoreIntegrationBindings } from './testkit';

export function registerBootstrapAndReminderIntegrationTests({
  app,
  prisma,
  reminderWorker,
}: CoreIntegrationBindings) {
  test('concurrent first authenticated requests bootstrap a fresh user without 500s', async () => {
    const auth = app.get(AuthService);
    const userId = `concurrent-user-${Date.now()}`;
    const freshToken = await auth.mintDevToken(userId, `${userId}@example.com`, 'Concurrent User');

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(app.getHttpServer())
          .get(index % 2 === 0 ? '/workspaces' : '/me')
          .set('Authorization', `Bearer ${freshToken}`),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId },
    });
    expect(memberships).toHaveLength(1);
  });

  test('users can configure reminder delivery preferences and opt out of reminder delivery', async () => {
    const auth = app.get(AuthService);
    const reminderUserId = `reminder-pref-user-${Date.now()}`;
    const reminderToken = await auth.mintDevToken(
      reminderUserId,
      `${reminderUserId}@example.com`,
      'Reminder Preference User',
    );

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);

    const workspaceRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);
    const workspaceId = workspaceRes.body[0].id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${reminderToken}`)
      .send({ workspaceId, name: 'Reminder Preferences Project' })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const sectionsRes = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);
    const defaultSectionId = (
      sectionsRes.body.find((section: { isDefault: boolean }) => section.isDefault) ??
      sectionsRes.body[0]
    )?.id as string;

    const taskRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${reminderToken}`)
      .send({
        sectionId: defaultSectionId,
        title: 'Reminder preference delivery test',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const taskId = taskRes.body.id as string;

    const initialPreferences = await request(app.getHttpServer())
      .get('/me/reminder-preferences')
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);
    expect(initialPreferences.body).toEqual({
      enabled: true,
      defaultLeadTimeMinutes: 60,
    });

    const updatedPreferences = await request(app.getHttpServer())
      .put('/me/reminder-preferences')
      .set('Authorization', `Bearer ${reminderToken}`)
      .send({ enabled: false, defaultLeadTimeMinutes: 1440 })
      .expect(200);
    expect(updatedPreferences.body).toEqual({
      enabled: false,
      defaultLeadTimeMinutes: 1440,
    });

    await request(app.getHttpServer())
      .put(`/tasks/${taskId}/reminder`)
      .set('Authorization', `Bearer ${reminderToken}`)
      .send({ remindAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);

    const disabledDeliveryCount = await reminderWorker.processDueReminders(new Date());
    expect(disabledDeliveryCount).toBe(0);

    const reminderWhileDisabled = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/reminder`)
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);
    expect(reminderWhileDisabled.body.sentAt).toBeNull();

    const reenabledPreferences = await request(app.getHttpServer())
      .put('/me/reminder-preferences')
      .set('Authorization', `Bearer ${reminderToken}`)
      .send({ enabled: true, defaultLeadTimeMinutes: 15 })
      .expect(200);
    expect(reenabledPreferences.body).toEqual({
      enabled: true,
      defaultLeadTimeMinutes: 15,
    });

    const deliveredCount = await reminderWorker.processDueReminders(new Date());
    expect(deliveredCount).toBe(1);

    const reminderAfterReenable = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/reminder`)
      .set('Authorization', `Bearer ${reminderToken}`)
      .expect(200);
    expect(Boolean(reminderAfterReenable.body?.sentAt)).toBe(true);
  });
}
