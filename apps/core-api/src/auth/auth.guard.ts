import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

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
    if (existing?.status === UserStatus.SUSPENDED) throw new ForbiddenException('User is suspended');
    if (!existing) {
      await this.prisma.user.create({
        data: {
          id: req.user.sub,
          email: req.user.email,
          displayName: req.user.name,
          status: UserStatus.ACTIVE,
          lastSeenAt: new Date(),
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: req.user.sub },
        data: {
          email: req.user.email,
          displayName: existing.displayName ?? req.user.name,
          lastSeenAt: new Date(),
        },
      });
    }
    return true;
  };
}
