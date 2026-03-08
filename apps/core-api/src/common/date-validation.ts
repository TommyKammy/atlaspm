import { BadRequestException } from '@nestjs/common';

const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

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

function normalizeDateOnlyIsoStringInternal(value: string): string | null {
  const trimmed = value.trim();
  const match = ISO_DATE_PREFIX_PATTERN.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const normalized = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== monthIndex ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized.toISOString();
}

export function normalizeDateOnlyIsoString(value: string): string {
  const normalized = normalizeDateOnlyIsoStringInternal(value);
  if (!normalized) {
    throw new BadRequestException({
      code: 'INVALID_DATE_FORMAT',
      message: 'Date must be a valid ISO8601 date string',
    });
  }
  return normalized;
}

export function normalizeOptionalDateOnlyIsoString(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  return normalizeDateOnlyIsoString(value);
}

export function normalizeStoredDateOnly(value: Date | null | undefined): Date | null | undefined {
  if (value === null || value === undefined) return value;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}

export function parseOptionalDateOnlyIsoString(
  value: string | null | undefined,
): Date | null | undefined {
  const normalized = normalizeOptionalDateOnlyIsoString(value);
  if (normalized === null || normalized === undefined) return normalized;
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

  const normalizedStartAt = normalizeDateOnlyIsoStringInternal(startAt);
  const normalizedDueAt = normalizeDateOnlyIsoStringInternal(dueAt);

  if (!normalizedStartAt) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.startField} must be a valid ISO8601 date string`,
      },
    };
  }

  if (!normalizedDueAt) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.dueField} must be a valid ISO8601 date string`,
      },
    };
  }

  const start = new Date(normalizedStartAt);
  const due = new Date(normalizedDueAt);
  if (start.getTime() > due.getTime()) {
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
