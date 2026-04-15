import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { AuthUser } from './types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdentityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ensureUser(sub: string, email?: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: sub } });
    const normalizedEmail = email === undefined ? undefined : email.trim().toLowerCase() || null;
    if (!existing) {
      return this.prisma.user.create({
        data: { id: sub, email: normalizedEmail ?? null, displayName: name, status: UserStatus.ACTIVE },
      });
    }

    const data: { displayName?: string | null; email?: string | null } = {
      displayName: existing.displayName ?? name,
    };
    if (normalizedEmail !== undefined) {
      data.email = normalizedEmail;
    }

    return this.prisma.user.update({
      where: { id: sub },
      data,
    });
  }

  async syncAuthenticatedUser(user: AuthUser) {
    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.user.findUnique({ where: { id: user.sub } });
      if (existing?.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException('User is suspended');
      }
      const normalizedEmail = (user.email ?? existing?.email ?? '').trim().toLowerCase() || null;

      try {
        if (!existing) {
          return await this.prisma.user.create({
            data: {
              id: user.sub,
              email: normalizedEmail,
              displayName: user.name,
              status: UserStatus.ACTIVE,
              lastSeenAt: now,
            },
          });
        }

        return await this.prisma.user.update({
          where: { id: user.sub },
          data: {
            email: normalizedEmail,
            displayName: existing.displayName ?? user.name,
            lastSeenAt: now,
          },
        });
      } catch (error) {
        const maybePrismaError = error as { code?: string };
        const isRetryableRace = maybePrismaError.code === 'P2002' || maybePrismaError.code === 'P2025';
        if (!isRetryableRace || attempt === 2) {
          throw error;
        }
      }
    }
  }
}
