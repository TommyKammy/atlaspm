const SAFE_DEV_AUTH_NODE_ENVS = new Set(['development', 'test', 'local']);

export function getDevAuthEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return (env.NODE_ENV ?? 'development').trim().toLowerCase();
}

export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.DEV_AUTH_ENABLED === 'true';
}

export function isDevAuthEnvironmentSafe(env: NodeJS.ProcessEnv = process.env) {
  return SAFE_DEV_AUTH_NODE_ENVS.has(getDevAuthEnvironment(env));
}

export function shouldRegisterDevAuthController(env: NodeJS.ProcessEnv = process.env) {
  return isDevAuthEnabled(env) && isDevAuthEnvironmentSafe(env);
}

export function assertSafeDevAuthEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (!isDevAuthEnabled(env) || isDevAuthEnvironmentSafe(env)) {
    return;
  }

  const currentEnv = getDevAuthEnvironment(env);
  throw new Error(
    `DEV_AUTH_ENABLED=true is only allowed when NODE_ENV is one of development, test, or local; received ${currentEnv}`,
  );
}
