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
    const now = new Date();
    if (existing?.status === UserStatus.SUSPENDED) throw new ForbiddenException('User is suspended');
    await this.prisma.user.upsert({
      where: { id: req.user.sub },
      create: {
        id: req.user.sub,
        email: req.user.email,
        displayName: req.user.name,
        status: UserStatus.ACTIVE,
        lastSeenAt: now,
      },
      update: {
        email: req.user.email,
        lastSeenAt: now,
      },
    });
    return true;
  };
}
