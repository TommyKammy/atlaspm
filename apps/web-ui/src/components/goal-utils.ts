import type { GoalStatus } from '@/lib/types';

export const GOAL_STATUS_OPTIONS: GoalStatus[] = [
  'NOT_STARTED',
  'ON_TRACK',
  'AT_RISK',
  'OFF_TRACK',
  'COMPLETED',
];

export function goalStatusLabel(status: GoalStatus, t: (key: string) => string) {
  switch (status) {
    case 'NOT_STARTED':
      return t('goalStatusNotStarted');
    case 'ON_TRACK':
      return t('goalStatusOnTrack');
    case 'AT_RISK':
      return t('goalStatusAtRisk');
    case 'OFF_TRACK':
      return t('goalStatusOffTrack');
    case 'COMPLETED':
      return t('goalStatusCompleted');
    default:
      return status;
  }
}

export function goalStatusBadgeClass(status: GoalStatus) {
  switch (status) {
    case 'ON_TRACK':
      return 'bg-green-100 text-green-800';
    case 'AT_RISK':
      return 'bg-amber-100 text-amber-800';
    case 'OFF_TRACK':
      return 'bg-red-100 text-red-800';
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800';
    case 'NOT_STARTED':
    default:
      return 'bg-slate-100 text-slate-800';
  }
}

export function goalHistoryActionLabel(action: string, t: (key: string) => string) {
  switch (action) {
    case 'goal.created':
      return t('goalHistoryCreated');
    case 'goal.updated':
      return t('goalHistoryUpdated');
    case 'goal.status_rollup_updated':
      return t('goalHistoryRollupUpdated');
    case 'goal.archived':
      return t('goalHistoryArchived');
    default:
      return action;
  }
}
