import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';

type MigrationQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
};

export type MigrationHealthSummary = {
  localMigrationCount: number;
  appliedMigrationCount: number;
  pendingLocalMigrations: string[];
  failedDatabaseMigrations: Array<{ name: string; logs: string | null }>;
  extraDatabaseMigrations: string[];
  warnings: string[];
};

export async function inspectMigrationHealth(
  prisma: MigrationQueryClient,
  migrationsDir = resolve(__dirname, '../../prisma/migrations'),
): Promise<MigrationHealthSummary> {
  const localMigrationNames = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const rows = await prisma.$queryRaw<MigrationRow[]>(
    Prisma.sql`SELECT migration_name, finished_at, rolled_back_at, logs FROM "_prisma_migrations" ORDER BY migration_name ASC`,
  );

  const appliedRows = rows.filter((row) => row.finished_at && !row.rolled_back_at);
  const failedRows = rows.filter((row) => !row.finished_at && !row.rolled_back_at);

  const appliedNames = new Set(appliedRows.map((row) => row.migration_name));
  const failedNames = new Set(failedRows.map((row) => row.migration_name));
  const localNames = new Set(localMigrationNames);

  const pendingLocalMigrations = localMigrationNames.filter(
    (name) => !appliedNames.has(name) && !failedNames.has(name),
  );
  const extraDatabaseMigrations = [...appliedNames].filter((name) => !localNames.has(name)).sort();

  const warnings: string[] = [];
  if (pendingLocalMigrations.length > 0) {
    warnings.push(
      `Pending Prisma migrations detected: ${pendingLocalMigrations.join(', ')}. Recovery: run "pnpm --filter @atlaspm/core-api prisma:migrate".`,
    );
  }
  if (failedRows.length > 0) {
    warnings.push(
      `Failed Prisma migrations detected: ${failedRows.map((row) => row.migration_name).join(', ')}. Recovery: inspect "_prisma_migrations" logs and resolve before restarting writes.`,
    );
  }
  if (extraDatabaseMigrations.length > 0) {
    warnings.push(
      `Database has migrations not present in this checkout: ${extraDatabaseMigrations.join(', ')}. Recovery: update the branch or reconcile the deployed revision before applying new migrations.`,
    );
  }

  return {
    localMigrationCount: localMigrationNames.length,
    appliedMigrationCount: appliedRows.length,
    pendingLocalMigrations,
    failedDatabaseMigrations: failedRows.map((row) => ({
      name: row.migration_name,
      logs: row.logs,
    })),
    extraDatabaseMigrations,
    warnings,
  };
}

export function formatMigrationHealth(summary: MigrationHealthSummary) {
  if (summary.warnings.length === 0) {
    return JSON.stringify({
      event: 'prisma.migrations.healthy',
      localMigrationCount: summary.localMigrationCount,
      appliedMigrationCount: summary.appliedMigrationCount,
    });
  }

  return JSON.stringify({
    event: 'prisma.migrations.attention_required',
    localMigrationCount: summary.localMigrationCount,
    appliedMigrationCount: summary.appliedMigrationCount,
    pendingLocalMigrations: summary.pendingLocalMigrations,
    failedDatabaseMigrations: summary.failedDatabaseMigrations.map((migration) => ({
      name: migration.name,
      hasLogs: Boolean(migration.logs),
    })),
    extraDatabaseMigrations: summary.extraDatabaseMigrations,
    warnings: summary.warnings,
  });
}

export function shouldBlockStartupForMigrationHealth(summary: MigrationHealthSummary) {
  return summary.failedDatabaseMigrations.length > 0;
}

export function formatMigrationHealthProbeFailure(error: unknown, migrationsDir: string) {
  return JSON.stringify({
    event: 'prisma.migrations.probe_failed',
    migrationsDir,
    error: error instanceof Error ? error.message : String(error),
    warning:
      'Unable to inspect Prisma migration health during startup. Verify the migrations directory, database permissions, and "_prisma_migrations" table state.',
  });
}
