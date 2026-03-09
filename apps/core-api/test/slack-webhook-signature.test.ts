import { afterEach, describe, expect, test, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { IntegrationsModule } from '../src/integrations/integrations.module';
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

async function createIntegrationsApp(slackServiceOverride: Pick<SlackService, 'isConfigured' | 'sendMentionResponse'>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [IntegrationsModule] })
    .overrideProvider(SlackService)
    .useValue(slackServiceOverride)
    .compile();

  const app = moduleRef.createNestApplication();
  return app;
}

function createSlackController(slackServiceOverride: Pick<SlackService, 'isConfigured' | 'sendMentionResponse'>) {
  return new SlackWebhookController(slackServiceOverride as SlackService);
}

function createSlackSignature(signingSecret: string, rawBody: string, timestamp: string): string {
  return `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, 'utf8')
    .digest('hex')}`;
}

async function postSlackEvent(
  app: INestApplication,
  payload: Record<string, unknown>,
  options?: { signingSecret?: string; signature?: string; timestamp?: string },
) {
  const rawBody = JSON.stringify(payload);
  const timestamp = options?.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature =
    options?.signature ??
    (options?.signingSecret ? createSlackSignature(options.signingSecret, rawBody, timestamp) : undefined);

  let req = request(app.getHttpServer())
    .post('/webhooks/slack/events')
    .set('content-type', 'application/json');

  if (signature) {
    req = req.set('x-slack-signature', signature);
  }

  if (timestamp) {
    req = req.set('x-slack-request-timestamp', timestamp);
  }

  return req.send(rawBody);
}

function createSignedSlackRequest(payload: Record<string, unknown>, signingSecret: string, timestamp?: string) {
  const rawBody = JSON.stringify(payload);
  const resolvedTimestamp = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = createSlackSignature(signingSecret, rawBody, resolvedTimestamp);

  return {
    payload,
    rawBody: Buffer.from(rawBody, 'utf8'),
    timestamp: resolvedTimestamp,
    signature,
  };
}

describe('Slack webhook signature verification', () => {
  const envSnapshot = snapshotEnv();

  afterEach(async () => {
    restoreEnv(envSnapshot);
  });

  test('fails closed when the signing secret is missing', async () => {
    delete process.env.SLACK_SIGNING_SECRET;

    const slackService = {
      isConfigured: vi.fn(() => true),
      sendMentionResponse: vi.fn(),
    };

    const app = await createIntegrationsApp(slackService);
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ type: 'url_verification', challenge: 'challenge-token' }));

      expect(response.status).toBe(503);
      expect(slackService.sendMentionResponse).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('rejects an invalid signature without processing the payload', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const slackService = {
      isConfigured: vi.fn(() => true),
      sendMentionResponse: vi.fn(),
    };
    const controller = createSlackController(slackService);

    await expect(
      controller.handleEvent(
        {
          rawBody: Buffer.from(
            JSON.stringify({
              type: 'event_callback',
              event: { type: 'app_mention', channel: 'C123', ts: '123.456', text: 'status' },
            }),
            'utf8',
          ),
        } as never,
        {
          type: 'event_callback',
          event: { type: 'app_mention', channel: 'C123', ts: '123.456', text: 'status' },
        },
        'v0=deadbeef',
        Math.floor(Date.now() / 1000).toString(),
      ),
    ).rejects.toThrow(/Invalid Slack signature/);

    expect(slackService.sendMentionResponse).not.toHaveBeenCalled();
  });

  test('rejects a stale signature without processing the payload', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const slackService = {
      isConfigured: vi.fn(() => true),
      sendMentionResponse: vi.fn(),
    };

    const controller = createSlackController(slackService);
    const staleRequest = createSignedSlackRequest(
      {
        type: 'event_callback',
        event: { type: 'app_mention', channel: 'C123', ts: '123.456', text: 'status' },
      },
      process.env.SLACK_SIGNING_SECRET,
      (Math.floor(Date.now() / 1000) - 301).toString(),
    );

    await expect(
      controller.handleEvent(
        { rawBody: staleRequest.rawBody } as never,
        staleRequest.payload,
        staleRequest.signature,
        staleRequest.timestamp,
      ),
    ).rejects.toThrow(/Stale Slack request/);

    expect(slackService.sendMentionResponse).not.toHaveBeenCalled();
  });

  test('accepts a valid signed challenge request', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const slackService = {
      isConfigured: vi.fn(() => false),
      sendMentionResponse: vi.fn(),
    };

    const controller = createSlackController(slackService);
    const signedRequest = createSignedSlackRequest(
      { type: 'url_verification', challenge: 'challenge-token' },
      process.env.SLACK_SIGNING_SECRET,
    );

    await expect(
      controller.handleEvent(
        { rawBody: signedRequest.rawBody } as never,
        signedRequest.payload,
        signedRequest.signature,
        signedRequest.timestamp,
      ),
    ).resolves.toEqual({ challenge: 'challenge-token' });

    expect(slackService.sendMentionResponse).not.toHaveBeenCalled();
  });

  test('processes a valid signed app mention event', async () => {
    process.env.SLACK_SIGNING_SECRET = 'atlaspm-slack-signing-secret';

    const slackService = {
      isConfigured: vi.fn(() => true),
      sendMentionResponse: vi.fn().mockResolvedValue(undefined),
    };

    const controller = createSlackController(slackService);
    const signedRequest = createSignedSlackRequest(
      {
        type: 'event_callback',
        event: { type: 'app_mention', channel: 'C123', ts: '123.456', text: 'status' },
      },
      process.env.SLACK_SIGNING_SECRET,
    );

    await expect(
      controller.handleEvent(
        { rawBody: signedRequest.rawBody } as never,
        signedRequest.payload,
        signedRequest.signature,
        signedRequest.timestamp,
      ),
    ).resolves.toEqual({ ok: true });

    expect(slackService.sendMentionResponse).toHaveBeenCalledWith(
      'C123',
      '123.456',
      ':white_check_mark: AtlasPM is running and ready to help you manage tasks!',
    );
  });
});
