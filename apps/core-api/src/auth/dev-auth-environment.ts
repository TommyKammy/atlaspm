const SAFE_DEV_AUTH_NODE_ENVS = new Set(['development', 'test']);
const DEV_AUTH_SECRET_MIN_LENGTH = 16;
const DISALLOWED_DEV_AUTH_SECRETS = new Set([
  'dev-secret',
  'dev-secret-change-me',
  'replace-with-a-random-dev-auth-secret',
  'replace-me',
  'change-me',
  'changeme',
  'secret',
  'password',
]);

function normalizeNodeEnv(nodeEnv: string | undefined): string | null {
  const normalized = nodeEnv?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_AUTH_ENABLED === 'true';
}

export function isSafeDevAuthEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
  return nodeEnv !== null && SAFE_DEV_AUTH_NODE_ENVS.has(nodeEnv);
}

export function shouldRegisterDevAuthController(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDevAuthEnabled(env) && isSafeDevAuthEnvironment(env);
}

export function getValidatedDevAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.DEV_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error('DEV_AUTH_SECRET must be set when DEV_AUTH_ENABLED=true.');
  }

  if (secret.length < DEV_AUTH_SECRET_MIN_LENGTH) {
    throw new Error(`DEV_AUTH_SECRET is too weak. Use at least ${DEV_AUTH_SECRET_MIN_LENGTH} characters.`);
  }

  if (DISALLOWED_DEV_AUTH_SECRETS.has(secret.toLowerCase())) {
    throw new Error('DEV_AUTH_SECRET is too weak. Choose a non-default secret.');
  }

  return secret;
}

export function assertSafeDevAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (!isDevAuthEnabled(env)) {
    return;
  }

  getValidatedDevAuthSecret(env);

  if (isSafeDevAuthEnvironment(env)) {
    return;
  }

  const receivedNodeEnv = normalizeNodeEnv(env.NODE_ENV) ?? '(unset)';
  throw new Error(
    `DEV_AUTH_ENABLED=true is only allowed when NODE_ENV is one of: development, test. Received NODE_ENV=${receivedNodeEnv}.`,
  );
}
