import type { ReminderPreferences } from './types';

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: true,
  defaultLeadTimeMinutes: 60,
};

export const REMINDER_LEAD_TIME_OPTIONS = [15, 60, 240, 1440] as const;
