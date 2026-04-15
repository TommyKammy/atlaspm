import { BadRequestException, Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { WorkspaceDefaultsService } from '../common/workspace-defaults.service';

const DEFAULT_REMINDER_PREFERENCES = {
  enabled: true,
  defaultLeadTimeMinutes: 60,
} as const;

class UpdateReminderPreferencesDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_080)
  defaultLeadTimeMinutes?: number;
}

@Controller()
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(WorkspaceDefaultsService) private readonly defaults: WorkspaceDefaultsService,
  ) {}

  @Get('me')
  async me(@CurrentRequest() req: AppRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    await this.defaults.ensureDefaultWorkspaceForUser(user.id);
    return user;
  }

  @Get('me/reminder-preferences')
  async reminderPreferences(@CurrentRequest() req: AppRequest) {
    await this.defaults.ensureDefaultWorkspaceForUser(req.user.sub);
    const preferences = await this.prisma.userReminderPreference.findUnique({
      where: { userId: req.user.sub },
    });
    return preferences ? this.serializeReminderPreferences(preferences) : DEFAULT_REMINDER_PREFERENCES;
  }

  @Put('me/reminder-preferences')
  async updateReminderPreferences(
    @Body() body: UpdateReminderPreferencesDto,
    @CurrentRequest() req: AppRequest,
  ) {
    if (body.enabled === undefined && body.defaultLeadTimeMinutes === undefined) {
      throw new BadRequestException('enabled or defaultLeadTimeMinutes is required');
    }

    await this.defaults.ensureDefaultWorkspaceForUser(req.user.sub);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userReminderPreference.findUnique({
        where: { userId: req.user.sub },
      });
      const updated = existing
        ? await tx.userReminderPreference.update({
            where: { id: existing.id },
            data: {
              ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
              ...(body.defaultLeadTimeMinutes !== undefined
                ? { defaultLeadTimeMinutes: body.defaultLeadTimeMinutes }
                : {}),
            },
          })
        : await tx.userReminderPreference.create({
            data: {
              userId: req.user.sub,
              enabled: body.enabled ?? DEFAULT_REMINDER_PREFERENCES.enabled,
              defaultLeadTimeMinutes:
                body.defaultLeadTimeMinutes ?? DEFAULT_REMINDER_PREFERENCES.defaultLeadTimeMinutes,
            },
          });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'UserReminderPreference',
        entityId: updated.id,
        action: 'user.reminder_preferences.updated',
        beforeJson: existing ? this.serializeReminderPreferences(existing) : DEFAULT_REMINDER_PREFERENCES,
        afterJson: this.serializeReminderPreferences(updated),
        correlationId: req.correlationId,
        outboxType: 'user.reminder_preferences.updated',
        payload: {
          userId: req.user.sub,
          enabled: updated.enabled,
          defaultLeadTimeMinutes: updated.defaultLeadTimeMinutes,
        },
      });

      return this.serializeReminderPreferences(updated);
    });
  }

  @Get('workspaces')
  async workspaces(@CurrentRequest() req: AppRequest) {
    await this.defaults.ensureDefaultWorkspaceForUser(req.user.sub);
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: req.user.sub },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
      role: membership.role,
    }));
  }

  private serializeReminderPreferences(preferences: {
    enabled: boolean;
    defaultLeadTimeMinutes: number;
  }) {
    return {
      enabled: preferences.enabled,
      defaultLeadTimeMinutes: preferences.defaultLeadTimeMinutes,
    };
  }
}
