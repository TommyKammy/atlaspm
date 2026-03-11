import { describe, expect, test } from 'vitest';
import { IntegrationProviderRegistry } from '../src/integrations/integration-provider.registry';
import type { IntegrationProvider } from '../src/integrations/integration-provider.contract';

function createProvider(key: IntegrationProvider['key']): IntegrationProvider {
  return {
    key,
    displayName: `provider-${key}`,
    async authorize() {
      return { status: 'not_supported' };
    },
    async sync() {
      return { status: 'not_supported' };
    },
    async handleWebhook() {
      return { accepted: true, responseBody: { ok: true } };
    },
    describeJobs() {
      return [];
    },
  };
}

describe('IntegrationProviderRegistry', () => {
  test('throws when duplicate provider keys are registered', () => {
    expect(() => {
      new IntegrationProviderRegistry([createProvider('slack'), createProvider('slack')]);
    }).toThrow('Duplicate integration provider key detected: slack');
  });
});
