import { expect, test } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

test('Slack webhook endpoint handles challenge verification', async ({ request }) => {
  const challenge = 'test-challenge-123';
  
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
      type: 'url_verification',
      challenge,
      token: 'test-token',
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.challenge).toBe(challenge);
});

test('Slack webhook handles app_mention event', async ({ request }) => {
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
      type: 'event_callback',
      token: 'test-token',
      event: {
        type: 'app_mention',
        user: 'U123456',
        text: '<@U123> help',
        channel: 'C123456',
        ts: '1234567890.123456',
      },
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook handles message with mention', async ({ request }) => {
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
      type: 'event_callback',
      token: 'test-token',
      event: {
        type: 'message',
        user: 'U123456',
        text: 'Hey @AtlasPM, what is your status?',
        channel: 'C123456',
        ts: '1234567890.123456',
      },
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook ignores bot messages', async ({ request }) => {
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
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
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook handles status command', async ({ request }) => {
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
      type: 'event_callback',
      token: 'test-token',
      event: {
        type: 'app_mention',
        user: 'U123456',
        text: '<@U123> status',
        channel: 'C123456',
        ts: '1234567890.123456',
      },
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test('Slack webhook returns error for missing event payload', async ({ request }) => {
  const response = await request.post(`${API}/webhooks/slack/events`, {
    data: {
      type: 'event_callback',
      token: 'test-token',
    },
    headers: {
      'content-type': 'application/json',
    },
  });

  expect(response.status()).toBe(400);
});
