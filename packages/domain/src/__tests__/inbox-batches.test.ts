import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInboxNotificationBatches } from '../services/inbox-batches.js';

test('buildInboxNotificationBatches collapses same-target unread notifications into a single batch and keeps read state separate', () => {
  const notifications = [
    {
      id: 'n-1',
      type: 'comment',
      sourceType: 'comment',
      sourceId: 'comment-1',
      createdAt: '2026-03-09T10:00:00.000Z',
      readAt: null,
      project: { id: 'project-1', name: 'Project One' },
      taskId: 'task-1',
      triggeredBy: { id: 'user-1', displayName: 'Alice' },
    },
    {
      id: 'n-2',
      type: 'mention',
      sourceType: 'description',
      sourceId: 'task-1',
      createdAt: '2026-03-09T09:00:00.000Z',
      readAt: null,
      project: { id: 'project-1', name: 'Project One' },
      taskId: 'task-1',
      triggeredBy: { id: 'user-2', displayName: 'Bob' },
    },
    {
      id: 'n-3',
      type: 'assignment',
      sourceType: 'task',
      sourceId: 'task-1',
      createdAt: '2026-03-09T08:00:00.000Z',
      readAt: null,
      project: { id: 'project-1', name: 'Project One' },
      taskId: 'task-1',
      triggeredBy: { id: 'user-1', displayName: 'Alice' },
    },
    {
      id: 'n-4',
      type: 'comment',
      sourceType: 'comment',
      sourceId: 'comment-2',
      createdAt: '2026-03-09T07:00:00.000Z',
      readAt: '2026-03-09T07:30:00.000Z',
      project: { id: 'project-1', name: 'Project One' },
      taskId: 'task-1',
      triggeredBy: { id: 'user-3', displayName: 'Casey' },
    },
    {
      id: 'n-5',
      type: 'mention',
      sourceType: 'project_status_update',
      sourceId: 'status-update-1',
      createdAt: '2026-03-09T06:00:00.000Z',
      readAt: null,
      project: { id: 'project-1', name: 'Project One' },
      statusUpdateId: 'status-update-1',
      triggeredBy: { id: 'user-4', displayName: 'Drew' },
    },
  ];

  const batches = buildInboxNotificationBatches(notifications);

  assert.equal(batches.length, 3);

  assert.deepEqual(batches[0], {
    batchKey: 'unread:project-1:task:task-1',
    targetKey: 'task:task-1',
    unread: true,
    notificationCount: 3,
    actorCount: 2,
    actors: [
      { id: 'user-1', label: 'Alice' },
      { id: 'user-2', label: 'Bob' },
    ],
    types: ['comment', 'mention', 'assignment'],
    latestCreatedAt: '2026-03-09T10:00:00.000Z',
    latestNotification: notifications[0],
    notifications: notifications.slice(0, 3),
  });

  assert.equal(batches[1]?.batchKey, 'read:project-1:task:task-1');
  assert.equal(batches[1]?.notificationCount, 1);
  assert.equal(batches[1]?.unread, false);

  assert.equal(batches[2]?.batchKey, 'unread:project-1:status-update:status-update-1');
  assert.equal(batches[2]?.notificationCount, 1);
  assert.equal(batches[2]?.latestNotification.id, 'n-5');
});
