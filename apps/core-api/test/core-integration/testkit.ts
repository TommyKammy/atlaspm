import { afterAll, beforeAll } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { ReminderDeliveryService } from '../../src/tasks/reminder-delivery.service';
import { TaskRetentionService } from '../../src/tasks/task-retention.service';
import { WebhookDeliveryService } from '../../src/webhooks/webhook-delivery.service';
import { CorrelationIdMiddleware } from '../../src/common/correlation.middleware';
import { RecurringTaskWorker } from '../../src/recurring-tasks/recurring-task.worker';

export interface CoreIntegrationBindings {
  app: INestApplication;
  prisma: PrismaService;
  token: string;
  reminderWorker: ReminderDeliveryService;
  retentionWorker: TaskRetentionService;
  webhookWorker: WebhookDeliveryService;
  recurringWorker: RecurringTaskWorker;
}

interface MutableCoreIntegrationBindings extends Partial<CoreIntegrationBindings> {}

function applyCoreIntegrationEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DEV_AUTH_ENABLED = 'true';
  process.env.DEV_AUTH_SECRET = 'atlaspm-integration-secret-123';
  process.env.COLLAB_JWT_SECRET = 'collab-jwt-secret';
  process.env.COLLAB_SERVICE_TOKEN = 'collab-service-secret';
  process.env.COLLAB_SERVER_URL = 'ws://localhost:18080';
  process.env.SEARCH_ENABLED = 'false';
  process.env.REMINDER_WORKER_ENABLED = 'false';
  process.env.TASK_RETENTION_WORKER_ENABLED = 'false';
  process.env.TASK_RETENTION_DAYS = '30';
  process.env.WEBHOOK_DELIVERY_WORKER_ENABLED = 'false';
  process.env.WEBHOOK_DELIVERY_BASE_DELAY_MS = '0';
  process.env.WEBHOOK_DELIVERY_MAX_DELAY_MS = '0';
  process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS = '2';
  process.env.WEBHOOK_SIGNING_SECRET = 'webhook-test-secret';
  process.env.RECURRING_WORKER_ENABLED = 'false';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';
}

function createLiveProxy<T extends object>(
  bindings: MutableCoreIntegrationBindings,
  key: keyof CoreIntegrationBindings,
): T {
  return new Proxy({} as T, {
    get(_target, property, receiver) {
      const value = bindings[key];
      if (!value) {
        throw new Error(`Core integration binding "${String(key)}" accessed before setup`);
      }
      return Reflect.get(value as object, property, receiver);
    },
  });
}

function createLiveString(
  bindings: MutableCoreIntegrationBindings,
  key: keyof Pick<CoreIntegrationBindings, 'token'>,
): string {
  return {
    [Symbol.toPrimitive]: () => {
      const value = bindings[key];
      if (!value) {
        throw new Error(`Core integration binding "${String(key)}" accessed before setup`);
      }
      return value;
    },
    toString: () => {
      const value = bindings[key];
      if (!value) {
        throw new Error(`Core integration binding "${String(key)}" accessed before setup`);
      }
      return value;
    },
    valueOf: () => {
      const value = bindings[key];
      if (!value) {
        throw new Error(`Core integration binding "${String(key)}" accessed before setup`);
      }
      return value;
    },
  } as string;
}

export function setupCoreIntegrationSuite(): CoreIntegrationBindings {
  const bindings: MutableCoreIntegrationBindings = {};

  beforeAll(async () => {
    applyCoreIntegrationEnv();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    const auth = moduleRef.get(AuthService);

    bindings.app = app;
    bindings.prisma = prisma;
    bindings.reminderWorker = moduleRef.get(ReminderDeliveryService);
    bindings.retentionWorker = moduleRef.get(TaskRetentionService);
    bindings.webhookWorker = moduleRef.get(WebhookDeliveryService);
    bindings.recurringWorker = moduleRef.get(RecurringTaskWorker);
    bindings.token = await auth.mintDevToken('test-user', 'test@example.com', 'Test User');
  });

  afterAll(async () => {
    await bindings.app?.close();
  });

  return {
    app: createLiveProxy<INestApplication>(bindings, 'app'),
    prisma: createLiveProxy<PrismaService>(bindings, 'prisma'),
    token: createLiveString(bindings, 'token'),
    reminderWorker: createLiveProxy<ReminderDeliveryService>(bindings, 'reminderWorker'),
    retentionWorker: createLiveProxy<TaskRetentionService>(bindings, 'retentionWorker'),
    webhookWorker: createLiveProxy<WebhookDeliveryService>(bindings, 'webhookWorker'),
    recurringWorker: createLiveProxy<RecurringTaskWorker>(bindings, 'recurringWorker'),
  };
}
