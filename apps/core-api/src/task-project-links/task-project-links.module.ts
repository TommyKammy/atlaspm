import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskProjectLinksController } from './task-project-links.controller';
import { TaskProjectLinksService } from './task-project-links.service';

@Module({
  imports: [AuthModule],
  controllers: [TaskProjectLinksController],
  providers: [PrismaService, DomainService, TaskProjectLinksService],
})
export class TaskProjectLinksModule {}
