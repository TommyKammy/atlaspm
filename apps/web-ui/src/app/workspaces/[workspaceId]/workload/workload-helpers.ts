import type { OverloadAlert, UserWorkload, WeeklyLoad, WorkloadViewMode } from '@atlaspm/shared-types';

export type WorkloadStatusFilter = 'all' | 'over-capacity' | 'reduced-capacity' | 'available';

const DEFAULT_CAPACITY_TASKS = 10;
const DEFAULT_CAPACITY_MINUTES = 40 * 60;

export interface WeeklyCapacityState {
  capacity: number;
  isOverCapacity: boolean;
  isReducedCapacity: boolean;
  excess: number;
  status: Exclude<WorkloadStatusFilter, 'all'>;
}

export function createAlertsByWeekMap(overloadAlerts: OverloadAlert[]): ReadonlyMap<string, OverloadAlert> {
  return new Map(overloadAlerts.map((alert) => [alert.week, alert]));
}

export function getWeeklyCapacityState(
  week: WeeklyLoad,
  viewMode: WorkloadViewMode,
  overloadAlert?: OverloadAlert,
): WeeklyCapacityState {
  const capacity = viewMode === 'effort'
    ? overloadAlert?.capacity ?? week.capacityMinutes ?? DEFAULT_CAPACITY_MINUTES
    : overloadAlert?.capacity ?? week.capacityTasks ?? DEFAULT_CAPACITY_TASKS;
  const demand = viewMode === 'effort' ? week.estimateMinutes : week.taskCount;
  const excess = Math.max(0, demand - capacity);
  const defaultCapacity = viewMode === 'effort' ? DEFAULT_CAPACITY_MINUTES : DEFAULT_CAPACITY_TASKS;
  const isReducedCapacity = capacity < defaultCapacity;
  const status = excess > 0 ? 'over-capacity' : isReducedCapacity ? 'reduced-capacity' : 'available';

  return {
    capacity,
    isOverCapacity: excess > 0,
    isReducedCapacity,
    excess: overloadAlert?.excess ?? excess,
    status,
  };
}

export function getWorkloadStatus(
  workload: UserWorkload,
  viewMode: WorkloadViewMode,
  alertsByWeek: ReadonlyMap<string, OverloadAlert> = createAlertsByWeekMap(workload.overloadAlerts),
): Exclude<WorkloadStatusFilter, 'all'> {
  let hasReducedCapacity = false;

  for (const week of workload.weeklyBreakdown) {
    const state = getWeeklyCapacityState(week, viewMode, alertsByWeek.get(week.week));
    if (state.isOverCapacity) {
      return 'over-capacity';
    }
    hasReducedCapacity = hasReducedCapacity || state.isReducedCapacity;
  }

  return hasReducedCapacity ? 'reduced-capacity' : 'available';
}

export function filterWorkloads(
  workloads: UserWorkload[],
  filter: WorkloadStatusFilter,
  viewMode: WorkloadViewMode,
  workloadStatusByUserId?: ReadonlyMap<string, Exclude<WorkloadStatusFilter, 'all'>>,
): UserWorkload[] {
  if (filter === 'all') {
    return workloads;
  }

  return workloads.filter(
    (workload) => (workloadStatusByUserId?.get(workload.userId) ?? getWorkloadStatus(workload, viewMode)) === filter,
  );
}

export function filterWeeks(
  workload: UserWorkload,
  filter: WorkloadStatusFilter,
  viewMode: WorkloadViewMode,
  alertsByWeek: ReadonlyMap<string, OverloadAlert> = createAlertsByWeekMap(workload.overloadAlerts),
): WeeklyLoad[] {
  if (filter === 'all') {
    return workload.weeklyBreakdown;
  }

  return workload.weeklyBreakdown.filter((week) => {
    const state = getWeeklyCapacityState(week, viewMode, alertsByWeek.get(week.week));
    return state.status === filter;
  });
}
