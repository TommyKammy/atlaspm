import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';

class CreateStatusUpdateDto {
  @IsString()
  body: string;
}

class ListStatusUpdatesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

@Controller()
@UseGuards(AuthGuard)
export class ProjectStatusUpdatesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Post('projects/:id/status-updates')
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateStatusUpdateDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const trimmedBody = body.body.trim();
    if (!trimmedBody) {
      throw new ConflictException('Status update body cannot be empty');
    }
    if (trimmedBody.length > 5000) {
      throw new ConflictException('Status update is too long (max 5000 characters)');
    }

    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.projectStatusUpdate.create({
        data: {
          projectId,
          authorUserId: req.user.sub,
          body: trimmedBody,
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectStatusUpdate',
        entityId: statusUpdate.id,
        action: 'project_status_update.created',
        afterJson: statusUpdate,
        correlationId: req.correlationId,
        outboxType: 'project_status_update.created',
        payload: {
          statusUpdateId: statusUpdate.id,
          projectId: statusUpdate.projectId,
          authorUserId: statusUpdate.authorUserId,
        },
      });

      return statusUpdate;
    });
  }

  @Get('projects/:id/status-updates')
  async list(
    @Param('id') projectId: string,
    @Query() query: ListStatusUpdatesQuery,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const take = query.take ?? 20;

    const statusUpdates = await this.prisma.projectStatusUpdate.findMany({
      where: { projectId },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return statusUpdates;
  }

  @Get('projects/:id/status-updates/latest')
  async getLatest(
    @Param('id') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const statusUpdate = await this.prisma.projectStatusUpdate.findFirst({
      where: { projectId },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return statusUpdate;
  }
}
