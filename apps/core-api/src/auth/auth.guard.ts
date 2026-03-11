import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { GuestAccessScopeType, GuestAccessStatus, Prisma, UserStatus } from '@prisma/client';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  canActivate = async (context: ExecutionContext): Promise<boolean> => {
    const req = context.switchToHttp().getRequest<AppRequest>();
    req.user = await this.authService.verify(req.headers.authorization, req.headers.cookie);
    await this.syncAuthenticatedUser(req.user.sub, req.user.email, req.user.name);
    const normalizedEmail = (req.user.email ?? '').trim().toLowerCase();
    if (normalizedEmail) {
      await this.acceptPendingInvitations(req.user.sub, normalizedEmail, req.correlationId ?? 'n/a');
      await this.acceptPendingGuestInvitations(req.user.sub, normalizedEmail, req.correlationId ?? 'n/a');
    }
    return true;
  };

  private async syncAuthenticatedUser(
    userId: string,
    email: string | undefined,
    displayName?: string,
  ) {
    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.user.findUnique({ where: { id: userId } });
      if (existing?.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException('User is suspended');
      }
      const normalizedEmail = (email ?? existing?.email ?? '').trim().toLowerCase();

      try {
        if (!existing) {
          await this.prisma.user.create({
            data: {
              id: userId,
              email: normalizedEmail || null,
              displayName,
              status: UserStatus.ACTIVE,
              lastSeenAt: now,
            },
          });
          return;
        }

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            email: normalizedEmail || null,
            lastSeenAt: now,
          },
        });
        return;
      } catch (error) {
        const maybePrismaError = error as { code?: string };
        const isRetryableRace =
          maybePrismaError.code === 'P2002' || maybePrismaError.code === 'P2025';
        if (!isRetryableRace || attempt === 2) {
          throw error;
        }
      }
    }
  }

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
