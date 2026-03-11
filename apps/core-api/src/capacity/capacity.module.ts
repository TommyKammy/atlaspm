import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';

@Module({
  imports: [AuthModule],
  controllers: [CapacityController],
  providers: [CapacityService, PrismaService, DomainService],
  exports: [CapacityService],
})
export class CapacityModule {}
