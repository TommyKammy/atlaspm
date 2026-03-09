import { getValidatedDevAuthSecret } from './dev-auth-secret';

const SAFE_DEV_AUTH_NODE_ENVS = new Set(['development', 'test']);

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

export function assertSafeDevAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (!isDevAuthEnabled(env)) {
    return;
  }

  if (!isSafeDevAuthEnvironment(env)) {
    const receivedNodeEnv = normalizeNodeEnv(env.NODE_ENV) ?? '(unset)';
    throw new Error(
      `DEV_AUTH_ENABLED=true is only allowed when NODE_ENV is one of: development, test. Received NODE_ENV=${receivedNodeEnv}.`,
    );
  }

  getValidatedDevAuthSecret(env);
}
