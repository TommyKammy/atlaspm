import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SlackService } from './slack.service';
import type { Request } from 'express';
import * as crypto from 'crypto';

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

const SLACK_MAX_SKEW_SECONDS = 300; // 5 minutes

/**
 * Verify Slack webhook signature to prevent forged requests
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(
  signingSecret: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  rawBody: Buffer | undefined,
): void {
  if (!signatureHeader || !timestampHeader) {
    throw new UnauthorizedException('Missing Slack signature headers');
  }

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    throw new UnauthorizedException('Raw body not available');
  }

  // Replay protection: verify timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > SLACK_MAX_SKEW_SECONDS) {
    throw new UnauthorizedException('Stale Slack request (possible replay)');
  }

  // Slack signature format: "v0=hex"
  if (!signatureHeader.startsWith('v0=')) {
    throw new UnauthorizedException('Unsupported Slack signature version');
  }

  const baseString = `v0:${timestampHeader}:${rawBody.toString('utf8')}`;
  const computedHash = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString, 'utf8')
    .digest('hex');
  const computedSignature = `v0=${computedHash}`;

  // Constant-time comparison to prevent timing attacks
  const computedBuf = Buffer.from(computedSignature, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');
  
  if (computedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(computedBuf, receivedBuf)) {
    throw new UnauthorizedException('Invalid Slack signature');
  }
}

@Controller('webhooks/slack')
export class SlackWebhookController {
  private readonly logger = new Logger(SlackWebhookController.name);

  constructor(private readonly slackService: SlackService) {}

  @Post('events')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async handleEvent(
    @Req() req: RawBodyRequest,
    @Body() payload: SlackEvent,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<{ challenge?: string; ok?: boolean }> {
    this.logger.debug('Received Slack event', { type: payload.type });

    // Verify signature BEFORE processing anything (including challenge)
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (signingSecret) {
      verifySlackSignature(signingSecret, signature, timestamp, req.rawBody);
    } else {
      this.logger.warn('SLACK_SIGNING_SECRET not configured, skipping signature verification');
    }

    // Now safe to return challenge
    if (payload.challenge) {
      return { challenge: payload.challenge };
    }

    if (payload.type === 'event_callback' && !payload.event) {
      throw new BadRequestException('Missing event payload');
    }

    if (!payload.event) {
      return { ok: true };
    }

    if (!this.slackService.isConfigured()) {
      this.logger.warn('Slack service not configured, ignoring event');
      return { ok: true };
    }

    const event = payload.event;

    if (event.bot_id) {
      this.logger.debug('Ignoring bot message');
      return { ok: true };
    }

    try {
      switch (event.type) {
        case 'app_mention':
          await this.handleAppMention(event);
          break;
        case 'message':
          if (event.text?.includes(`@${process.env.SLACK_BOT_USER_ID || 'AtlasPM'}`)) {
            await this.handleMentionInMessage(event);
          }
          break;
        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling Slack event', error);
    }

    return { ok: true };
  }

  private async handleAppMention(event: SlackEvent['event']): Promise<void> {
    if (!event?.channel || !event.ts) {
      this.logger.warn('Missing channel or timestamp in app_mention event');
      return;
    }

    const text = event.text || '';
    const response = await this.processCommand(text);

    await this.slackService.sendMentionResponse(
      event.channel,
      event.ts,
      response,
    );
  }

  private async handleMentionInMessage(event: SlackEvent['event']): Promise<void> {
    if (!event?.channel || !event.ts) {
      return;
    }

    const text = event.text || '';
    const response = await this.processCommand(text);

    await this.slackService.sendMentionResponse(
      event.channel,
      event.ts,
      response,
    );
  }

  private async processCommand(text: string): Promise<string> {
    const normalizedText = text.toLowerCase().trim();

    if (normalizedText.includes('help')) {
      return this.getHelpMessage();
    }

    if (normalizedText.includes('status')) {
      return ':white_check_mark: AtlasPM is running and ready to help you manage tasks!';
    }

    if (normalizedText.includes('task') || normalizedText.includes('create')) {
      return ':construction: Task creation via Slack is coming soon! For now, please use the web interface.';
    }

    if (normalizedText.includes('list') || normalizedText.includes('tasks')) {
      return ':clipboard: Task listing via Slack is coming soon! Please check the web dashboard for now.';
    }

    return `Hello! I'm AtlasPM Bot. :wave:\n\n${this.getHelpMessage()}`;
  }

  private getHelpMessage(): string {
    return (
      'Here are the commands I understand:\n' +
      '• `@AtlasPM help` - Show this help message\n' +
      '• `@AtlasPM status` - Check my status\n' +
      '• `@AtlasPM create task <title>` - Create a new task (coming soon)\n' +
      '• `@AtlasPM list tasks` - List your tasks (coming soon)\n\n' +
      'For full functionality, visit the AtlasPM web interface.'
    );
  }
}
