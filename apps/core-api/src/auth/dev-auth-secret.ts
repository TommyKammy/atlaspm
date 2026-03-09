const REJECTED_DEV_AUTH_SECRETS = new Set(['dev-secret', 'dev-secret-change-me']);
const MIN_DEV_AUTH_SECRET_LENGTH = 16;

function normalizeSecret(secret: string | undefined): string | null {
  const normalized = secret?.trim();
  return normalized ? normalized : null;
}

export function getValidatedDevAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = normalizeSecret(env.DEV_AUTH_SECRET);

  if (secret === null) {
    throw new Error('DEV_AUTH_SECRET must be explicitly set when DEV_AUTH_ENABLED=true.');
  }

  if (REJECTED_DEV_AUTH_SECRETS.has(secret)) {
    throw new Error('DEV_AUTH_SECRET must not use a default or placeholder dev auth secret.');
  }

  if (secret.length < MIN_DEV_AUTH_SECRET_LENGTH) {
    throw new Error(`DEV_AUTH_SECRET must be at least ${MIN_DEV_AUTH_SECRET_LENGTH} characters long.`);
  }

  return secret;
}
