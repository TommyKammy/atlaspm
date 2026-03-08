import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, ProjectStatusHealth } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';

class CreateStatusUpdateDto {
  @IsEnum(ProjectStatusHealth)
  health!: ProjectStatusHealth;

  @IsString()
  summary!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  nextSteps?: string[];
}

class ListStatusUpdatesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
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
    if (!Object.values(ProjectStatusHealth).includes(body.health)) {
      throw new BadRequestException('Invalid status update health');
    }

    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    if (!summary) {
      throw new BadRequestException('Status update summary cannot be empty');
    }
    if (summary.length > 5000) {
      throw new BadRequestException('Status update summary is too long (max 5000 characters)');
    }

    const blockers = this.normalizeListItems(body.blockers, 'blockers');
    const nextSteps = this.normalizeListItems(body.nextSteps, 'nextSteps');

    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.projectStatusUpdate.create({
        data: {
          projectId,
          authorUserId: req.user.sub,
          health: body.health,
          summary,
          blockers,
          nextSteps,
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
          health: statusUpdate.health,
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
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
    });

    const hasNextPage = statusUpdates.length > take;
    const items = hasNextPage ? statusUpdates.slice(0, take) : statusUpdates;
    const lastItem = items[items.length - 1];
    const nextCursor = hasNextPage && lastItem ? lastItem.id : null;

    return {
      items,
      nextCursor,
      hasNextPage,
    };
  }

  @Get('projects/:id/status-updates/latest')
  async getLatest(
    @Param('id') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return statusUpdate;
  }

  @Get('projects/:id/status-updates/:statusUpdateId')
  async getById(
    @Param('id') projectId: string,
    @Param('statusUpdateId') statusUpdateId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const statusUpdate = await this.prisma.projectStatusUpdate.findFirst({
      where: {
        id: statusUpdateId,
        projectId,
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

    if (!statusUpdate) {
      throw new NotFoundException('Status update not found');
    }

    return statusUpdate;
  }

  private normalizeListItems(items: string[] | undefined, fieldName: string) {
    const normalized = (items ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (normalized.length > 50) {
      throw new BadRequestException(`${fieldName} cannot contain more than 50 items`);
    }

    for (const item of normalized) {
      if (item.length > 500) {
        throw new BadRequestException(`${fieldName} items cannot exceed 500 characters`);
      }
    }

    return normalized;
  }
}
