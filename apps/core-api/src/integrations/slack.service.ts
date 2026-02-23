import { Injectable } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import type { Task, User } from '@prisma/client';

interface TaskWithAssignee extends Task {
  assignee?: User | null;
}

@Injectable()
export class SlackService {
  private client: WebClient | null = null;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN;
    if (token) {
      this.client = new WebClient(token);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async sendTaskNotification(
    channel: string,
    task: TaskWithAssignee,
    event: string,
    taskUrl?: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Slack client not configured. Set SLACK_BOT_TOKEN environment variable.');
    }

    const message = this.formatTaskMessage(task, event);
    const blocks = this.buildTaskBlocks(task, event, taskUrl);

    await this.client.chat.postMessage({
      channel,
      text: message,
      blocks,
    });
  }

  async sendMentionResponse(
    channel: string,
    threadTs: string,
    text: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Slack client not configured.');
    }

    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
    });
  }

  async getUserInfo(userId: string): Promise<{ name: string; email?: string } | null> {
    if (!this.client) {
      return null;
    }

    try {
      const result = await this.client.users.info({ user: userId });
      if (result.ok && result.user) {
        return {
          name: result.user.real_name || result.user.name || 'Unknown',
          email: result.user.profile?.email,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private formatTaskMessage(task: TaskWithAssignee, event: string): string {
    const assigneeName = task.assignee?.displayName || 'Unassigned';
    return `${event}: ${task.title} (Assignee: ${assigneeName})`;
  }

  private buildTaskBlocks(
    task: TaskWithAssignee,
    event: string,
    taskUrl?: string,
  ): Array<{
    type: string;
    text?: { type: string; text: string };
    elements?: Array<{ type: string; text: string }>;
  }> {
    const assigneeName = task.assignee?.displayName || 'Unassigned';

    const blocks: Array<{
      type: string;
      text?: { type: string; text: string };
      elements?: Array<{ type: string; text: string }>;
    }> = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: taskUrl
            ? `*${event}*\n<${taskUrl}|${task.title}>`
            : `*${event}*\n${task.title}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Assignee: ${assigneeName}`,
          },
        ],
      },
    ];

    return blocks;
  }
}
