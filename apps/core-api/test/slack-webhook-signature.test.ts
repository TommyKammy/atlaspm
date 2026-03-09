import { afterEach, describe, expect, test, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { ThrottlerModule } from '@nestjs/throttler';
import { SlackWebhookController } from '../src/integrations/slack.controller';
import { SlackService } from '../src/integrations/slack.service';

const ENV_KEYS = ['SLACK_SIGNING_SECRET', 'SLACK_BOT_TOKEN', 'SLACK_BOT_USER_ID'] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return {
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_BOT_USER_ID: process.env.SLACK_BOT_USER_ID,
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

async function createSlackApp(slackService: Pick<SlackService, 'isConfigured' | 'sendMentionResponse'>) {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
    controllers: [SlackWebhookController],
    providers: [{ provide: SlackService, useValue: slackService }],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

function signSlackBody(body: string, secret: string, timestamp: string): string {
  return `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`, 'utf8').digest('hex')}`;
}

describe('Slack webhook signature verification', () => {
  const envSnapshot = snapshotEnv();

  afterEach(async () => {
    restoreEnv(envSnapshot);
  });

  test('fails closed when SLACK_SIGNING_SECRET is missing', async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_BOT_USER_ID;

    const sendMentionResponse = vi.fn();
    const app = await createSlackApp({
      isConfigured: () => false,
      sendMentionResponse,
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ type: 'url_verification', challenge: 'challenge-token' }));

      expect(response.status).toBe(503);
      expect(response.body.challenge).toBeUndefined();
      expect(sendMentionResponse).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('rejects an invalid Slack signature before processing the event', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const sendMentionResponse = vi.fn();
    const app = await createSlackApp({
      isConfigured: () => true,
      sendMentionResponse,
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', `${Math.floor(Date.now() / 1000)}`)
        .set('x-slack-signature', 'v0=notavalidsignature')
        .send(
          JSON.stringify({
            type: 'event_callback',
            event: { type: 'app_mention', text: 'help', channel: 'C123', ts: '1710000000.000100' },
          }),
        );

      expect(response.status).toBe(401);
      expect(sendMentionResponse).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('rejects a stale Slack timestamp before processing the event', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const sendMentionResponse = vi.fn();
    const app = await createSlackApp({
      isConfigured: () => true,
      sendMentionResponse,
    });

    try {
      const body = JSON.stringify({
        type: 'event_callback',
        event: { type: 'app_mention', text: 'help', channel: 'C123', ts: '1710000000.000100' },
      });
      const timestamp = `${Math.floor(Date.now() / 1000) - 301}`;
      const signature = signSlackBody(body, process.env.SLACK_SIGNING_SECRET, timestamp);

      const response = await request(app.getHttpServer())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', timestamp)
        .set('x-slack-signature', signature)
        .send(body);

      expect(response.status).toBe(401);
      expect(sendMentionResponse).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('accepts a valid signed challenge when Slack verification is configured', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const sendMentionResponse = vi.fn();
    const app = await createSlackApp({
      isConfigured: () => false,
      sendMentionResponse,
    });

    try {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'challenge-token' });
      const timestamp = `${Math.floor(Date.now() / 1000)}`;
      const signature = signSlackBody(body, process.env.SLACK_SIGNING_SECRET, timestamp);

      const response = await request(app.getHttpServer())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', timestamp)
        .set('x-slack-signature', signature)
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ challenge: 'challenge-token' });
      expect(sendMentionResponse).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('processes a valid signed app mention event when verification passes', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const sendMentionResponse = vi.fn();
    const controller = new SlackWebhookController({
      isConfigured: () => true,
      sendMentionResponse,
    } as SlackService);
    const body = JSON.stringify({
      type: 'event_callback',
      event: { type: 'app_mention', text: 'help', channel: 'C123', ts: '1710000000.000100' },
    });
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const signature = signSlackBody(body, process.env.SLACK_SIGNING_SECRET, timestamp);

    const response = await controller.handleEvent(
      { rawBody: Buffer.from(body, 'utf8') } as never,
      { type: 'event_callback', event: { type: 'app_mention', text: 'help', channel: 'C123', ts: '1710000000.000100' } },
      signature,
      timestamp,
    );

    expect(response).toEqual({ ok: true });
    expect(sendMentionResponse).toHaveBeenCalledOnce();
    expect(sendMentionResponse).toHaveBeenCalledWith(
      'C123',
      '1710000000.000100',
      expect.stringContaining('Here are the commands I understand'),
    );
  });
});
