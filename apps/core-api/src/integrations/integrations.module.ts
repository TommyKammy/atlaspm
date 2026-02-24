import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 10,  // 10 requests per minute
      },
    ]),
  ],
  controllers: [SlackWebhookController],
  providers: [SlackService],
  exports: [SlackService],
})
export class IntegrationsModule {}
