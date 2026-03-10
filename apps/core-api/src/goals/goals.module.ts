import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AuthModule],
  controllers: [GoalsController],
  providers: [GoalsService, PrismaService, DomainService],
})
export class GoalsModule {}
