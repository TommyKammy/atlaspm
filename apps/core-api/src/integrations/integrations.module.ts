import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonServicesModule } from '../common/common-services.module';
import { INTEGRATION_PROVIDERS, IntegrationProviderRegistry } from './integration-provider.registry';
import { IntegrationRuntimeService } from './integration-runtime.service';
import { GithubApiService } from './github-api.service';
import { GithubIntegrationProvider } from './github.provider';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack.controller';
import { SlackIntegrationProvider } from './slack.provider';

@Module({
  imports: [AuthModule, CommonServicesModule],
  controllers: [SlackWebhookController, IntegrationsController],
  providers: [
    GithubApiService,
    IntegrationCredentialsService,
    IntegrationsService,
    SlackService,
    SlackIntegrationProvider,
    GithubIntegrationProvider,
    {
      provide: INTEGRATION_PROVIDERS,
      useFactory: (
        slackProvider: SlackIntegrationProvider,
        githubProvider: GithubIntegrationProvider,
      ) => [slackProvider, githubProvider],
      inject: [SlackIntegrationProvider, GithubIntegrationProvider],
    },
    IntegrationProviderRegistry,
    IntegrationRuntimeService,
  ],
  exports: [
    SlackService,
    IntegrationProviderRegistry,
    IntegrationRuntimeService,
    IntegrationCredentialsService,
    IntegrationsService,
  ],
})
export class IntegrationsModule {}
