import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonServicesModule } from '../common/common-services.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AuthModule, CommonServicesModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
