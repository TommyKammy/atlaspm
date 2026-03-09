import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [AuthService, AuthGuard, PrismaService],
  exports: [AuthService, AuthGuard, PrismaService],
})
export class AuthModule {}
