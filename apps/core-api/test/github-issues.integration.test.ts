import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CorrelationIdMiddleware } from '../src/common/correlation.middleware';

type MockIssue = {
  id: number;
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: 'open' | 'closed';
  updated_at: string;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

describe('GitHub issues integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let token: string;
  let githubServer: ReturnType<typeof createServer>;
  let githubBaseUrl: string;
  let issues: MockIssue[];

  beforeAll(async () => {
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
    process.env.INTEGRATION_CREDENTIAL_SECRET = 'integration-credential-secret-1234567890';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public';

    issues = [
      {
        id: 101,
        number: 12,
        title: 'GitHub issue imported into AtlasPM',
        body: 'Imported from the reference provider test.',
        html_url: 'https://github.example.com/atlaspm/repo/issues/12',
        state: 'open',
        updated_at: '2026-03-11T00:00:00.000Z',
      },
      {
        id: 102,
        number: 18,
        title: 'Closed issue should sync as done',
        body: 'Closed upstream.',
        html_url: 'https://github.example.com/atlaspm/repo/issues/18',
        state: 'closed',
        updated_at: '2026-03-11T00:05:00.000Z',
      },
    ];

    githubServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.headers.authorization !== 'Bearer github-test-token') {
        sendJson(res, 401, { message: 'Bad credentials' });
        return;
      }

      if (req.method === 'GET' && req.url === '/user') {
        sendJson(res, 200, { login: 'atlaspm-test-user', id: 42 });
        return;
      }

      if (req.method === 'GET' && req.url === '/repos/atlaspm/repo') {
        sendJson(res, 200, {
          id: 99,
          full_name: 'atlaspm/repo',
          private: false,
          html_url: 'https://github.example.com/atlaspm/repo',
        });
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/repos/atlaspm/repo/issues')) {
        sendJson(res, 200, issues);
        return;
      }

      sendJson(res, 404, { message: `Unhandled route: ${req.method} ${req.url}` });
    });

    await new Promise<void>((resolve) => githubServer.listen(0, '127.0.0.1', () => resolve()));
    const address = githubServer.address() as AddressInfo;
    githubBaseUrl = `http://127.0.0.1:${address.port}`;
    process.env.GITHUB_API_BASE_URL = githubBaseUrl;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
    auth = moduleRef.get(AuthService);
    token = await auth.mintDevToken(
      'github-integration-user',
      'github-integration@example.com',
      'GitHub Integration User',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (githubServer) {
      await new Promise<void>((resolve, reject) => githubServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  test('workspace admins can connect a GitHub issues provider and import issues into a project', async () => {
    await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const workspaceId = workspacesRes.body[0].id as string;
    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId, name: `GitHub Import ${Date.now()}` })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const connectRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/integrations/github`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: `github-atlaspm-${Date.now()}`,
        displayName: 'AtlasPM GitHub',
        owner: 'atlaspm',
        repo: 'repo',
        projectId,
        credentials: {
          accessToken: 'github-test-token',
        },
      })
      .expect(201);

    expect(connectRes.body.provider).toBe('GITHUB');
    expect(connectRes.body.status).toBe('ACTIVE');
    expect(connectRes.body.settings).toMatchObject({
      owner: 'atlaspm',
      repo: 'repo',
      projectId,
    });

    const syncRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/integrations/${connectRes.body.id}/sync`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'issues' })
      .expect(200);

    expect(syncRes.body).toMatchObject({
      status: 'completed',
      importedCount: 2,
      updatedCount: 0,
      providerKey: 'github',
      scope: 'issues',
    });

    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.title)).toEqual([
      'GitHub issue imported into AtlasPM',
      'Closed issue should sync as done',
    ]);
    expect(tasks.map((task) => task.status)).toEqual(['TODO', 'DONE']);
    expect(tasks[0]?.description).toContain('Imported from the reference provider test.');
    expect(tasks[0]?.description).toContain('https://github.example.com/atlaspm/repo/issues/12');

    const mappings = await prisma.integrationEntityMapping.findMany({
      where: { providerConfigId: connectRes.body.id, entityType: 'task' },
      orderBy: { externalId: 'asc' },
    });
    expect(mappings).toHaveLength(2);
    expect(mappings.map((mapping) => mapping.externalId)).toEqual(['101', '102']);

    const syncState = await prisma.integrationSyncState.findUnique({
      where: {
        providerConfigId_scope: {
          providerConfigId: connectRes.body.id as string,
          scope: 'issues',
        },
      },
    });
    expect(syncState?.status).toBe('SUCCEEDED');
    expect(syncState?.lastSyncedAt).not.toBeNull();

    const credential = await prisma.integrationCredential.findUnique({
      where: {
        providerConfigId_kind: {
          providerConfigId: connectRes.body.id as string,
          kind: 'ACCESS_TOKEN',
        },
      },
    });
    expect(credential?.redactedValue).toBe('gith...oken');
    expect(credential?.encryptedValue).toBeTruthy();
    expect(credential?.encryptedValue).not.toContain('github-test-token');

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        entityId: connectRes.body.id as string,
        action: {
          in: ['integration.provider.connected', 'integration.sync.completed'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditEvents.map((event) => event.action)).toEqual([
      'integration.provider.connected',
      'integration.sync.completed',
    ]);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        type: {
          in: ['integration.provider.connected', 'integration.sync.completed'],
        },
        payload: {
          path: ['providerConfigId'],
          equals: connectRes.body.id as string,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(outboxEvents.map((event) => event.type)).toEqual([
      'integration.provider.connected',
      'integration.sync.completed',
    ]);
  });
});
