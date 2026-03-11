import { InternalServerErrorException } from '@nestjs/common';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IntegrationCredentialKind } from '@prisma/client';
import { IntegrationCredentialsService } from '../src/integrations/integration-credentials.service';

describe('IntegrationCredentialsService', () => {
  beforeEach(() => {
    process.env.INTEGRATION_CREDENTIAL_SECRET = 'integration-credential-secret-1234567890';
  });

  test('redact fully masks very short secrets', () => {
    const service = new IntegrationCredentialsService({} as never);

    expect(service.redact('abcd')).toBe('****');
    expect(service.redact(' abc ')).toBe('***');
    expect(service.redact('abcde')).toBe('a...e');
    expect(service.redact('github-test-token')).toBe('gith...oken');
  });

  test('upsertCredential rejects weak integration credential secrets', async () => {
    process.env.INTEGRATION_CREDENTIAL_SECRET = ' too-short-secret ';

    const upsert = vi.fn();
    const service = new IntegrationCredentialsService({
      integrationCredential: {
        upsert,
      },
    } as never);

    await expect(
      service.upsertCredential('cfg-1', IntegrationCredentialKind.ACCESS_TOKEN, 'secret-token'),
    ).rejects.toThrowError(
      new InternalServerErrorException(
        'INTEGRATION_CREDENTIAL_SECRET must be at least 32 characters long',
      ),
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
