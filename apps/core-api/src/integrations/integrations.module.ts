import { Module } from '@nestjs/common';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack.controller';

@Module({
  controllers: [SlackWebhookController],
  providers: [SlackService],
  exports: [SlackService],
})
export class IntegrationsModule {}
