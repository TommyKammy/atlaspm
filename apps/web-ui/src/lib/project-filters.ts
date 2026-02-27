import type { CustomFieldType } from '@/lib/types';

type SupportedCustomFieldFilterType = Extract<CustomFieldType, 'SELECT' | 'BOOLEAN' | 'NUMBER' | 'DATE'>;

export type CustomFieldFilter = {
  fieldId: string;
  type: SupportedCustomFieldFilterType;
  optionIds?: string[];
  booleanValue?: boolean;
  numberMin?: number | null;
  numberMax?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  return dateOnly;
}

function normalizeOptionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return [...new Set(ids)];
}

function normalizeCustomFieldFilter(raw: unknown): CustomFieldFilter | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const fieldId = typeof entry.fieldId === 'string' ? entry.fieldId.trim() : '';
  if (!fieldId) return null;
  const type = entry.type;
  if (type !== 'SELECT' && type !== 'BOOLEAN' && type !== 'NUMBER' && type !== 'DATE') return null;

  if (type === 'SELECT') {
    const optionIds = normalizeOptionIds(entry.optionIds);
    if (!optionIds.length) return null;
    return { fieldId, type, optionIds };
  }

  if (type === 'BOOLEAN') {
    if (typeof entry.booleanValue !== 'boolean') return null;
    return { fieldId, type, booleanValue: entry.booleanValue };
  }

  if (type === 'NUMBER') {
    const min = typeof entry.numberMin === 'number' && Number.isFinite(entry.numberMin) ? entry.numberMin : null;
    const max = typeof entry.numberMax === 'number' && Number.isFinite(entry.numberMax) ? entry.numberMax : null;
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) {
      return { fieldId, type, numberMin: max, numberMax: min };
    }
    return { fieldId, type, numberMin: min, numberMax: max };
  }

  const from = normalizeDateOnly(entry.dateFrom);
  const to = normalizeDateOnly(entry.dateTo);
  if (!from && !to) return null;
  if (from && to && from > to) {
    return { fieldId, type, dateFrom: to, dateTo: from };
  }
  return { fieldId, type, dateFrom: from, dateTo: to };
}

export function parseCustomFieldFilters(raw: string | null): CustomFieldFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filters = parsed
      .map(normalizeCustomFieldFilter)
      .filter((filter): filter is CustomFieldFilter => Boolean(filter));
    return [...new Map(filters.map((filter) => [filter.fieldId, filter])).values()];
  } catch {
    return [];
  }
}

export function stringifyCustomFieldFilters(filters: CustomFieldFilter[]): string | null {
  const normalized = filters
    .map(normalizeCustomFieldFilter)
    .filter((filter): filter is CustomFieldFilter => Boolean(filter));
  if (!normalized.length) return null;
  return JSON.stringify(normalized);
}
