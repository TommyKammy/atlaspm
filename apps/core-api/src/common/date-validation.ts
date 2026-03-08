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
