import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  formatMigrationHealth,
  inspectMigrationHealth,
  shouldBlockStartupForMigrationHealth,
} from '../src/prisma/migration-health';

describe('migration health', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports pending local migrations with an operator recovery hint', async () => {
    const migrationsDir = createMigrationsDir([
      '202602230001_init',
      '20260309123000_optimize_inbox_unread_query',
    ]);

    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          migration_name: '202602230001_init',
          finished_at: new Date('2026-02-23T00:01:00.000Z'),
          rolled_back_at: null,
          logs: null,
        },
      ]),
    };

    const summary = await inspectMigrationHealth(prisma, migrationsDir);

    expect(summary.pendingLocalMigrations).toEqual(['20260309123000_optimize_inbox_unread_query']);
    expect(summary.failedDatabaseMigrations).toEqual([]);
    expect(summary.warnings[0]).toContain('Pending Prisma migrations detected');
    expect(summary.warnings[0]).toContain('pnpm --filter @atlaspm/core-api prisma:migrate');
    expect(shouldBlockStartupForMigrationHealth(summary)).toBe(false);
  });

  test('blocks startup for failed database migrations and emits structured diagnostics', async () => {
    const migrationsDir = createMigrationsDir(['202602230001_init']);

    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          migration_name: '202602230001_init',
          finished_at: null,
          rolled_back_at: null,
          logs: 'syntax error at or near "ALTER"',
        },
      ]),
    };

    const summary = await inspectMigrationHealth(prisma, migrationsDir);
    const message = formatMigrationHealth(summary);

    expect(summary.failedDatabaseMigrations).toEqual([
      {
        name: '202602230001_init',
        logs: 'syntax error at or near "ALTER"',
      },
    ]);
    expect(shouldBlockStartupForMigrationHealth(summary)).toBe(true);
    expect(message).toContain('"event":"prisma.migrations.attention_required"');
    expect(message).toContain('"hasLogs":true');
    expect(message).toContain('Failed Prisma migrations detected');
  });

  function createMigrationsDir(migrationNames: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'atlaspm-migrations-'));
    tempDirs.push(root);

    for (const name of migrationNames) {
      mkdirSync(join(root, name));
    }

    return root;
  }
});
