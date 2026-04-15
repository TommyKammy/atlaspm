import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { MAX_IMAGE_UPLOAD_BYTES } from './task-attachments.constants';
import { CompleteAttachmentDto, InitiateAttachmentDto } from './task-attachments.dto';
import { TaskAttachmentsService } from './task-attachments.service';

@Controller()
@UseGuards(AuthGuard)
export class TaskAttachmentsController {
  constructor(@Inject(TaskAttachmentsService) private readonly attachments: TaskAttachmentsService) {}

  @Get('tasks/:id/attachments')
  async listAttachments(
    @Param('id') taskId: string,
    @Query('includeDeleted') includeDeletedRaw: string | undefined,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.attachments.listAttachments(taskId, includeDeletedRaw, req);
  }

  @Post('tasks/:id/attachments/initiate')
  async initiateAttachment(
    @Param('id') taskId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        expectedType: InitiateAttachmentDto,
      }),
    )
    body: InitiateAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.attachments.initiateAttachment(taskId, body, req);
  }

  @Post('attachments/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Query('token') token: string,
    @UploadedFile() file: { mimetype: string; size: number; buffer: Buffer },
    @CurrentRequest() req: AppRequest,
  ) {
    return this.attachments.uploadAttachment(id, token, file, req);
  }

  @Post('tasks/:id/attachments/complete')
  async completeAttachment(
    @Param('id') taskId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        expectedType: CompleteAttachmentDto,
      }),
    )
    body: CompleteAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.attachments.completeAttachment(taskId, body.attachmentId, req);
  }

  @Delete('attachments/:id')
  async deleteAttachment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    return this.attachments.deleteAttachment(id, req);
  }

  @Post('attachments/:id/restore')
  async restoreAttachment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    return this.attachments.restoreAttachment(id, req);
  }
}
