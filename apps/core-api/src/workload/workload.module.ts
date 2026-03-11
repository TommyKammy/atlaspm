import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CapacityModule } from '../capacity/capacity.module';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkloadService } from './workload.service';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [AuthModule, CapacityModule],
  controllers: [WorkloadController],
  providers: [PrismaService, DomainService, WorkloadService],
})
export class WorkloadModule {}
