import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonServicesModule } from '../common/common-services.module';
import { TaskProjectLinksController } from './task-project-links.controller';
import { TaskProjectLinksService } from './task-project-links.service';

@Module({
  imports: [AuthModule, CommonServicesModule],
  controllers: [TaskProjectLinksController],
  providers: [TaskProjectLinksService],
})
export class TaskProjectLinksModule {}
