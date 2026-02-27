import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UserStatus } from '@prisma/client';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  canActivate = async (context: ExecutionContext): Promise<boolean> => {
    const req = context.switchToHttp().getRequest<AppRequest>();
    req.user = await this.authService.verify(req.headers.authorization);
    const existing = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    const now = new Date();
    if (existing?.status === UserStatus.SUSPENDED) throw new ForbiddenException('User is suspended');
    const normalizedEmail = (req.user.email ?? existing?.email ?? '').trim().toLowerCase();
    await this.prisma.user.upsert({
      where: { id: req.user.sub },
      create: {
        id: req.user.sub,
        email: normalizedEmail || null,
        displayName: req.user.name,
        status: UserStatus.ACTIVE,
        lastSeenAt: now,
      },
      update: {
        email: normalizedEmail || null,
        lastSeenAt: now,
      },
    });
    if (normalizedEmail) {
      await this.acceptPendingInvitations(req.user.sub, normalizedEmail, req.correlationId ?? 'n/a');
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
}
