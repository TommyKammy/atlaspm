import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';
import { GlobalErrorFilter } from '../src/common/error.filter';
import { RequestLoggingMiddleware } from '../src/common/request-logging.middleware';
import { THROTTLE_POLICIES } from '../src/common/throttling';
import { PrismaService } from '../src/prisma/prisma.service';

const ENV_KEYS = [
  'NODE_ENV',
  'DEV_AUTH_ENABLED',
  'DEV_AUTH_SECRET',
  'COLLAB_JWT_SECRET',
  'COLLAB_SERVICE_TOKEN',
  'COLLAB_SERVER_URL',
  'SEARCH_ENABLED',
  'REMINDER_WORKER_ENABLED',
  'TASK_RETENTION_WORKER_ENABLED',
  'TASK_RETENTION_DAYS',
  'WEBHOOK_DELIVERY_WORKER_ENABLED',
  'WEBHOOK_DELIVERY_BASE_DELAY_MS',
  'WEBHOOK_DELIVERY_MAX_DELAY_MS',
  'WEBHOOK_DELIVERY_MAX_ATTEMPTS',
  'WEBHOOK_SIGNING_SECRET',
  'RECURRING_WORKER_ENABLED',
  'DATABASE_URL',
] as const;

const PUBLIC_FORM_SUBMISSION_LIMIT = THROTTLE_POLICIES.publicFormSubmission.limit;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
    DEV_AUTH_SECRET: process.env.DEV_AUTH_SECRET,
    COLLAB_JWT_SECRET: process.env.COLLAB_JWT_SECRET,
    COLLAB_SERVICE_TOKEN: process.env.COLLAB_SERVICE_TOKEN,
    COLLAB_SERVER_URL: process.env.COLLAB_SERVER_URL,
    SEARCH_ENABLED: process.env.SEARCH_ENABLED,
    REMINDER_WORKER_ENABLED: process.env.REMINDER_WORKER_ENABLED,
    TASK_RETENTION_WORKER_ENABLED: process.env.TASK_RETENTION_WORKER_ENABLED,
    TASK_RETENTION_DAYS: process.env.TASK_RETENTION_DAYS,
    WEBHOOK_DELIVERY_WORKER_ENABLED: process.env.WEBHOOK_DELIVERY_WORKER_ENABLED,
    WEBHOOK_DELIVERY_BASE_DELAY_MS: process.env.WEBHOOK_DELIVERY_BASE_DELAY_MS,
    WEBHOOK_DELIVERY_MAX_DELAY_MS: process.env.WEBHOOK_DELIVERY_MAX_DELAY_MS,
    WEBHOOK_DELIVERY_MAX_ATTEMPTS: process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS,
    WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET,
    RECURRING_WORKER_ENABLED: process.env.RECURRING_WORKER_ENABLED,
    DATABASE_URL: process.env.DATABASE_URL,
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

type TestContext = {
  app: INestApplication;
  prisma: PrismaService;
  token: string;
};

async function bootstrapApp(): Promise<TestContext> {
  process.env.NODE_ENV = 'test';
  process.env.DEV_AUTH_ENABLED = 'true';
  process.env.DEV_AUTH_SECRET = 'atlaspm-public-form-abuse-secret';
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(new CorrelationIdMiddleware().use);
  app.use(new RequestLoggingMiddleware().use);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalErrorFilter());
  await app.init();

  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();
  const auth = moduleRef.get(AuthService);
  const token = await auth.mintDevToken(
    `public-form-owner-${Date.now()}`,
    `public-form-owner-${Date.now()}@example.com`,
    'Public Form Owner',
  );

  return { app, prisma, token };
}

async function createPublicForm(app: INestApplication, token: string) {
  const server = app.getHttpServer();

  await request(server).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

  const workspaceRes = await request(server)
    .get('/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const workspaceId = workspaceRes.body[0].id as string;

  const projectRes = await request(server)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      workspaceId,
      name: `Public Form Abuse Test ${Date.now()}`,
    })
    .expect(201);
  const projectId = projectRes.body.id as string;

  const formRes = await request(server)
    .post(`/projects/${projectId}/forms`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Lead Intake',
      description: 'Public intake form',
    })
    .expect(201);
  const formId = formRes.body.id as string;

  await request(server)
    .put(`/forms/${formId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublic: true })
    .expect(200);

  const questionRes = await request(server)
    .post(`/forms/${formId}/questions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'TEXT',
      label: 'What do you need help with?',
      required: true,
    })
    .expect(201);

  return {
    formId,
    projectId,
    questionId: questionRes.body.id as string,
  };
}

async function createPrivateForm(app: INestApplication, token: string) {
  const { formId, questionId } = await createPublicForm(app, token);
  const server = app.getHttpServer();

  await request(server)
    .put(`/forms/${formId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublic: false })
    .expect(200);

  return { formId, questionId };
}

function buildSubmission(questionId: string, index: number) {
  return {
    submitterName: `Public Submitter ${index}`,
    submitterEmail: `public-submit-${Date.now()}-${index}@example.com`,
    answers: [
      {
        questionId,
        value: `Need help ${index}`,
      },
    ],
  };
}

describe('public form abuse controls', () => {
  const envSnapshot = snapshotEnv();
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = await bootstrapApp();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (context) {
      await context.app.close();
    }
    restoreEnv(envSnapshot);
    context = undefined;
  });

  test('throttles repeated public form submissions', async () => {
    const { app, token } = context!;
    const { formId, questionId } = await createPublicForm(app, token);
    const server = app.getHttpServer();

    for (let index = 0; index < PUBLIC_FORM_SUBMISSION_LIMIT; index += 1) {
      const response = await request(server).post(`/forms/${formId}/submit`).send(buildSubmission(questionId, index));
      expect(response.status).toBe(201);
    }

    const throttled = await request(server)
      .post(`/forms/${formId}/submit`)
      .send(buildSubmission(questionId, PUBLIC_FORM_SUBMISSION_LIMIT));

    expect(throttled.status).toBe(429);
  });

  test('does not apply the strict public throttle to non-public submissions', async () => {
    const { app, token } = context!;
    const { formId, questionId } = await createPrivateForm(app, token);
    const server = app.getHttpServer();

    for (let index = 0; index <= PUBLIC_FORM_SUBMISSION_LIMIT; index += 1) {
      const response = await request(server)
        .post(`/forms/${formId}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send(buildSubmission(questionId, index));

      expect(response.status).toBe(409);
    }
  });

  test('rejects obvious bot honeypot submissions and emits structured logs', async () => {
    const { app, prisma, token } = context!;
    const { formId, questionId } = await createPublicForm(app, token);
    const server = app.getHttpServer();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await request(server)
      .post(`/forms/${formId}/submit`)
      .set('x-correlation-id', 'public-form-accepted')
      .send(buildSubmission(questionId, 1))
      .expect(201);

    await request(server)
      .post(`/forms/${formId}/submit`)
      .set('x-correlation-id', 'public-form-rejected')
      .send({
        ...buildSubmission(questionId, 2),
        website: 'https://spam.example',
      })
      .expect(400);

    const submissions = await prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: 'asc' },
    });
    expect(submissions).toHaveLength(1);

    const structuredLogs = infoSpy.mock.calls
      .map(([message]) => {
        if (typeof message !== 'string') {
          return null;
        }

        try {
          return JSON.parse(message) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    expect(
      structuredLogs.some(
        (entry) =>
          entry.type === 'form.submission.accepted' &&
          entry.formId === formId &&
          entry.correlationId === 'public-form-accepted',
      ),
    ).toBe(true);

    expect(
      structuredLogs.some(
        (entry) =>
          entry.type === 'form.submission.rejected' &&
          entry.formId === formId &&
          entry.reason === 'honeypot' &&
          entry.correlationId === 'public-form-rejected',
      ),
    ).toBe(true);
  });
});
