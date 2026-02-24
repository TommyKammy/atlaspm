import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SearchService, SearchFilters } from './search.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Priority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

class SearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  hitsPerPage?: number = 20;
}

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async search(
    @Query() query: SearchQueryDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const filters: SearchFilters = {
      projectId: query.projectId,
      assigneeId: query.assigneeId,
      status: query.status,
      priority: query.priority,
    };

    if (!this.searchService.isSearchEnabled()) {
      const page = query.page ?? 0;
      const hitsPerPage = query.hitsPerPage ?? 20;
      const projectMemberships = await this.prisma.projectMembership.findMany({
        where: { userId: req.user.sub },
        select: { projectId: true },
      });
      const allowedProjectIds = projectMemberships.map((membership) => membership.projectId);
      if (!allowedProjectIds.length) {
        return { hits: [], total: 0, page, totalPages: 0 };
      }

      const where: Record<string, unknown> = {
        projectId: {
          in: filters.projectId
            ? allowedProjectIds.filter((projectId) => projectId === filters.projectId)
            : allowedProjectIds,
        },
      };
      if (filters.assigneeId) where.assigneeUserId = filters.assigneeId;
      if (filters.status) where.status = filters.status;
      if (filters.priority) where.priority = filters.priority;
      if (query.q?.trim()) {
        where.OR = [
          { title: { contains: query.q.trim(), mode: 'insensitive' } },
          { description: { contains: query.q.trim(), mode: 'insensitive' } },
          { tags: { has: query.q.trim() } },
        ];
      }

      const total = await this.prisma.task.count({ where });
      const hits = await this.prisma.task.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: page * hitsPerPage,
        take: hitsPerPage,
      });
      return {
        hits: hits.map((task) => ({
          objectID: task.id,
          title: task.title,
          description: task.description,
          projectId: task.projectId,
          assigneeId: task.assigneeUserId,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt,
          startAt: task.startAt,
          tags: task.tags,
          parentId: task.parentId,
          depth: 0,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
        total,
        page,
        totalPages: total === 0 ? 0 : Math.ceil(total / hitsPerPage),
      };
    }

    const result = await this.searchService.searchTasks(query.q, filters, {
      page: query.page,
      hitsPerPage: query.hitsPerPage,
    });

    return result;
  }

  @Get('status')
  async getStatus() {
    return this.searchService.getSearchStats();
  }

  @Post('reindex')
  async reindexAll(@CurrentRequest() req: AppRequest) {
    // Only allow workspace admins to trigger full reindex
    const adminMembership = await this.prisma.workspaceMembership.findFirst({
      where: {
        userId: req.user.sub,
        role: 'WS_ADMIN',
      },
    });

    if (!adminMembership) {
      throw new ForbiddenException('Admin access required');
    }

    if (!this.searchService.isSearchEnabled()) {
      return {
        success: true,
        message: 'Search backend is disabled; skipped reindex',
        count: 0,
      };
    }

    const tasks = await this.prisma.task.findMany();
    await this.searchService.reindexAll(tasks);

    return {
      success: true,
      message: `Reindexed ${tasks.length} tasks`,
      count: tasks.length,
    };
  }

}
