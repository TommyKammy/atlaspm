import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonServicesModule } from '../common/common-services.module';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';

@Module({
  imports: [AuthModule, CommonServicesModule],
  controllers: [CapacityController],
  providers: [CapacityService],
  exports: [CapacityService],
})
export class CapacityModule {}
