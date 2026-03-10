import { expect, test as base } from '@playwright/test';

function captureDevTokenScript() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const input = args[0];
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    if (url.includes('/dev-auth/token') && response.ok) {
      try {
        const data = await response.clone().json();
        if (data && typeof data.token === 'string') {
          window.localStorage.setItem('atlaspm_token', data.token);
        }
      } catch {
        // Ignore non-JSON or failed clones; the page request should continue normally.
      }
    }

    return response;
  };
}

export const test = base.extend({
  browser: async ({ browser }, use) => {
    const wrappedBrowser = new Proxy(browser, {
      get(target, prop, receiver) {
        if (prop === 'newContext') {
          return async (...args: Parameters<typeof browser.newContext>) => {
            const context = await target.newContext(...args);
            await context.addInitScript(captureDevTokenScript);
            return context;
          };
        }

        return Reflect.get(target, prop, receiver);
      },
    });

    await use(wrappedBrowser as typeof browser);
  },
  context: async ({ context }, use) => {
    await context.addInitScript(captureDevTokenScript);
    await use(context);
  },
});

export { expect };
export type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
