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
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    await this.domain.ensureDefaultWorkspaceForUser(user.id);
    return user;
  }

  @Get('workspaces')
  async workspaces(@CurrentRequest() req: AppRequest) {
    await this.domain.ensureDefaultWorkspaceForUser(req.user.sub);
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: req.user.sub },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
      role: membership.role,
    }));
  }
}
