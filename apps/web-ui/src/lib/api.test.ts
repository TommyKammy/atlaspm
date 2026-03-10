import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './api';

describe('api auth transport', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { cookie: 'atlaspm_csrf=test-csrf' });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'legacy-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
  });

  test('uses session credentials instead of browser bearer storage', async () => {
    await api('/projects');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(request?.credentials).toBe('include');
    expect(request?.headers).not.toHaveProperty('authorization');
  });

  test('sends the CSRF token for unsafe methods', async () => {
    await api('/projects', {
      method: 'POST',
      body: { name: 'Project Atlas' },
    });

    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(request?.credentials).toBe('include');
    expect(request?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-atlaspm-csrf': 'test-csrf',
    });
  });
});
