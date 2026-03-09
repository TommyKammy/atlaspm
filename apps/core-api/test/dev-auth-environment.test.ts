import { afterEach, describe, expect, test, vi } from 'vitest';
import { Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { DevAuthModule } from '../src/auth/dev-auth.module';
import {
  assertSafeDevAuthEnvironment,
  isDevAuthEnvironmentSafe,
  shouldRegisterDevAuthController,
} from '../src/auth/dev-auth-environment';

const originalEnv = { ...process.env };

async function createApp() {
  @Module({
    imports: [AuthModule, ...(shouldRegisterDevAuthController() ? [DevAuthModule] : [])],
  })
  class TestAuthModule {}

  const moduleRef = await Test.createTestingModule({ imports: [TestAuthModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

describe('dev auth environment controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  test('registers /dev-auth/token in development when dev auth is enabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret-change-me';

    const app = await createApp();
    try {
      const response = await request(app.getHttpServer())
        .post('/dev-auth/token')
        .send({ sub: 'dev-user', email: 'dev@example.com', name: 'Dev User' });

      expect(response.status).toBe(201);
      expect(typeof response.body.token).toBe('string');
    } finally {
      await app.close();
    }
  });

  test('does not register /dev-auth/token in production even when dev auth is enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret-change-me';

    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/dev-auth/token')
        .send({ sub: 'prod-user' })
        .expect(404);
    } finally {
      await app.close();
    }
  });

  test('does not register /dev-auth/token when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;
    process.env.DEV_AUTH_ENABLED = 'true';
    process.env.DEV_AUTH_SECRET = 'dev-secret-change-me';

    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/dev-auth/token')
        .send({ sub: 'unset-user' })
        .expect(404);
    } finally {
      await app.close();
    }
  });

  test('treats test as a safe dev auth environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_ENABLED = 'true';

    expect(isDevAuthEnvironmentSafe()).toBe(true);
    expect(() => assertSafeDevAuthEnvironment()).not.toThrow();
  });

  test('fails fast when dev auth is enabled in an unsafe environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_ENABLED = 'true';

    expect(() => assertSafeDevAuthEnvironment()).toThrow(
      'DEV_AUTH_ENABLED=true is only allowed when NODE_ENV is one of development, test, or local; received production',
    );
  });

  test('fails fast when dev auth is enabled and NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    process.env.DEV_AUTH_ENABLED = 'true';

    expect(() => assertSafeDevAuthEnvironment()).toThrow(
      'DEV_AUTH_ENABLED=true is only allowed when NODE_ENV is one of development, test, or local; received unset',
    );
  });
});
