import { Module } from '@nestjs/common';
import { TaskProjectLinkController } from './task-project-link.controller';
import { TaskProjectLinkService } from './task-project-link.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [TaskProjectLinkController],
  providers: [TaskProjectLinkService],
  exports: [TaskProjectLinkService],
})
export class TaskProjectLinksModule {}
