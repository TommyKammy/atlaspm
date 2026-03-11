import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IntegrationAuthorizationContext,
  IntegrationAuthorizationResult,
  IntegrationProvider,
  IntegrationSyncContext,
  IntegrationSyncResult,
  IntegrationWebhookContext,
  IntegrationWebhookResult,
  type IntegrationJobDefinition,
} from './integration-provider.contract';
import { SlackService } from './slack.service';

interface SlackEventPayload {
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

const SLACK_MAX_SKEW_SECONDS = 300;

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

  const now = Math.floor(Date.now() / 1000);
  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > SLACK_MAX_SKEW_SECONDS) {
    throw new UnauthorizedException('Stale Slack request (possible replay)');
  }

  if (!signatureHeader.startsWith('v0=')) {
    throw new UnauthorizedException('Unsupported Slack signature version');
  }

  const baseString = `v0:${timestampHeader}:${rawBody.toString('utf8')}`;
  const computedHash = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString, 'utf8')
    .digest('hex');
  const computedSignature = `v0=${computedHash}`;
  const computedBuf = Buffer.from(computedSignature, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');

  if (computedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(computedBuf, receivedBuf)) {
    throw new UnauthorizedException('Invalid Slack signature');
  }
}

@Injectable()
export class SlackIntegrationProvider implements IntegrationProvider {
  readonly key = 'slack' as const;
  readonly displayName = 'Slack';

  private readonly logger = new Logger(SlackIntegrationProvider.name);

  constructor(private readonly slackService: SlackService) {}

  async authorize(_context: IntegrationAuthorizationContext): Promise<IntegrationAuthorizationResult> {
    return {
      status: 'not_supported',
      message: 'Slack auth is managed through bot credentials and signing secrets outside the API.',
    };
  }

  async sync(_context: IntegrationSyncContext): Promise<IntegrationSyncResult> {
    return {
      status: 'not_supported',
      message: 'Slack sync is not implemented yet; webhook ingestion is the active integration path.',
    };
  }

  describeJobs(): IntegrationJobDefinition[] {
    return [
      {
        jobKey: 'slack.webhook.ingest',
        trigger: 'webhook',
        description: 'Verifies Slack signatures and dispatches inbound events through the shared provider registry.',
      },
      {
        jobKey: 'slack.task.notify',
        trigger: 'event',
        description: 'Sends outbound task notifications using shared audit/outbox infrastructure.',
      },
    ];
  }

  async handleWebhook(
    context: IntegrationWebhookContext<SlackEventPayload>,
  ): Promise<IntegrationWebhookResult> {
    this.logger.debug('Received Slack event', { type: context.payload.type });

    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      this.logger.error('SLACK_SIGNING_SECRET not configured; rejecting Slack webhook request');
      throw new ServiceUnavailableException('Slack webhook verification is not configured');
    }

    verifySlackSignature(
      signingSecret,
      context.headers['x-slack-signature'],
      context.headers['x-slack-request-timestamp'],
      context.rawBody,
    );

    if (context.payload.challenge) {
      return {
        accepted: true,
        responseBody: { challenge: context.payload.challenge },
      };
    }

    if (context.payload.type === 'event_callback' && !context.payload.event) {
      throw new BadRequestException('Missing event payload');
    }

    if (!context.payload.event) {
      return { accepted: true, responseBody: { ok: true } };
    }

    if (!this.slackService.isConfigured()) {
      this.logger.warn('Slack service not configured, ignoring event');
      return { accepted: true, responseBody: { ok: true } };
    }

    const event = context.payload.event;

    if (event.bot_id) {
      this.logger.debug('Ignoring bot message');
      return { accepted: true, responseBody: { ok: true } };
    }

    try {
      switch (event.type) {
        case 'app_mention':
          await this.handleMention(event);
          break;
        case 'message':
          if (event.text?.includes(`@${process.env.SLACK_BOT_USER_ID || 'AtlasPM'}`)) {
            await this.handleMention(event);
          }
          break;
        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling Slack event', error);
    }

    return { accepted: true, responseBody: { ok: true } };
  }

  private async handleMention(event: NonNullable<SlackEventPayload['event']>): Promise<void> {
    if (!event.channel || !event.ts) {
      this.logger.warn('Missing channel or timestamp in Slack event');
      return;
    }

    const response = await this.processCommand(event.text || '');
    await this.slackService.sendMentionResponse(event.channel, event.ts, response);
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
