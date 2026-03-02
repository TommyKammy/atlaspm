import { BadRequestException } from '@nestjs/common';

export interface DateRangeValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export function validateDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
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
        message: 'startAt must be a valid ISO8601 date string',
      },
    };
  }

  if (isNaN(due.getTime())) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: 'dueAt must be a valid ISO8601 date string',
      },
    };
  }

  if (start.getTime() > due.getTime()) {
    return {
      valid: false,
      error: {
        code: 'INVALID_DATE_RANGE',
        message: 'startAt must be before or equal to dueAt',
      },
    };
  }

  return { valid: true };
}

export function assertValidDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
): void {
  const result = validateDateRange(startAt, dueAt);
  if (!result.valid) {
    throw new BadRequestException({
      code: result.error!.code,
      message: result.error!.message,
    });
  }
}
