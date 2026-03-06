import { TASK_STATUSES, type TaskStatus } from '../value-objects/task-status.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineSwimlaneMode = 'section' | 'assignee' | 'status';

export type TimelineSectionInput = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
};

export type TimelineMemberInput = {
  displayName?: string | null;
  email?: string | null;
};

export type TimelineLaneTaskInput = {
  id: string;
  sectionId: string;
  assigneeUserId?: string | null;
  status: TaskStatus;
};

export type TimelineLaneTask<TTask extends TimelineLaneTaskInput = TimelineLaneTaskInput> = TTask;

export type TimelineLane<TTask = TimelineLaneTaskInput> = {
  id: string;
  label: string;
  tasks: TTask[];
};

export type BuildTimelineLanesInput<TTask extends TimelineLaneTaskInput> = {
  swimlane: TimelineSwimlaneMode;
  tasks: TTask[];
  sections: TimelineSectionInput[];
  membersById: Record<string, TimelineMemberInput>;
  preferredLaneOrder?: string[];
  defaultSectionLabel: string;
  unassignedLabel: string;
  statusLabels?: Record<TaskStatus, string>;
  statusOrder?: TaskStatus[];
  unassignedLaneId?: string;
};

export type TimelineLayoutTaskInput = {
  id: string;
  hasSchedule: boolean;
  inWindow: boolean;
  timelineStart: Date | null;
  timelineEnd: Date | null;
};

export type TimelineTaskRow<TTask extends TimelineLayoutTaskInput = TimelineLayoutTaskInput> = {
  task: TTask;
  top: number;
};

export type TimelineLayoutLane<TTask extends TimelineLayoutTaskInput = TimelineLayoutTaskInput> = {
  lane: TimelineLane<TTask>;
  tasks: TTask[];
  top: number;
  bottom: number;
  taskRows: Array<TimelineTaskRow<TTask>>;
};

export type TimelineLayout<TTask extends TimelineLayoutTaskInput = TimelineLayoutTaskInput> = {
  lanesWithRows: Array<TimelineLayoutLane<TTask>>;
  barsByTaskId: Record<string, { left: number; width: number; y: number }>;
  taskRowsById: Record<string, { top: number; height: number }>;
  bodyHeight: number;
  totalRowCount: number;
};

export type BuildTimelineLayoutInput<TTask extends TimelineLayoutTaskInput> = {
  lanes: Array<TimelineLane<TTask>>;
  windowStart: Date;
  windowEnd: Date;
  dayColumnWidth: number;
  sectionRowHeight: number;
  taskRowHeight: number;
};

const DEFAULT_UNASSIGNED_LANE_ID = '__unassigned__';

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function applyLaneOrder<TLane extends { id: string }>(lanes: TLane[], preferredOrder: string[]): TLane[] {
  if (!preferredOrder.length) return lanes;
  const indexById = new Map(preferredOrder.map((laneId, index) => [laneId, index]));
  return [...lanes].sort((left, right) => {
    const leftRank = indexById.get(left.id);
    const rightRank = indexById.get(right.id);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

export function buildTimelineLanes<TTask extends TimelineLaneTaskInput>(
  input: BuildTimelineLanesInput<TTask>,
): Array<TimelineLane<TTask>> {
  const preferredLaneOrder = input.preferredLaneOrder ?? [];
  const unassignedLaneId = input.unassignedLaneId ?? DEFAULT_UNASSIGNED_LANE_ID;

  if (input.swimlane === 'assignee') {
    const grouped = new Map<string, TTask[]>();
    for (const task of input.tasks) {
      const laneId = task.assigneeUserId ?? unassignedLaneId;
      const next = grouped.get(laneId) ?? [];
      next.push(task);
      grouped.set(laneId, next);
    }

    const lanes = [...grouped.entries()]
      .map(([laneId, tasks]) => {
        const label =
          laneId === unassignedLaneId
            ? input.unassignedLabel
            : input.membersById[laneId]?.displayName || input.membersById[laneId]?.email || laneId;
        return {
          id: `assignee:${laneId}`,
          label,
          tasks,
        };
      })
      .sort((left, right) => {
        const leftUnassigned = left.id === `assignee:${unassignedLaneId}`;
        const rightUnassigned = right.id === `assignee:${unassignedLaneId}`;
        if (leftUnassigned && !rightUnassigned) return 1;
        if (!leftUnassigned && rightUnassigned) return -1;
        return left.label.localeCompare(right.label);
      });

    return applyLaneOrder(lanes, preferredLaneOrder);
  }

  if (input.swimlane === 'status') {
    const statusOrder = input.statusOrder ?? [...TASK_STATUSES];
    const statusLabels = input.statusLabels ?? {
      TODO: 'TODO',
      IN_PROGRESS: 'IN_PROGRESS',
      DONE: 'DONE',
      BLOCKED: 'BLOCKED',
    };
    const grouped = new Map<TaskStatus, TTask[]>();
    for (const task of input.tasks) {
      const next = grouped.get(task.status) ?? [];
      next.push(task);
      grouped.set(task.status, next);
    }

    return statusOrder
      .map((status) => ({
        id: `status:${status}`,
        label: statusLabels[status],
        tasks: grouped.get(status) ?? [],
      }))
      .filter((lane) => lane.tasks.length > 0);
  }

  const bySection = new Map<string, TTask[]>();
  for (const task of input.tasks) {
    const next = bySection.get(task.sectionId) ?? [];
    next.push(task);
    bySection.set(task.sectionId, next);
  }

  const lanes = input.sections
    .map((section) => ({
      id: `section:${section.id}`,
      label: section.isDefault ? input.defaultSectionLabel : section.name,
      tasks: bySection.get(section.id) ?? [],
    }))
    .filter((lane) => lane.tasks.length > 0);

  return applyLaneOrder(lanes, preferredLaneOrder);
}

export function buildTimelineLayout<TTask extends TimelineLayoutTaskInput>(
  input: BuildTimelineLayoutInput<TTask>,
): TimelineLayout<TTask> {
  let cursorY = 0;
  const barsByTaskId: Record<string, { left: number; width: number; y: number }> = {};
  const taskRowsById: Record<string, { top: number; height: number }> = {};
  const lanesWithRows: Array<TimelineLayoutLane<TTask>> = [];

  for (const lane of input.lanes) {
    const laneTop = cursorY;
    cursorY += input.sectionRowHeight;
    const taskRows: Array<TimelineTaskRow<TTask>> = [];

    for (const task of lane.tasks) {
      const rowTop = cursorY;
      taskRowsById[task.id] = { top: rowTop, height: input.taskRowHeight };

      const visibleStart = task.timelineStart && task.timelineStart < input.windowStart ? input.windowStart : task.timelineStart;
      const visibleEnd = task.timelineEnd && task.timelineEnd > input.windowEnd ? input.windowEnd : task.timelineEnd;

      if (task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd) {
        barsByTaskId[task.id] = {
          left: Math.max(0, dayDiff(input.windowStart, visibleStart ?? task.timelineStart)) * input.dayColumnWidth,
          width:
            Math.max(1, dayDiff(visibleStart ?? task.timelineStart, visibleEnd ?? task.timelineEnd) + 1)
            * input.dayColumnWidth,
          y: cursorY + input.taskRowHeight / 2,
        };
      }

      taskRows.push({ task, top: rowTop });
      cursorY += input.taskRowHeight;
    }

    lanesWithRows.push({
      lane,
      tasks: lane.tasks,
      top: laneTop,
      bottom: cursorY,
      taskRows,
    });
  }

  return {
    lanesWithRows,
    barsByTaskId,
    taskRowsById,
    bodyHeight: cursorY,
    totalRowCount: input.lanes.length + input.lanes.reduce((sum, lane) => sum + lane.tasks.length, 0),
  };
}
