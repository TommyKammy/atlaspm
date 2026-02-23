import { Controller, Get, NotFoundException, Param, StreamableFile, Res } from '@nestjs/common';
import type { Response } from 'express';
import { promises as fs } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAttachmentPath } from './attachment-storage';

@Controller('public')
export class PublicAttachmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('attachments/:id/:token')
  async content(
    @Param('id') id: string,
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await this.prisma.taskAttachment.findUnique({ where: { id } });
    if (!attachment || attachment.deletedAt || !attachment.completedAt) {
      throw new NotFoundException('Attachment not found');
    }
    if (!attachment.uploadToken || attachment.uploadToken !== token) {
      throw new NotFoundException('Attachment not found');
    }
    const file = await fs.readFile(resolveAttachmentPath(attachment.storageKey)).catch(() => null);
    if (!file) throw new NotFoundException('Attachment not found');

    res.setHeader('content-type', attachment.mimeType);
    res.setHeader('cache-control', 'private, max-age=60');
    return new StreamableFile(file);
  }
}
