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
import { ReminderDeliveryService } from './tasks/reminder-delivery.service';
import { TaskRetentionService } from './tasks/task-retention.service';
import { PublicAttachmentsController } from './tasks/public-attachments.controller';
import { CollabController } from './collab/collab.controller';
import { WorkspaceAdminController } from './workspaces/workspace-admin.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { WebhookDeliveryService } from './webhooks/webhook-delivery.service';
import { SearchModule } from './search/search.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { WorkloadModule } from './workload/workload.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CustomFieldsController } from './custom-fields/custom-fields.controller';
import { ProjectStatusUpdatesController } from './projects/project-status-updates.controller';
import { ProjectViewsController } from './projects/project-views.controller';
import { RecurringTasksController } from './recurring-tasks/recurring-tasks.controller';
import { RecurringTaskWorker } from './recurring-tasks/recurring-task.worker';
import { FormsController } from './forms/forms.controller';
import { TaskApprovalController } from './task-approvals/task-approval.controller';
import { TaskTimeTrackingController } from './task-time-tracking/task-time-tracking.controller';
import { ProjectRoleGuard, WorkspaceRoleGuard } from './auth/role.guard';
import { TaskProjectLinksModule } from './task-project-links/task-project-links.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule.register(), SearchModule, PortfoliosModule, WorkloadModule, DashboardsModule, IntegrationsModule, TaskProjectLinksModule],
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
    NotificationsController,
    CustomFieldsController,
    ProjectStatusUpdatesController,
    ProjectViewsController,
    RecurringTasksController,
    FormsController,
    TaskApprovalController,
    TaskTimeTrackingController,
  ],
  providers: [
    PrismaService,
    DomainService,
    SubtaskService,
    CycleDetectionService,
    ReminderDeliveryService,
    TaskRetentionService,
    WebhookDeliveryService,
    NotificationsService,
    ProjectRoleGuard,
    WorkspaceRoleGuard,
    RecurringTaskWorker,
  ],
})
export class AppModule {}
