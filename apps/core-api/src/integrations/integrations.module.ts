import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { INTEGRATION_PROVIDERS, IntegrationProviderRegistry } from './integration-provider.registry';
import { IntegrationRuntimeService } from './integration-runtime.service';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack.controller';
import { SlackIntegrationProvider } from './slack.provider';

@Module({
  controllers: [SlackWebhookController],
  providers: [
    PrismaService,
    SlackService,
    SlackIntegrationProvider,
    {
      provide: INTEGRATION_PROVIDERS,
      useFactory: (slackProvider: SlackIntegrationProvider) => [slackProvider],
      inject: [SlackIntegrationProvider],
    },
    IntegrationProviderRegistry,
    IntegrationRuntimeService,
  ],
  exports: [SlackService, IntegrationProviderRegistry, IntegrationRuntimeService],
})
export class IntegrationsModule {}
