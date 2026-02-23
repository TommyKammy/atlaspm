import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { DevAuthController } from './dev-auth.controller';

@Module({
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
  controllers: [DevAuthController],
})
export class AuthModule {}
