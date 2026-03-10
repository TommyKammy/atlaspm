import { Controller, Get, Inject, NotFoundException, Param, Query, StreamableFile, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { promises as fs } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAttachmentPath } from './attachment-storage';
import { THROTTLE_POLICIES } from '../common/throttling';
import { AttachmentDownloadUrlService } from './attachment-download-url.service';

@Controller('public')
export class PublicAttachmentsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttachmentDownloadUrlService) private readonly downloadUrls: AttachmentDownloadUrlService,
  ) {}

  @Get('attachments/:id')
  @Throttle({ default: THROTTLE_POLICIES.safePublicRead })
  async content(
    @Param('id') id: string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await this.prisma.taskAttachment.findUnique({ where: { id } });
    if (!attachment || attachment.deletedAt || !attachment.completedAt) {
      throw new NotFoundException('Attachment not found');
    }
    if (!this.downloadUrls.isValid(attachment, expires, signature)) {
      throw new NotFoundException('Attachment not found');
    }
    const file = await fs.readFile(resolveAttachmentPath(attachment.storageKey)).catch(() => null);
    if (!file) throw new NotFoundException('Attachment not found');

    res.setHeader('content-type', attachment.mimeType);
    res.setHeader('cache-control', 'private, max-age=60');
    return new StreamableFile(file);
  }
}
