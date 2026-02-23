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
import { PublicAttachmentsController } from './tasks/public-attachments.controller';
import { CollabController } from './collab/collab.controller';
import { WorkspaceAdminController } from './workspaces/workspace-admin.controller';
import { CustomFieldsController } from './custom-fields/custom-fields.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
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
    CustomFieldsController,
  ],
  providers: [PrismaService, DomainService],
})
export class AppModule {}
