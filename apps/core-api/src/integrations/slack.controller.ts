import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Inject,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { THROTTLE_POLICIES } from '../common/throttling';
import { IntegrationProviderRegistry } from './integration-provider.registry';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface SlackEvent {
  type: string;
  event?: {
    type: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
  };
  challenge?: string;
}

@Controller('webhooks/slack')
export class SlackWebhookController {
  constructor(
    @Inject(IntegrationProviderRegistry)
    private readonly providerRegistry: IntegrationProviderRegistry,
  ) {}

  @Post('events')
  @Throttle({ default: THROTTLE_POLICIES.strictPublicWebhook })
  async handleEvent(
    @Req() req: RawBodyRequest,
    @Body() payload: SlackEvent,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<{ challenge?: string; ok?: boolean }> {
    const provider = this.providerRegistry.get('slack');
    const result = await provider.handleWebhook({
      eventType: 'events',
      headers: {
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
      },
      rawBody: req.rawBody,
      payload,
      receivedAt: new Date(),
    });

    return result.responseBody as { challenge?: string; ok?: boolean };
  }
}
