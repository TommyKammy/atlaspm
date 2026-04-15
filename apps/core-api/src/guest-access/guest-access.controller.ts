import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { GuestAccessScopeType, GuestAccessStatus, ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { AuthorizationService } from '../common/authorization.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRoleGuard, RequireProjectRole, WorkspaceRoleGuard } from '../auth/role.guard';
import { evaluateGuestInvitationState, isGuestProjectRole } from './guest-access.contract';
import { PrismaService } from '../prisma/prisma.service';

class CreateGuestInvitationDto {
  @IsEmail()
  email!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

@Controller()
@UseGuards(AuthGuard, WorkspaceRoleGuard, ProjectRoleGuard)
export class GuestAccessController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get('projects/:id/guest-access')
  @RequireProjectRole(ProjectRole.ADMIN)
  async listProjectGuestAccess(@Param('id') projectId: string) {
    const invitations = await this.prisma.guestInvitation.findMany({
      where: { projectId },
      include: {
        grants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return invitations.map((invitation) => this.serializeGuestAccessEntry(invitation, invitation.grants[0] ?? null, now));
  }

  @Post('projects/:id/guest-invitations')
  @RequireProjectRole(ProjectRole.ADMIN)
  async createProjectGuestInvitation(
    @Param('id') projectId: string,
    @Body() body: CreateGuestInvitationDto,
    @CurrentRequest() req: AppRequest,
  ) {
    if (!isGuestProjectRole(body.role)) {
      throw new BadRequestException('Guest invitations support only MEMBER or VIEWER roles');
    }

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const email = body.email.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (body.expiresInDays ?? 7));

    const pendingInvitation = await this.prisma.guestInvitation.findFirst({
      where: {
        projectId,
        email,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvitation) {
      throw new ConflictException('Guest invitation already pending');
    }

    const existingGuest = await this.prisma.guestAccessGrant.findFirst({
      where: {
        projectId,
        status: GuestAccessStatus.ACTIVE,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: { email },
      },
      include: { user: true },
    });
    if (existingGuest) {
      throw new ConflictException('Guest already has active project access');
    }

    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guestInvitation.create({
        data: {
          workspaceId: project.workspaceId,
          projectId,
          email,
          scopeType: GuestAccessScopeType.PROJECT,
          projectRole: body.role,
          tokenHash,
          expiresAt,
          createdByUserId: req.user.sub,
        },
      });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'GuestInvitation',
        entityId: created.id,
        action: 'guest.invite.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'guest.invite.created',
        payload: {
          invitationId: created.id,
          workspaceId: created.workspaceId,
          projectId: created.projectId,
          email: created.email,
          projectRole: created.projectRole,
          expiresAt: created.expiresAt,
        },
      });
      return created;
    });

    const baseUrl = process.env.GUEST_INVITE_BASE_URL ?? process.env.INVITE_BASE_URL ?? 'http://localhost:3000/login';
    return {
      ...this.serializeGuestAccessEntry(invitation, null, new Date()),
      inviteLink: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}inviteToken=${rawToken}`,
    };
  }

  @Delete('guest-invitations/:id')
  async revokeGuestInvitation(@Param('id') invitationId: string, @CurrentRequest() req: AppRequest) {
    const invitation = await this.prisma.guestInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: { grants: true },
    });
    if (!invitation.projectId) {
      throw new BadRequestException('Workspace-scoped guest invitations are not supported by this endpoint');
    }

    await this.authorization.requireProjectRole(invitation.projectId, req.user.sub, ProjectRole.ADMIN);

    return this.prisma.$transaction(async (tx) => {
      const revokedAt = new Date();
      const updatedInvitation = invitation.revokedAt
        ? invitation
        : await tx.guestInvitation.update({
            where: { id: invitationId },
            data: { revokedAt },
          });

      await tx.guestAccessGrant.updateMany({
        where: {
          invitationId,
          status: { not: GuestAccessStatus.REVOKED },
        },
        data: {
          status: GuestAccessStatus.REVOKED,
          revokedAt,
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'GuestInvitation',
        entityId: invitationId,
        action: 'guest.invite.revoked',
        beforeJson: invitation,
        afterJson: updatedInvitation,
        correlationId: req.correlationId,
        outboxType: 'guest.invite.revoked',
        payload: {
          invitationId,
          workspaceId: invitation.workspaceId,
          projectId: invitation.projectId,
        },
      });

      return { ok: true };
    });
  }

  private serializeGuestAccessEntry(
    invitation: {
      id: string;
      workspaceId: string;
      projectId: string | null;
      email: string;
      projectRole: ProjectRole | null;
      expiresAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
    },
    grant: {
      id: string;
      userId: string;
      status: GuestAccessStatus;
      expiresAt: Date | null;
      revokedAt: Date | null;
      user: {
        id: string;
        email: string | null;
        displayName: string | null;
      };
    } | null,
    now: Date,
  ) {
    const hasExpiredGrant = Boolean(grant?.expiresAt && grant.expiresAt.getTime() <= now.getTime());
    const state = grant?.revokedAt || grant?.status === GuestAccessStatus.REVOKED
      ? 'revoked'
      : grant?.status === GuestAccessStatus.EXPIRED || hasExpiredGrant
        ? 'expired'
        : grant
          ? 'accepted'
          : evaluateGuestInvitationState(invitation, now);

    return {
      invitationId: invitation.id,
      grantId: grant?.id ?? null,
      workspaceId: invitation.workspaceId,
      projectId: invitation.projectId,
      email: invitation.email,
      userId: grant?.userId ?? null,
      userDisplayName: grant?.user.displayName ?? null,
      projectRole: invitation.projectRole,
      grantStatus: grant?.status ?? null,
      state,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: grant?.revokedAt ?? invitation.revokedAt,
      createdAt: invitation.createdAt,
      scope: {
        type: 'project' as const,
        workspaceId: invitation.workspaceId,
        projectId: invitation.projectId,
        role: invitation.projectRole,
      },
    };
  }
}
