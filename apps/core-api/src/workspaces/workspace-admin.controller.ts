import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { UserStatus, WorkspaceRole } from '@prisma/client';
import { RequireWorkspaceRole, WorkspaceRoleGuard } from '../auth/role.guard';

class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
}

class PatchUserDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}

class AcceptInvitationDto {
  @IsString()
  token!: string;
}

@Controller()
@UseGuards(AuthGuard, WorkspaceRoleGuard)
export class WorkspaceAdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('workspaces/:id/users')
  @RequireWorkspaceRole(WorkspaceRole.WS_ADMIN)
  async listWorkspaceUsers(
    @Param('id') workspaceId: string,
    @Query('query') query: string | undefined,
    @Query('status') status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | undefined,
  ) {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    const invitations = await this.prisma.invitation.findMany({
      where: { workspaceId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const users = memberships.map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      displayName: membership.user.displayName,
      status: membership.user.status,
      lastSeenAt: membership.user.lastSeenAt,
      createdAt: membership.user.createdAt,
      workspaceRole: membership.role,
      invitationStatus: null,
    }));

    const invited = invitations.map((invitation) => ({
      id: `invite:${invitation.id}`,
      email: invitation.email,
      displayName: null,
      status: 'INVITED' as const,
      lastSeenAt: null,
      createdAt: invitation.createdAt,
      workspaceRole: invitation.role,
      invitationStatus: 'PENDING' as const,
      invitationId: invitation.id,
      invitationExpiresAt: invitation.expiresAt,
    }));

    const normalizedQuery = query?.trim().toLowerCase();
    return [...users, ...invited].filter((item) => {
      const byStatus = !status || item.status === status;
      if (!byStatus) return false;
      if (!normalizedQuery) return true;
      const label = (item.displayName ?? item.email ?? item.id).toLowerCase();
      const email = (item.email ?? '').toLowerCase();
      return label.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }

  @Patch('users/:id')
  async patchUser(
    @Param('id') userId: string,
    @Body() body: PatchUserDto,
    @CurrentRequest() req: AppRequest,
  ) {
    if (!body.displayName && !body.status) {
      throw new BadRequestException('displayName or status is required');
    }

    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const workspaceId = body.workspaceId;

    if (body.status) {
      if (!workspaceId) throw new BadRequestException('workspaceId is required when updating status');
      await this.domain.requireWorkspaceRole(workspaceId, req.user.sub, WorkspaceRole.WS_ADMIN);
      const targetMembership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!targetMembership) throw new BadRequestException('Target user is not in workspace');
    } else if (req.user.sub !== userId) {
      if (!workspaceId) throw new BadRequestException('workspaceId is required when updating another user');
      await this.domain.requireWorkspaceRole(workspaceId, req.user.sub, WorkspaceRole.WS_ADMIN);
      const targetMembership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!targetMembership) throw new BadRequestException('Target user is not in workspace');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(body.displayName !== undefined ? { displayName: body.displayName || null } : {}),
          ...(body.status ? { status: body.status } : {}),
        },
      });

      if (body.status && body.status !== target.status) {
        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'User',
          entityId: userId,
          action: body.status === UserStatus.SUSPENDED ? 'workspace.user.suspended' : 'workspace.user.unsuspended',
          beforeJson: { status: target.status },
          afterJson: { status: updated.status },
          correlationId: req.correlationId,
          outboxType: body.status === UserStatus.SUSPENDED ? 'workspace.user.suspended' : 'workspace.user.unsuspended',
          payload: { userId, status: updated.status, workspaceId: workspaceId ?? null },
        });
      }

      if (body.displayName !== undefined && body.displayName !== target.displayName) {
        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'User',
          entityId: userId,
          action: 'workspace.user.display_name_updated',
          beforeJson: { displayName: target.displayName },
          afterJson: { displayName: updated.displayName },
          correlationId: req.correlationId,
          outboxType: 'workspace.user.updated',
          payload: { userId, displayName: updated.displayName, workspaceId: workspaceId ?? null },
        });
      }

      return updated;
    });
  }

  @Post('workspaces/:id/invitations')
  @RequireWorkspaceRole(WorkspaceRole.WS_ADMIN)
  async createInvitation(
    @Param('id') workspaceId: string,
    @Body() body: CreateInvitationDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const role = body.role ?? WorkspaceRole.WS_MEMBER;
    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          workspaceId,
          email: body.email.toLowerCase(),
          role,
          tokenHash,
          expiresAt,
          createdByUserId: req.user.sub,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Invitation',
        entityId: created.id,
        action: 'workspace.invite.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'workspace.invite.created',
        payload: {
          invitationId: created.id,
          workspaceId,
          email: created.email,
          role: created.role,
          expiresAt: created.expiresAt,
        },
      });
      return created;
    });

    const baseUrl = process.env.INVITE_BASE_URL ?? 'http://localhost:3000/login';
    return {
      invitationId: invitation.id,
      inviteLink: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}inviteToken=${rawToken}`,
      expiresAt: invitation.expiresAt,
    };
  }

  @Get('workspaces/:id/invitations')
  @RequireWorkspaceRole(WorkspaceRole.WS_ADMIN)
  async listInvitations(@Param('id') workspaceId: string) {
    return this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  @Delete('invitations/:id')
  async revokeInvitation(@Param('id') invitationId: string, @CurrentRequest() req: AppRequest) {
    const invitation = await this.prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    await this.domain.requireWorkspaceRole(invitation.workspaceId, req.user.sub, WorkspaceRole.WS_ADMIN);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Invitation',
        entityId: invitationId,
        action: 'workspace.invite.revoked',
        beforeJson: invitation,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'workspace.invite.revoked',
        payload: { invitationId, workspaceId: invitation.workspaceId },
      });
      return { ok: true };
    });
  }

  @Post('invitations/:id/reissue')
  async reissueInvitation(@Param('id') invitationId: string, @CurrentRequest() req: AppRequest) {
    const invitation = await this.prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    await this.domain.requireWorkspaceRole(invitation.workspaceId, req.user.sub, WorkspaceRole.WS_ADMIN);
    if (invitation.acceptedAt) throw new BadRequestException('Accepted invitation cannot be reissued');
    if (invitation.revokedAt) throw new BadRequestException('Revoked invitation cannot be reissued');

    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    const reissued = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Invitation',
        entityId: invitationId,
        action: 'workspace.invite.revoked',
        beforeJson: invitation,
        afterJson: revoked,
        correlationId: req.correlationId,
        outboxType: 'workspace.invite.revoked',
        payload: { invitationId, workspaceId: invitation.workspaceId, reason: 'reissued' },
      });

      const created = await tx.invitation.create({
        data: {
          workspaceId: invitation.workspaceId,
          email: invitation.email,
          role: invitation.role,
          tokenHash,
          expiresAt,
          createdByUserId: req.user.sub,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Invitation',
        entityId: created.id,
        action: 'workspace.invite.reissued',
        beforeJson: invitation,
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'workspace.invite.reissued',
        payload: {
          workspaceId: invitation.workspaceId,
          oldInvitationId: invitation.id,
          invitationId: created.id,
          email: created.email,
          role: created.role,
          expiresAt: created.expiresAt,
        },
      });
      return created;
    });

    const baseUrl = process.env.INVITE_BASE_URL ?? 'http://localhost:3000/login';
    return {
      invitationId: reissued.id,
      inviteLink: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}inviteToken=${rawToken}`,
      expiresAt: reissued.expiresAt,
    };
  }

  @Post('invitations/accept')
  async acceptInvitation(@Body() body: AcceptInvitationDto, @CurrentRequest() req: AppRequest) {
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid invitation token');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const inviteEmail = invitation.email.toLowerCase();
    const loginEmail = (user.email ?? req.user.email ?? '').toLowerCase();
    if (!loginEmail || loginEmail !== inviteEmail) {
      throw new ForbiddenException('Invitation email does not match signed-in user');
    }

    if (invitation.acceptedAt) {
      const membership = await this.prisma.workspaceMembership.upsert({
        where: {
          workspaceId_userId: { workspaceId: invitation.workspaceId, userId: req.user.sub },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: req.user.sub,
          role: invitation.role,
        },
        update: {},
      });
      return { ok: true, workspaceId: invitation.workspaceId, role: membership.role };
    }

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.workspaceMembership.upsert({
        where: {
          workspaceId_userId: { workspaceId: invitation.workspaceId, userId: req.user.sub },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: req.user.sub,
          role: invitation.role,
        },
        update: {},
      });
      const accepted = await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Invitation',
        entityId: invitation.id,
        action: 'workspace.invite.accepted',
        beforeJson: invitation,
        afterJson: accepted,
        correlationId: req.correlationId,
        outboxType: 'workspace.invite.accepted',
        payload: {
          invitationId: invitation.id,
          workspaceId: invitation.workspaceId,
          userId: req.user.sub,
          membershipId: membership.id,
        },
      });

      return { ok: true, workspaceId: invitation.workspaceId, role: membership.role };
    });
  }
}
