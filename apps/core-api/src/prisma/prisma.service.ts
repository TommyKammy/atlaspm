import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  formatMigrationHealthProbeFailure,
  formatMigrationHealth,
  inspectMigrationHealth,
  type MigrationHealthSummary,
  shouldBlockStartupForMigrationHealth,
} from './migration-health';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    const migrationsDir = this.resolveMigrationsDir();
    let summary: MigrationHealthSummary;

    try {
      summary = await inspectMigrationHealth(this, migrationsDir);
    } catch (error) {
      this.logger.warn(formatMigrationHealthProbeFailure(error, migrationsDir));
      return;
    }

    const message = formatMigrationHealth(summary);

    if (shouldBlockStartupForMigrationHealth(summary)) {
      this.logger.error(message);
      throw new Error(message);
    }

    if (summary.warnings.length > 0) {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  private resolveMigrationsDir() {
    return resolve(__dirname, '../../prisma/migrations');
  }
}
