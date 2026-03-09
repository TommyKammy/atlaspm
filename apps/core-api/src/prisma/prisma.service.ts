import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  formatMigrationHealth,
  inspectMigrationHealth,
  shouldBlockStartupForMigrationHealth,
} from './migration-health';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    const summary = await inspectMigrationHealth(this);
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
}
