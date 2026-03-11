import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CapacitySchedule,
  CapacityScheduleSubjectType,
  Prisma,
  TimeOffEvent,
  WorkspaceRole,
} from '@prisma/client';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CapacityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  private readonly DEFAULT_WEEKLY_CAPACITY_MINUTES = 40 * 60;

  async createCapacitySchedule(
    workspaceId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      subjectType: CapacityScheduleSubjectType;
      subjectUserId?: string;
      name: string;
      timeZone: string;
      hoursPerDay: number;
      daysOfWeek: number[];
    },
  ) {
    await this.domain.requireWorkspaceRole(workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);
    const normalized = await this.normalizeScheduleInput(workspaceId, input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.capacitySchedule.create({
          data: {
            workspaceId,
            ...normalized,
          },
        });

        await this.domain.appendAuditOutbox({
          tx,
          actor: actorUserId,
          entityType: 'CapacitySchedule',
          entityId: created.id,
          action: 'capacity_schedule.created',
          afterJson: created,
          correlationId,
          outboxType: 'capacity_schedule.created',
          payload: created,
        });

        return this.serializeSchedule(created);
      });
    } catch (error) {
      this.rethrowDuplicateSchedule(error);
      throw error;
    }
  }

  async listCapacitySchedules(workspaceId: string, actorUserId: string) {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);

    const schedules = await this.prisma.capacitySchedule.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return schedules.map((schedule) => this.serializeSchedule(schedule));
  }

  async updateCapacitySchedule(
    scheduleId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      name?: string;
      timeZone?: string;
      hoursPerDay?: number;
      daysOfWeek?: number[];
    },
  ) {
    const existing = await this.prisma.capacitySchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!existing) {
      throw new NotFoundException('Capacity schedule not found');
    }

    await this.domain.requireWorkspaceRole(existing.workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);
    const normalized = this.normalizeSchedulePatch(input);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.capacitySchedule.update({
        where: { id: scheduleId },
        data: normalized,
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'CapacitySchedule',
        entityId: updated.id,
        action: 'capacity_schedule.updated',
        beforeJson: existing,
        afterJson: updated,
        correlationId,
        outboxType: 'capacity_schedule.updated',
        payload: updated,
      });

      return this.serializeSchedule(updated);
    });
  }

  async createTimeOff(
    workspaceId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      userId: string;
      startDate: string;
      endDate: string;
      minutesPerDay: number;
      reason?: string;
    },
  ) {
    await this.domain.requireWorkspaceRole(workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);
    await this.requireWorkspaceUser(workspaceId, input.userId);
    const normalized = this.normalizeTimeOffInput(input);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.timeOffEvent.create({
        data: {
          workspaceId,
          userId: input.userId,
          ...normalized,
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'TimeOffEvent',
        entityId: created.id,
        action: 'time_off.created',
        afterJson: created,
        correlationId,
        outboxType: 'time_off.created',
        payload: created,
      });

      return this.serializeTimeOff(created);
    });
  }

  async listTimeOff(workspaceId: string, actorUserId: string, userId?: string) {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);
    if (userId) {
      await this.requireWorkspaceUser(workspaceId, userId);
    }

    const records = await this.prisma.timeOffEvent.findMany({
      where: {
        workspaceId,
        ...(userId ? { userId } : {}),
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });

    return records.map((record) => this.serializeTimeOff(record));
  }

  async updateTimeOff(
    timeOffId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      startDate?: string;
      endDate?: string;
      minutesPerDay?: number;
      reason?: string;
    },
  ) {
    const existing = await this.prisma.timeOffEvent.findUnique({
      where: { id: timeOffId },
    });
    if (!existing) {
      throw new NotFoundException('Time off event not found');
    }

    await this.domain.requireWorkspaceRole(existing.workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);
    const normalized = this.normalizeTimeOffPatch(existing, input);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.timeOffEvent.update({
        where: { id: timeOffId },
        data: normalized,
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'TimeOffEvent',
        entityId: updated.id,
        action: 'time_off.updated',
        beforeJson: existing,
        afterJson: updated,
        correlationId,
        outboxType: 'time_off.updated',
        payload: updated,
      });

      return this.serializeTimeOff(updated);
    });
  }

  async deleteTimeOff(timeOffId: string, actorUserId: string, correlationId: string) {
    const existing = await this.prisma.timeOffEvent.findUnique({
      where: { id: timeOffId },
    });
    if (!existing) {
      throw new NotFoundException('Time off event not found');
    }

    await this.domain.requireWorkspaceRole(existing.workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);

    await this.prisma.$transaction(async (tx) => {
      await tx.timeOffEvent.delete({
        where: { id: timeOffId },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'TimeOffEvent',
        entityId: existing.id,
        action: 'time_off.deleted',
        beforeJson: existing,
        afterJson: null,
        correlationId,
        outboxType: 'time_off.deleted',
        payload: existing,
      });
    });

    return { ok: true };
  }

  async resolveWeeklyCapacityMinutesBatch(
    workspaceId: string,
    userId: string,
    weeks: Array<{ startDate: Date; endDate: Date }>,
  ): Promise<number[]> {
    if (weeks.length === 0) {
      return [];
    }

    await this.requireWorkspaceUser(workspaceId, userId);
    const firstWeek = weeks[0]!;
    const minWeekStart = weeks.reduce(
      (earliest, week) => (week.startDate < earliest ? week.startDate : earliest),
      firstWeek.startDate,
    );
    const maxWeekEnd = weeks.reduce(
      (latest, week) => (week.endDate > latest ? week.endDate : latest),
      firstWeek.endDate,
    );

    const [userSchedule, workspaceSchedule, timeOffEvents] = await Promise.all([
      this.prisma.capacitySchedule.findFirst({
        where: {
          workspaceId,
          subjectType: CapacityScheduleSubjectType.USER,
          subjectUserId: userId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.capacitySchedule.findFirst({
        where: {
          workspaceId,
          subjectType: CapacityScheduleSubjectType.WORKSPACE,
          subjectUserId: null,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.timeOffEvent.findMany({
        where: {
          workspaceId,
          userId,
          startDate: { lte: maxWeekEnd },
          endDate: { gte: minWeekStart },
        },
      }),
    ]);

    const schedule = userSchedule ?? workspaceSchedule;
    if (!schedule) {
      return weeks.map(() => this.DEFAULT_WEEKLY_CAPACITY_MINUTES);
    }

    return weeks.map((week) => this.calculateCapacityForWeek(schedule, timeOffEvents, week.startDate, week.endDate));
  }

  async resolveWeeklyCapacityMinutes(
    workspaceId: string,
    userId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<number> {
    const [capacityMinutes] = await this.resolveWeeklyCapacityMinutesBatch(workspaceId, userId, [
      { startDate: weekStart, endDate: weekEnd },
    ]);
    return capacityMinutes ?? this.DEFAULT_WEEKLY_CAPACITY_MINUTES;
  }

  private calculateCapacityForWeek(
    schedule: CapacitySchedule,
    timeOffEvents: TimeOffEvent[],
    weekStart: Date,
    weekEnd: Date,
  ) {
    let totalMinutes = 0;
    for (let cursor = new Date(weekStart); cursor <= weekEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.getUTCDay();
      if (schedule.daysOfWeek.includes(day)) {
        totalMinutes += schedule.hoursPerDay * 60;
      }
    }

    for (const event of timeOffEvents) {
      const overlapStart = event.startDate > weekStart ? event.startDate : weekStart;
      const overlapEnd = event.endDate < weekEnd ? event.endDate : weekEnd;
      const days = this.countInclusiveUtcDays(overlapStart, overlapEnd);
      totalMinutes -= days * event.minutesPerDay;
    }

    return Math.max(0, totalMinutes);
  }

  private async normalizeScheduleInput(
    workspaceId: string,
    input: {
      subjectType: CapacityScheduleSubjectType;
      subjectUserId?: string;
      name: string;
      timeZone: string;
      hoursPerDay: number;
      daysOfWeek: number[];
    },
  ) {
    const subjectType = input.subjectType;
    const subjectUserId = subjectType === CapacityScheduleSubjectType.USER ? input.subjectUserId : null;

    if (subjectType === CapacityScheduleSubjectType.USER) {
      if (!subjectUserId) {
        throw new BadRequestException('subjectUserId is required for USER schedules');
      }
      await this.requireWorkspaceUser(workspaceId, subjectUserId);
    }

    if (subjectType === CapacityScheduleSubjectType.WORKSPACE && input.subjectUserId) {
      throw new BadRequestException('subjectUserId is not allowed for WORKSPACE schedules');
    }

    return {
      subjectType,
      subjectUserId,
      name: this.normalizeRequiredString(input.name, 'name'),
      timeZone: this.normalizeTimeZone(input.timeZone),
      hoursPerDay: this.normalizeHoursPerDay(input.hoursPerDay),
      daysOfWeek: this.normalizeDaysOfWeek(input.daysOfWeek),
    };
  }

  private normalizeSchedulePatch(input: {
    name?: string;
    timeZone?: string;
    hoursPerDay?: number;
    daysOfWeek?: number[];
  }) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('No schedule fields provided');
    }

    return {
      ...(input.name === undefined ? {} : { name: this.normalizeRequiredString(input.name, 'name') }),
      ...(input.timeZone === undefined
        ? {}
        : { timeZone: this.normalizeTimeZone(input.timeZone) }),
      ...(input.hoursPerDay === undefined ? {} : { hoursPerDay: this.normalizeHoursPerDay(input.hoursPerDay) }),
      ...(input.daysOfWeek === undefined ? {} : { daysOfWeek: this.normalizeDaysOfWeek(input.daysOfWeek) }),
    };
  }

  private normalizeTimeOffInput(input: {
    startDate: string;
    endDate: string;
    minutesPerDay: number;
    reason?: string;
  }) {
    const startDate = this.parseDateOnly(input.startDate, 'startDate');
    const endDate = this.parseDateOnly(input.endDate, 'endDate');
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    return {
      startDate,
      endDate,
      minutesPerDay: this.normalizeMinutesPerDay(input.minutesPerDay),
      reason: this.normalizeOptionalString(input.reason),
    };
  }

  private normalizeTimeOffPatch(
    existing: { startDate: Date; endDate: Date },
    input: {
      startDate?: string;
      endDate?: string;
      minutesPerDay?: number;
      reason?: string;
    },
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('No time off fields provided');
    }

    const startDate = input.startDate ? this.parseDateOnly(input.startDate, 'startDate') : existing.startDate;
    const endDate = input.endDate ? this.parseDateOnly(input.endDate, 'endDate') : existing.endDate;
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    return {
      startDate,
      endDate,
      ...(input.minutesPerDay === undefined
        ? {}
        : { minutesPerDay: this.normalizeMinutesPerDay(input.minutesPerDay) }),
      ...(input.reason === undefined ? {} : { reason: this.normalizeOptionalString(input.reason) }),
    };
  }

  private async requireWorkspaceUser(workspaceId: string, userId: string) {
    await this.domain.requireWorkspaceMembership(workspaceId, userId);
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      throw new BadRequestException(`${field} cannot be empty`);
    }
    return normalized;
  }

  private normalizeTimeZone(value: string) {
    const normalized = this.normalizeRequiredString(value, 'timeZone');
    if (normalized !== 'UTC') {
      throw new BadRequestException('timeZone must be UTC until timezone-aware capacity math is implemented');
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string) {
    if (value === undefined) {
      return undefined;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  private normalizeHoursPerDay(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 24) {
      throw new BadRequestException('hoursPerDay must be an integer between 1 and 24');
    }
    return value;
  }

  private normalizeMinutesPerDay(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 1440) {
      throw new BadRequestException('minutesPerDay must be an integer between 1 and 1440');
    }
    return value;
  }

  private normalizeDaysOfWeek(value: number[]) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('daysOfWeek must contain at least one day');
    }
    const uniqueDays = [...new Set(value)];
    if (!uniqueDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
      throw new BadRequestException('daysOfWeek must only contain integers between 0 and 6');
    }
    return uniqueDays.sort((a, b) => a - b);
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must be a valid date in YYYY-MM-DD format`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return parsed;
  }

  private countInclusiveUtcDays(startDate: Date, endDate: Date) {
    const utcStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const utcEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    return Math.floor((utcEnd - utcStart) / 86400000) + 1;
  }

  private rethrowDuplicateSchedule(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('capacity schedule already exists for this subject');
    }
  }

  private serializeSchedule(schedule: CapacitySchedule) {
    return {
      id: schedule.id,
      workspaceId: schedule.workspaceId,
      subjectType: schedule.subjectType,
      subjectUserId: schedule.subjectUserId ?? null,
      name: schedule.name,
      timeZone: schedule.timeZone,
      hoursPerDay: schedule.hoursPerDay,
      daysOfWeek: schedule.daysOfWeek,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  private serializeTimeOff(record: TimeOffEvent) {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      userId: record.userId,
      startDate: record.startDate,
      endDate: record.endDate,
      minutesPerDay: record.minutesPerDay,
      reason: record.reason ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
