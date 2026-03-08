export type DateOnlyInput = string | Date | null | undefined;

type DateOnlyParts = {
  year: number;
  monthIndex: number;
  day: number;
};

function getDateOnlyParts(value: DateOnlyInput): DateOnlyParts | null {
  if (value === null || value === undefined) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    monthIndex: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
  };
}

export function normalizeDateOnlyUtcIso(value: DateOnlyInput): string | null {
  const parts = getDateOnlyParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.monthIndex, parts.day, 0, 0, 0, 0)).toISOString();
}

export function dateOnlyInputToLocalDate(value: DateOnlyInput): Date | null {
  const parts = getDateOnlyParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.monthIndex, parts.day);
}

export function dateOnlyInputValue(value: DateOnlyInput): string {
  return normalizeDateOnlyUtcIso(value)?.slice(0, 10) ?? '';
}

export function localDateToDateOnlyUtcIso(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0),
  ).toISOString();
}
