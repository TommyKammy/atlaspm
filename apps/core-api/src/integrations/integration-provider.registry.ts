import { Inject, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationProviderKey } from './integration-provider.contract';

export const INTEGRATION_PROVIDERS = Symbol('INTEGRATION_PROVIDERS');

@Injectable()
export class IntegrationProviderRegistry {
  private readonly providersByKey = new Map<IntegrationProviderKey, IntegrationProvider>();

  constructor(
    @Inject(INTEGRATION_PROVIDERS)
    providers: IntegrationProvider[] = [],
  ) {
    for (const provider of providers) {
      this.providersByKey.set(provider.key, provider);
    }
  }

  get(providerKey: IntegrationProviderKey): IntegrationProvider {
    const provider = this.providersByKey.get(providerKey);
    if (!provider) {
      throw new Error(`Integration provider not registered: ${providerKey}`);
    }
    return provider;
  }

  list(): IntegrationProvider[] {
    return Array.from(this.providersByKey.values());
  }
}
