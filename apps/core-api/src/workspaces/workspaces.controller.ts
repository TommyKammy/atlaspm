import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';

@Controller()
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('me')
  async me(@CurrentRequest() req: AppRequest) {
    const user = await this.domain.ensureUser(req.user.sub, req.user.email, req.user.name);
    await this.domain.ensureDefaultWorkspaceForUser(user.id);
    return user;
  }

  @Get('workspaces')
  async workspaces(@CurrentRequest() req: AppRequest) {
    await this.domain.ensureUser(req.user.sub, req.user.email, req.user.name);
    await this.domain.ensureDefaultWorkspaceForUser(req.user.sub);
    return this.prisma.workspace.findMany({
      where: { memberships: { some: { userId: req.user.sub } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
