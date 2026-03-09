import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'node:crypto';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';
import { PrismaService } from '../src/prisma/prisma.service';

const ENV_KEYS = [
  'NODE_ENV',
  'DEV_AUTH_ENABLED',
  'DEV_AUTH_SECRET',
  'SEARCH_ENABLED',
  'REMINDER_WORKER_ENABLED',
  'TASK_RETENTION_WORKER_ENABLED',
  'WEBHOOK_DELIVERY_WORKER_ENABLED',
  'RECURRING_WORKER_ENABLED',
  'SLACK_SIGNING_SECRET',
] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
    DEV_AUTH_SECRET: process.env.DEV_AUTH_SECRET,
    SEARCH_ENABLED: process.env.SEARCH_ENABLED,
    REMINDER_WORKER_ENABLED: process.env.REMINDER_WORKER_ENABLED,
    TASK_RETENTION_WORKER_ENABLED: process.env.TASK_RETENTION_WORKER_ENABLED,
    WEBHOOK_DELIVERY_WORKER_ENABLED: process.env.WEBHOOK_DELIVERY_WORKER_ENABLED,
    RECURRING_WORKER_ENABLED: process.env.RECURRING_WORKER_ENABLED,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
  };
}

function restoreEnv(snapshot: Record<(typeof ENV_KEYS)[number], string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

function signSlackBody(body: string, secret: string, timestamp: string): string {
  return `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`, 'utf8').digest('hex')}`;
}

describe('Core API throttling', () => {
  const envSnapshot = snapshotEnv();
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-throttle-test-secret';
    process.env.SEARCH_ENABLED = 'false';
    process.env.REMINDER_WORKER_ENABLED = 'false';
    process.env.TASK_RETENTION_WORKER_ENABLED = 'false';
    process.env.WEBHOOK_DELIVERY_WORKER_ENABLED = 'false';
    process.env.RECURRING_WORKER_ENABLED = 'false';
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        $connect: async () => undefined,
        $disconnect: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv(envSnapshot);
  });

  test('applies the default throttling baseline to general API routes', async () => {
    const server = app.getHttpServer();

    for (let index = 0; index < 60; index += 1) {
      const response = await request(server)
        .post('/dev-auth/token')
        .send({ sub: `user-${index}`, email: `user-${index}@example.com`, name: 'Test User' });

      expect(response.status).toBe(201);
    }

    const response = await request(server)
      .post('/dev-auth/token')
      .send({ sub: 'user-60', email: 'user-60@example.com', name: 'Test User' });

    expect(response.status).toBe(429);
  });

  test('keeps stricter route-specific throttling for Slack events', async () => {
    const server = app.getHttpServer();
    const body = JSON.stringify({
      type: 'url_verification',
      challenge: 'challenge-token',
    });

    for (let index = 0; index < 10; index += 1) {
      const timestamp = `${Math.floor(Date.now() / 1000)}`;
      const signature = signSlackBody(body, process.env.SLACK_SIGNING_SECRET!, timestamp);

      const response = await request(server)
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', timestamp)
        .set('x-slack-signature', signature)
        .send(body);

      expect(response.status).toBe(201);
    }

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const signature = signSlackBody(body, process.env.SLACK_SIGNING_SECRET!, timestamp);
    const response = await request(server)
      .post('/webhooks/slack/events')
      .set('content-type', 'application/json')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(response.status).toBe(429);
  });
});
