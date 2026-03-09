import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient, ProjectRole, WorkspaceRole } from '@prisma/client';

type ExplainRow = {
  'QUERY PLAN': Array<{
    Plan: Record<string, unknown>;
  }>;
};

describe('notifications inbox query plan', () => {
  const prisma = new PrismaClient();
  const seedId = `notif-plan-${Date.now()}`;
  const workspaceId = `${seedId}-workspace`;
  const projectId = `${seedId}-project`;
  const userId = `${seedId}-user`;
  const triggerUserId = `${seedId}-trigger`;
  const notificationCount = 20_000;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';

    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.com`, displayName: 'Inbox Plan User' },
        { id: triggerUserId, email: `${triggerUserId}@example.com`, displayName: 'Inbox Plan Trigger User' },
      ],
    });

    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: 'Inbox Query Plan Workspace',
      },
    });

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId, userId, role: WorkspaceRole.WS_MEMBER },
        { workspaceId, userId: triggerUserId, role: WorkspaceRole.WS_MEMBER },
      ],
    });

    await prisma.project.create({
      data: {
        id: projectId,
        workspaceId,
        name: 'Inbox Query Plan Project',
      },
    });

    await prisma.projectMembership.create({
      data: {
        projectId,
        userId,
        role: ProjectRole.MEMBER,
      },
    });

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO inbox_notifications (
          id,
          user_id,
          project_id,
          task_id,
          type,
          source_type,
          source_id,
          triggered_by_user_id,
          read_at,
          created_at,
          updated_at
        )
        SELECT
          $1 || '-note-' || gs::text,
          $2,
          $3,
          NULL,
          'task.reminder',
          'query-plan-test',
          'source-' || gs::text,
          $4,
          CASE WHEN gs % 5 = 0 THEN now() - ((gs % 90) || ' minutes')::interval ELSE NULL END,
          now() - (($5 - gs) || ' seconds')::interval,
          now()
        FROM generate_series(1, $5::int) gs
      `,
      seedId,
      userId,
      projectId,
      triggerUserId,
      notificationCount,
    );

    await prisma.$executeRawUnsafe('ANALYZE inbox_notifications');
    await prisma.$executeRawUnsafe('ANALYZE "ProjectMembership"');
  }, 30_000);

  afterAll(async () => {
    await prisma.inboxNotification.deleteMany({
      where: {
        sourceType: 'query-plan-test',
        userId,
      },
    });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, triggerUserId] } } });
    await prisma.$disconnect();
  });

  test('unread inbox query uses the unread partial index for newest-first pagination', async () => {
    const explain = await prisma.$queryRawUnsafe<ExplainRow[]>(
      `
        EXPLAIN (FORMAT JSON)
        SELECT n.id, n.created_at
        FROM inbox_notifications n
        WHERE n.user_id = $1
          AND n.read_at IS NULL
          AND n.project_id = ANY($2::text[])
        ORDER BY n.created_at DESC
        LIMIT 200
      `,
      userId,
      [projectId],
    );

    const rootPlan = explain[0]?.['QUERY PLAN']?.[0]?.Plan;
    expect(rootPlan).toBeTruthy();

    const relationScans = collectRelationScans(rootPlan!, 'inbox_notifications');
    expect(relationScans.length).toBeGreaterThan(0);
    expect(
      relationScans.some(
        (scan) =>
          (scan['Node Type'] === 'Index Scan' || scan['Node Type'] === 'Index Only Scan') &&
          scan['Index Name'] === 'inbox_notifications_user_id_unread_created_at_desc_idx',
      ),
    ).toBe(true);
    expect(
      relationScans.some(
        (scan) =>
          scan['Node Type'] === 'Seq Scan' || scan['Node Type'] === 'Parallel Seq Scan',
      ),
    ).toBe(false);
  });
});

function collectRelationScans(plan: Record<string, unknown>, relationName: string): Array<Record<string, unknown>> {
  const matches: Array<Record<string, unknown>> = [];
  walkPlan(plan, (node) => {
    if (node['Relation Name'] === relationName) {
      matches.push(node);
    }
  });
  return matches;
}

function walkPlan(node: Record<string, unknown>, visit: (node: Record<string, unknown>) => void) {
  visit(node);

  const plans = node.Plans;
  if (!Array.isArray(plans)) {
    return;
  }

  for (const child of plans) {
    if (child && typeof child === 'object') {
      walkPlan(child as Record<string, unknown>, visit);
    }
  }
}
