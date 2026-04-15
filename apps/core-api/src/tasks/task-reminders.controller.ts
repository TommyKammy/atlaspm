import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { IsISO8601 } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { TaskRemindersService } from './task-reminders.service';

class UpsertTaskReminderDto {
  @IsISO8601()
  remindAt!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class TaskRemindersController {
  constructor(@Inject(TaskRemindersService) private readonly reminders: TaskRemindersService) {}

  @Get('tasks/:id/reminder')
  async getMyReminder(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    return this.reminders.getMyReminder(taskId, req);
  }

  @Put('tasks/:id/reminder')
  async upsertMyReminder(
    @Param('id') taskId: string,
    @Body() body: UpsertTaskReminderDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.reminders.upsertMyReminder(taskId, body.remindAt, req);
  }

  @Delete('tasks/:id/reminder')
  async clearMyReminder(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    return this.reminders.clearMyReminder(taskId, req);
  }
}
