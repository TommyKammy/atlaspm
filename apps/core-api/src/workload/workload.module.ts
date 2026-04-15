import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CapacityModule } from '../capacity/capacity.module';
import { CommonServicesModule } from '../common/common-services.module';
import { WorkloadService } from './workload.service';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [AuthModule, CapacityModule, CommonServicesModule],
  controllers: [WorkloadController],
  providers: [WorkloadService],
})
export class WorkloadModule {}
