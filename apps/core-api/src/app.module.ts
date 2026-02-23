import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { ProjectsController } from './projects/projects.controller';
import { SectionsController } from './sections/sections.controller';
import { TasksController } from './tasks/tasks.controller';
import { RulesController } from './rules/rules.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { AuditController } from './audit/audit.controller';
import { DomainService } from './common/domain.service';
import { SubtaskService } from './tasks/subtask.service';
import { CycleDetectionService } from './tasks/cycle-detection.service';
import { PublicAttachmentsController } from './tasks/public-attachments.controller';
import { CollabController } from './collab/collab.controller';
import { WorkspaceAdminController } from './workspaces/workspace-admin.controller';
import { SearchModule } from './search/search.module';
import { PortfoliosModule } from './portfolios/portfolios.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, SearchModule, PortfoliosModule],
  controllers: [
    WorkspacesController,
    ProjectsController,
    SectionsController,
    TasksController,
    RulesController,
    WebhooksController,
    AuditController,
    PublicAttachmentsController,
    CollabController,
    WorkspaceAdminController,
  ],
  providers: [PrismaService, DomainService, SubtaskService, CycleDetectionService],
})
export class AppModule {}
