import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SlackService } from './slack.service';

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
  private readonly logger = new Logger(SlackWebhookController.name);

  constructor(private readonly slackService: SlackService) {}

  @Post('events')
  async handleEvent(
    @Body() payload: SlackEvent,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<{ challenge?: string; ok?: boolean }> {
    this.logger.debug('Received Slack event', { type: payload.type });

    if (payload.challenge) {
      return { challenge: payload.challenge };
    }

    if (!this.slackService.isConfigured()) {
      this.logger.warn('Slack service not configured, ignoring event');
      return { ok: true };
    }

    if (!payload.event) {
      throw new BadRequestException('Missing event payload');
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
