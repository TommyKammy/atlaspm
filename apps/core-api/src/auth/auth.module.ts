import { DynamicModule, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { DevAuthController } from './dev-auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { shouldRegisterDevAuthController } from './dev-auth-environment';

@Module({
  providers: [AuthService, AuthGuard, PrismaService],
  exports: [AuthService, AuthGuard, PrismaService],
})
export class AuthModule {
  static register(): DynamicModule {
    return {
      module: AuthModule,
      controllers: shouldRegisterDevAuthController() ? [DevAuthController] : [],
    };
  }
}
