import { BadRequestException } from '@nestjs/common';

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

export function validateDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
  fieldNames: DateRangeFieldNames = { startField: 'startAt', dueField: 'dueAt' },
): DateRangeValidationResult {
  if (startAt === null || startAt === undefined || dueAt === null || dueAt === undefined) {
    return { valid: true };
  }

  const start = new Date(startAt);
  const due = new Date(dueAt);

  if (isNaN(start.getTime())) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.startField} must be a valid ISO8601 date string`,
      },
    };
  }

  if (isNaN(due.getTime())) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: `${fieldNames.dueField} must be a valid ISO8601 date string`,
      },
    };
  }

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
