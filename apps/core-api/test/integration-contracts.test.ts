import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const schemaPath = path.join(repoRoot, 'apps/core-api/prisma/schema.prisma');
const providerContractPath = path.join(
  repoRoot,
  'apps/core-api/src/integrations/integration-provider.contract.ts',
);

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('integration provider contracts', () => {
  test('defines storage models for provider config, credentials, sync state, and mappings', () => {
    const schema = readFile(schemaPath);

    expect(schema).toContain('model IntegrationProviderConfig');
    expect(schema).toContain('model IntegrationCredential');
    expect(schema).toContain('model IntegrationSyncState');
    expect(schema).toContain('model IntegrationEntityMapping');
  });

  test('defines an explicit provider abstraction for auth, sync, and webhook handling', () => {
    expect(fs.existsSync(providerContractPath)).toBe(true);

    const providerContract = readFile(providerContractPath);

    expect(providerContract).toContain('export interface IntegrationProvider');
    expect(providerContract).toContain('authorize');
    expect(providerContract).toContain('sync');
    expect(providerContract).toContain('handleWebhook');
  });
});
