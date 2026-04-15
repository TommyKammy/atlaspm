import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DevAuthModule } from './auth/dev-auth.module';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { ProjectsController } from './projects/projects.controller';
import { SectionsController } from './sections/sections.controller';
import { TasksController } from './tasks/tasks.controller';
import { RulesController } from './rules/rules.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { AuditController } from './audit/audit.controller';
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
import { PublicFormSubmissionThrottleGuard } from './forms/public-form-submission-throttle.guard';
import { TaskApprovalController } from './task-approvals/task-approval.controller';
import { TaskTimeTrackingController } from './task-time-tracking/task-time-tracking.controller';
import { ProjectRoleGuard, WorkspaceRoleGuard } from './auth/role.guard';
import { TaskProjectLinksModule } from './task-project-links/task-project-links.module';
import { ApiThrottlingModule } from './common/throttling';
import { AttachmentDownloadUrlService } from './tasks/attachment-download-url.service';
import { TaskAttachmentsController } from './tasks/task-attachments.controller';
import { TaskAttachmentsService } from './tasks/task-attachments.service';
import { TaskCommentsController } from './tasks/task-comments.controller';
import { TaskCommentsService } from './tasks/task-comments.service';
import { TaskDependenciesController } from './tasks/task-dependencies.controller';
import { TaskMentionsService } from './tasks/task-mentions.service';
import { TaskRemindersController } from './tasks/task-reminders.controller';
import { TaskRemindersService } from './tasks/task-reminders.service';
import { GoalsModule } from './goals/goals.module';
import { CapacityModule } from './capacity/capacity.module';
import { GuestAccessController } from './guest-access/guest-access.controller';
import { CommonServicesModule } from './common/common-services.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonServicesModule,
    ApiThrottlingModule,
    AuthModule,
    DevAuthModule.register(),
    SearchModule,
    PortfoliosModule,
    WorkloadModule,
    DashboardsModule,
    IntegrationsModule,
    TaskProjectLinksModule,
    GoalsModule,
    CapacityModule,
  ],
  controllers: [
    WorkspacesController,
    ProjectsController,
    SectionsController,
    TasksController,
    RulesController,
    WebhooksController,
    AuditController,
    PublicAttachmentsController,
    TaskAttachmentsController,
    TaskCommentsController,
    TaskDependenciesController,
    TaskRemindersController,
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
    GuestAccessController,
  ],
  providers: [
    SubtaskService,
    CycleDetectionService,
    ReminderDeliveryService,
    TaskRetentionService,
    WebhookDeliveryService,
    NotificationsService,
    AttachmentDownloadUrlService,
    TaskAttachmentsService,
    TaskCommentsService,
    TaskMentionsService,
    TaskRemindersService,
    PublicFormSubmissionThrottleGuard,
    ProjectRoleGuard,
    WorkspaceRoleGuard,
    RecurringTaskWorker,
  ],
})
export class AppModule {}
