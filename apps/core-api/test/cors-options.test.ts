import { describe, expect, test } from 'vitest';
import { buildCorsOptions, getAllowedCorsOrigins } from '../src/cors-options';

describe('buildCorsOptions', () => {
  test('allows localhost web-ui origin with credentials by default', () => {
    const cors = buildCorsOptions({});

    expect(cors.credentials).toBe(true);
    expect(getAllowedCorsOrigins({})).toEqual(['http://localhost:3000']);

    const origin = cors.origin as Exclude<typeof cors.origin, boolean | string | RegExp | Array<boolean | string | RegExp>>;
    origin('http://localhost:3000', (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
    });
  });

  test('rejects origins outside the configured allowlist', () => {
    const cors = buildCorsOptions({
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://atlaspm.example.com',
    });

    const origin = cors.origin as Exclude<typeof cors.origin, boolean | string | RegExp | Array<boolean | string | RegExp>>;
    origin('https://evil.example.com', (error, allowed) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/not allowed by CORS/i);
      expect(allowed).toBe(false);
    });
  });
});
