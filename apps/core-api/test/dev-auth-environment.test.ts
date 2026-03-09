import { afterEach, describe, expect, test } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { DevAuthModule } from '../src/auth/dev-auth.module';
import { PrismaService } from '../src/prisma/prisma.service';

const ENV_KEYS = ['DEV_AUTH_ENABLED', 'DEV_AUTH_SECRET', 'NODE_ENV'] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return {
    DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
    DEV_AUTH_SECRET: process.env.DEV_AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
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

async function createAuthApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [DevAuthModule.register()] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  return app;
}

describe('Dev auth environment guardrails', () => {
  const envSnapshot = snapshotEnv();

  afterEach(async () => {
    restoreEnv(envSnapshot);
  });

  test('does not mount /dev-auth/token when dev auth is disabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'false';

    const app = await createAuthApp();
    await app.init();

    try {
      await request(app.getHttpServer()).post('/dev-auth/token').send({ sub: 'user-123' }).expect(404);
    } finally {
      await app.close();
    }
  });

  test('fails startup when dev auth is enabled in an unsafe environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-test-secret-123';

    const app = await createAuthApp();

    await expect(app.init()).rejects.toThrow(/DEV_AUTH_ENABLED=true is only allowed/i);
  });

  test('fails startup when dev auth is enabled without an explicit secret', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    delete process.env.DEV_AUTH_SECRET;

    const app = await createAuthApp();

    await expect(app.init()).rejects.toThrow(/DEV_AUTH_SECRET must be set/i);
  });

  test('fails startup when dev auth uses an obvious default secret', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret';

    const app = await createAuthApp();

    await expect(app.init()).rejects.toThrow(/DEV_AUTH_SECRET is too weak/i);
  });

  test('fails startup when dev auth uses a repo-shipped placeholder secret', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'replace-with-a-random-dev-auth-secret';

    const app = await createAuthApp();

    await expect(app.init()).rejects.toThrow(/DEV_AUTH_SECRET is too weak/i);
  });

  test('allows dev auth token minting in the test environment', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-test-secret-123';

    const app = await createAuthApp();
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .post('/dev-auth/token')
        .send({ sub: 'user-123', email: 'user@example.com', name: 'User Example' })
        .expect(201);

      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(20);
    } finally {
      await app.close();
    }
  }, 15_000);

  test('establishes a browser session cookie for dev auth login', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-test-secret-123';

    const app = await createAuthApp();
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .post('/dev-auth/token')
        .send({ sub: 'user-123', email: 'user@example.com', name: 'User Example' })
        .expect(201);

      const setCookie = response.headers['set-cookie'] ?? [];

      expect(setCookie.some((cookie) => /(?:__Host-)?atlaspm_session=/.test(cookie))).toBe(true);
      expect(setCookie.some((cookie) => /(?:__Host-)?atlaspm_csrf=/.test(cookie))).toBe(true);
    } finally {
      await app.close();
    }
  }, 15_000);

  test('accepts the dev session cookie as an auth credential', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'atlaspm-test-secret-123';

    const app = await createAuthApp();
    await app.init();

    try {
      const auth = app.get(AuthService);
      const token = await auth.mintDevToken('user-123', 'user@example.com', 'User Example');
      const user = await auth.verify(undefined, `atlaspm_session=${token}`);

      expect(user).toEqual({
        sub: 'user-123',
        email: 'user@example.com',
        name: 'User Example',
      });
    } finally {
      await app.close();
    }
  }, 15_000);
});
