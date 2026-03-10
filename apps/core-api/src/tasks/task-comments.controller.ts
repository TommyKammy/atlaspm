import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { TaskCommentsService } from './task-comments.service';

class CreateTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

class PatchTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class TaskCommentsController {
  constructor(@Inject(TaskCommentsService) private readonly comments: TaskCommentsService) {}

  @Get('tasks/:id/mentions')
  async listMentions(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    return this.comments.listMentions(taskId, req);
  }

  @Get('tasks/:id/comments')
  async listComments(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    return this.comments.listComments(taskId, req);
  }

  @Post('tasks/:id/comments')
  async createComment(
    @Param('id') taskId: string,
    @Body() body: CreateTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.comments.createComment(taskId, body.body, req);
  }

  @Patch('comments/:id')
  async patchComment(
    @Param('id') id: string,
    @Body() body: PatchTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.comments.patchComment(id, body.body, req);
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    return this.comments.deleteComment(id, req);
  }
}
