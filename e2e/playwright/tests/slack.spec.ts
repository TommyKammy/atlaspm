import crypto from 'crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';
const SLACK_SIGNING_SECRET =
  process.env.E2E_SLACK_SIGNING_SECRET ?? 'atlaspm-e2e-slack-signing-secret-123';

function signSlackBody(body: string, timestamp: string): string {
  return `v0=${crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`, 'utf8')
    .digest('hex')}`;
}

async function postSlackEvent(
  request: APIRequestContext,
  payload: Record<string, unknown>,
) {
  const body = JSON.stringify(payload);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;

  return request.post(`${API}/webhooks/slack/events`, {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signSlackBody(body, timestamp),
    },
  });
}

test('Slack webhook endpoint handles challenge verification', async ({ request }) => {
  const challenge = 'test-challenge-123';

  const response = await postSlackEvent(request, {
    type: 'url_verification',
    challenge,
    token: 'test-token',
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.challenge).toBe(challenge);
});

test('Slack webhook handles app_mention event', async ({ request }) => {
  const response = await postSlackEvent(request, {
    type: 'event_callback',
    token: 'test-token',
    event: {
      type: 'app_mention',
      user: 'U123456',
      text: '<@U123> help',
      channel: 'C123456',
      ts: '1234567890.123456',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook handles message with mention', async ({ request }) => {
  const response = await postSlackEvent(request, {
    type: 'event_callback',
    token: 'test-token',
    event: {
      type: 'message',
      user: 'U123456',
      text: 'Hey @AtlasPM, what is your status?',
      channel: 'C123456',
      ts: '1234567890.123456',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook ignores bot messages', async ({ request }) => {
  const response = await postSlackEvent(request, {
    type: 'event_callback',
    token: 'test-token',
    event: {
      type: 'message',
      user: 'U123456',
      bot_id: 'B123456',
      text: 'Bot message',
      channel: 'C123456',
      ts: '1234567890.123456',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook handles status command', async ({ request }) => {
  const response = await postSlackEvent(request, {
    type: 'event_callback',
    token: 'test-token',
    event: {
      type: 'app_mention',
      user: 'U123456',
      text: '<@U123> status',
      channel: 'C123456',
      ts: '1234567890.123456',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook returns error for missing event payload', async ({ request }) => {
  const response = await postSlackEvent(request, {
    type: 'event_callback',
    token: 'test-token',
  });

  expect(response.status()).toBe(400);
});
