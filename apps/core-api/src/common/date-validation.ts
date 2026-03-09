import { BadRequestException } from '@nestjs/common';
import { normalizeDateOnlyUtcIso, type DateOnlyInput } from '@atlaspm/domain';

export interface DateRangeValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface DateRangeFieldNames {
  startField: string;
  dueField: string;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_WITH_ZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

function invalidDateQuery(fieldName: string): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_DATE_FORMAT',
    message: `${fieldName} must use YYYY-MM-DD or ISO8601 datetime with timezone`,
  });
}

export function parseTaskDateQuery(value: string, fieldName: string): Date {
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (!isValidDateParts(year, month, day)) {
      throw invalidDateQuery(fieldName);
    }
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  const dateTimeMatch = DATE_TIME_WITH_ZONE_PATTERN.exec(value);
  if (!dateTimeMatch) {
    throw invalidDateQuery(fieldName);
  }

  const year = Number(dateTimeMatch[1]);
  const month = Number(dateTimeMatch[2]);
  const day = Number(dateTimeMatch[3]);
  const hour = Number(dateTimeMatch[4]);
  const minute = Number(dateTimeMatch[5]);
  const second = dateTimeMatch[6] ? Number(dateTimeMatch[6]) : 0;
  const millisecond = dateTimeMatch[8] ? Number(dateTimeMatch[8].padEnd(3, '0')) : 0;

  if (!isValidDateParts(year, month, day)) {
    throw invalidDateQuery(fieldName);
  }
  if (hour > 23 || minute > 59 || second > 59 || millisecond > 999) {
    throw invalidDateQuery(fieldName);
  }

  let offsetMinutes = 0;
  if (dateTimeMatch[9] !== 'Z') {
    const sign = dateTimeMatch[10] === '-' ? -1 : 1;
    const offsetHours = Number(dateTimeMatch[11]);
    const offsetMins = Number(dateTimeMatch[12]);
    if (offsetHours > 23 || offsetMins > 59) {
      throw invalidDateQuery(fieldName);
    }
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  const timestamp =
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMinutes * 60_000;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw invalidDateQuery(fieldName);
  }
  return parsed;
}

export function normalizeDateOnlyField(value: DateOnlyInput): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return normalizeDateOnlyUtcIso(value);
}

export function toDateOnlyDate(value: DateOnlyInput): Date | null | undefined {
  const normalized = normalizeDateOnlyField(value);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  return new Date(normalized);
}

export function validateDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
  fieldNames: DateRangeFieldNames = { startField: 'startAt', dueField: 'dueAt' },
): DateRangeValidationResult {
  if (startAt === null || startAt === undefined || dueAt === null || dueAt === undefined) {
    return { valid: true };
  }

  const normalizedStart = normalizeDateOnlyField(startAt);
  const normalizedDue = normalizeDateOnlyField(dueAt);

  if (!normalizedStart) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.startField} must be a valid ISO8601 date string`,
      },
    };
  }

  if (!normalizedDue) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.dueField} must be a valid ISO8601 date string`,
      },
    };
  }

  if (normalizedStart > normalizedDue) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_RANGE',
        message: `${fieldNames.startField} must be before or equal to ${fieldNames.dueField}`,
      },
    };
  }

  return { valid: true };
}

export function assertValidDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
  fieldNames: DateRangeFieldNames = { startField: 'startAt', dueField: 'dueAt' },
): void {
  const result = validateDateRange(startAt, dueAt, fieldNames);
  if (!result.valid) {
    throw new BadRequestException({
      code: result.error!.code,
      message: result.error!.message,
    });
  }
}
