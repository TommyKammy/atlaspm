import type { OverloadAlert, UserWorkload, WeeklyLoad } from '@/lib/api/workload';

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

export function getWeeklyCapacityState(
  week: WeeklyLoad,
  viewMode: 'tasks' | 'effort',
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
  viewMode: 'tasks' | 'effort',
): Exclude<WorkloadStatusFilter, 'all'> {
  const weeklyStates = workload.weeklyBreakdown.map((week) =>
    getWeeklyCapacityState(
      week,
      viewMode,
      workload.overloadAlerts.find((alert) => alert.week === week.week),
    ),
  );

  if (weeklyStates.some((week) => week.isOverCapacity)) {
    return 'over-capacity';
  }

  if (weeklyStates.some((week) => week.isReducedCapacity)) {
    return 'reduced-capacity';
  }

  return 'available';
}

export function filterWorkloads(
  workloads: UserWorkload[],
  filter: WorkloadStatusFilter,
  viewMode: 'tasks' | 'effort',
): UserWorkload[] {
  if (filter === 'all') {
    return workloads;
  }

  return workloads.filter((workload) => getWorkloadStatus(workload, viewMode) === filter);
}

export function filterWeeks(
  workload: UserWorkload,
  filter: WorkloadStatusFilter,
  viewMode: 'tasks' | 'effort',
): WeeklyLoad[] {
  if (filter === 'all') {
    return workload.weeklyBreakdown;
  }

  return workload.weeklyBreakdown.filter((week) => {
    const state = getWeeklyCapacityState(
      week,
      viewMode,
      workload.overloadAlerts.find((alert) => alert.week === week.week),
    );
    return state.status === filter;
  });
}
