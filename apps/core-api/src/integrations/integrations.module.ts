import { Module } from '@nestjs/common';
import { INTEGRATION_PROVIDERS, IntegrationProviderRegistry } from './integration-provider.registry';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack.controller';
import { SlackIntegrationProvider } from './slack.provider';

@Module({
  controllers: [SlackWebhookController],
  providers: [
    SlackService,
    SlackIntegrationProvider,
    {
      provide: INTEGRATION_PROVIDERS,
      useFactory: (slackProvider: SlackIntegrationProvider) => [slackProvider],
      inject: [SlackIntegrationProvider],
    },
    IntegrationProviderRegistry,
  ],
  exports: [SlackService, IntegrationProviderRegistry],
})
export class IntegrationsModule {}
