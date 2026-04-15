import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { GuestAccessScopeType, GuestAccessStatus, Prisma } from '@prisma/client';
import { IdentityService } from '../common/identity.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  canActivate = async (context: ExecutionContext): Promise<boolean> => {
    const req = context.switchToHttp().getRequest<AppRequest>();
    req.user = await this.authService.verify(req.headers.authorization, req.headers.cookie);
    await this.identity.syncAuthenticatedUser(req.user);
    const normalizedEmail = (req.user.email ?? '').trim().toLowerCase();
    if (normalizedEmail) {
      await this.acceptPendingInvitations(req.user.sub, normalizedEmail, req.correlationId ?? 'n/a');
      await this.acceptPendingGuestInvitations(req.user.sub, normalizedEmail, req.correlationId ?? 'n/a');
    }
    return true;
  };

  private async acceptPendingInvitations(userId: string, email: string, correlationId: string) {
    const pending = await this.prisma.invitation.findMany({
      where: {
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending.length) return;

    await this.prisma.$transaction(async (tx) => {
      for (const invitation of pending) {
        const acceptedAt = new Date();
        const claimed = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: acceptedAt },
          },
          data: { acceptedAt },
        });
        if (claimed.count === 0) continue;

        const membership = await tx.workspaceMembership.upsert({
          where: {
            workspaceId_userId: { workspaceId: invitation.workspaceId, userId },
          },
          create: {
            workspaceId: invitation.workspaceId,
            userId,
            role: invitation.role,
          },
          update: {},
        });

        const accepted = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
        const payload = {
          invitationId: invitation.id,
          workspaceId: invitation.workspaceId,
          userId,
          membershipId: membership.id,
          autoAccepted: true,
        };
        const beforeJson = JSON.parse(JSON.stringify(invitation)) as Prisma.InputJsonValue;
        const afterJson = JSON.parse(JSON.stringify(accepted)) as Prisma.InputJsonValue;
        const payloadJson = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
        await tx.auditEvent.create({
          data: {
            actor: userId,
            entityType: 'Invitation',
            entityId: invitation.id,
            action: 'workspace.invite.accepted',
            beforeJson,
            afterJson,
            correlationId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: 'workspace.invite.accepted',
            payload: payloadJson,
            correlationId,
          },
        });
      }
    });
  }

  private async acceptPendingGuestInvitations(userId: string, email: string, correlationId: string) {
    const pending = await this.prisma.guestInvitation.findMany({
      where: {
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending.length) return;

    await this.prisma.$transaction(async (tx) => {
      for (const invitation of pending) {
        const acceptedAt = new Date();
        const claimed = await tx.guestInvitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: acceptedAt },
          },
          data: {
            acceptedAt,
            acceptedByUserId: userId,
          },
        });
        if (claimed.count === 0) continue;

        const existingGrant = await tx.guestAccessGrant.findFirst({
          where: {
            userId,
            workspaceId: invitation.workspaceId,
            projectId: invitation.projectId,
            scopeType: invitation.scopeType,
          },
        });

        const grant = existingGrant
          ? await tx.guestAccessGrant.update({
              where: { id: existingGrant.id },
              data: {
                invitationId: invitation.id,
                projectRole: invitation.projectRole,
                status: GuestAccessStatus.ACTIVE,
                revokedAt: null,
                expiresAt: invitation.expiresAt,
              },
            })
          : await tx.guestAccessGrant.create({
              data: {
                workspaceId: invitation.workspaceId,
                userId,
                invitationId: invitation.id,
                projectId: invitation.projectId,
                scopeType: invitation.scopeType ?? GuestAccessScopeType.PROJECT,
                projectRole: invitation.projectRole,
                status: GuestAccessStatus.ACTIVE,
                expiresAt: invitation.expiresAt,
                createdByUserId: invitation.createdByUserId,
              },
            });

        const accepted = await tx.guestInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
        const payload = {
          invitationId: invitation.id,
          workspaceId: invitation.workspaceId,
          projectId: invitation.projectId,
          userId,
          grantId: grant.id,
          autoAccepted: true,
        };
        const beforeJson = JSON.parse(JSON.stringify(invitation)) as Prisma.InputJsonValue;
        const afterJson = JSON.parse(JSON.stringify(accepted)) as Prisma.InputJsonValue;
        const payloadJson = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
        await tx.auditEvent.create({
          data: {
            actor: userId,
            entityType: 'GuestInvitation',
            entityId: invitation.id,
            action: 'guest.invite.accepted',
            beforeJson,
            afterJson,
            correlationId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: 'guest.invite.accepted',
            payload: payloadJson,
            correlationId,
          },
        });
      }
    });
  }
}
