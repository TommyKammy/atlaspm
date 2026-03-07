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
  preferredTaskOrderByLane?: Record<string, string[]>;
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

export type TimelinePackedRow<TTask extends TimelineLayoutTaskInput = TimelineLayoutTaskInput> = {
  index: number;
  top: number;
  tasks: TTask[];
};

export type TimelineLayoutLane<TTask extends TimelineLayoutTaskInput = TimelineLayoutTaskInput> = {
  lane: TimelineLane<TTask>;
  tasks: TTask[];
  top: number;
  bottom: number;
  taskRows: Array<TimelineTaskRow<TTask>>;
  rows: Array<TimelinePackedRow<TTask>>;
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
  compactRows?: boolean;
  dependencyAwarePacking?: boolean;
  dependencyEdges?: Array<{ source: string; target: string; type?: string }>;
};

const DEFAULT_UNASSIGNED_LANE_ID = '__unassigned__';

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function pushHeap<T>(heap: T[], value: T, compare: (left: T, right: T) => number): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compare(heap[index]!, heap[parent]!) >= 0) break;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
}

function popHeap<T>(heap: T[], compare: (left: T, right: T) => number): T | undefined {
  if (!heap.length) return undefined;
  const first = heap[0]!;
  const last = heap.pop();
  if (heap.length && last !== undefined) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && compare(heap[left]!, heap[smallest]!) < 0) smallest = left;
      if (right < heap.length && compare(heap[right]!, heap[smallest]!) < 0) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
      index = smallest;
    }
  }
  return first;
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

function applyTaskOrder<TTask extends { id: string }>(
  laneId: string,
  tasks: TTask[],
  preferredTaskOrderByLane: Record<string, string[]>,
  fallbackTaskOrder: Map<string, number>,
): TTask[] {
  const preferredOrder = preferredTaskOrderByLane[laneId] ?? [];
  if (!preferredOrder.length) return tasks;
  const indexById = new Map(preferredOrder.map((taskId, index) => [taskId, index]));
  return [...tasks].sort((left, right) => {
    const leftRank = indexById.get(left.id);
    const rightRank = indexById.get(right.id);
    if (leftRank === undefined && rightRank === undefined) {
      return (fallbackTaskOrder.get(left.id) ?? 0) - (fallbackTaskOrder.get(right.id) ?? 0);
    }
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (fallbackTaskOrder.get(left.id) ?? 0) - (fallbackTaskOrder.get(right.id) ?? 0);
  });
}

export function buildTimelineLanes<TTask extends TimelineLaneTaskInput>(
  input: BuildTimelineLanesInput<TTask>,
): Array<TimelineLane<TTask>> {
  const preferredLaneOrder = input.preferredLaneOrder ?? [];
  const preferredTaskOrderByLane = input.preferredTaskOrderByLane ?? {};
  const unassignedLaneId = input.unassignedLaneId ?? DEFAULT_UNASSIGNED_LANE_ID;
  const fallbackTaskOrder = new Map(input.tasks.map((task, index) => [task.id, index]));

  if (input.swimlane === 'assignee') {
    const grouped = new Map<string, TTask[]>();
    for (const task of input.tasks) {
      const laneId = task.assigneeUserId ?? unassignedLaneId;
      const next = grouped.get(laneId) ?? [];
      next.push(task);
      grouped.set(laneId, next);
    }

    const laneIds = new Set<string>([...grouped.keys(), ...Object.keys(input.membersById), unassignedLaneId]);
    const lanes = [...laneIds]
      .map((laneId) => {
        const tasks = grouped.get(laneId) ?? [];
        const label =
          laneId === unassignedLaneId
            ? input.unassignedLabel
            : input.membersById[laneId]?.displayName || input.membersById[laneId]?.email || laneId;
        return {
          id: `assignee:${laneId}`,
          label,
          tasks: applyTaskOrder(
            `assignee:${laneId}`,
            tasks,
            preferredTaskOrderByLane,
            fallbackTaskOrder,
          ),
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
        tasks: applyTaskOrder(
          `status:${status}`,
          grouped.get(status) ?? [],
          preferredTaskOrderByLane,
          fallbackTaskOrder,
        ),
      }));
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
      tasks: applyTaskOrder(
        `section:${section.id}`,
        bySection.get(section.id) ?? [],
        preferredTaskOrderByLane,
        fallbackTaskOrder,
      ),
    }));

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
    const rows: Array<TimelinePackedRow<TTask>> = [];
    const rowIndexByTaskId: Record<string, number> = {};

    if (input.compactRows) {
      const laneTaskIds = new Set(lane.tasks.map((task) => task.id));
      const relevantDependencyEdges = input.dependencyAwarePacking
        ? (input.dependencyEdges ?? []).filter((edge) =>
            edge.type !== 'RELATES_TO' && laneTaskIds.has(edge.source) && laneTaskIds.has(edge.target))
        : [];
      const incomingByTaskId = new Map<string, Set<string>>();
      const outgoingByTaskId = new Map<string, Set<string>>();
      const undirectedByTaskId = new Map<string, Set<string>>();
      for (const task of lane.tasks) {
        incomingByTaskId.set(task.id, new Set());
        outgoingByTaskId.set(task.id, new Set());
        undirectedByTaskId.set(task.id, new Set());
      }
      for (const edge of relevantDependencyEdges) {
        incomingByTaskId.get(edge.target)?.add(edge.source);
        outgoingByTaskId.get(edge.source)?.add(edge.target);
        undirectedByTaskId.get(edge.source)?.add(edge.target);
        undirectedByTaskId.get(edge.target)?.add(edge.source);
      }

      const componentSizeByTaskId = new Map<string, number>();
      const visited = new Set<string>();
      for (const task of lane.tasks) {
        if (visited.has(task.id)) continue;
        const stack = [task.id];
        const component: string[] = [];
        visited.add(task.id);
        while (stack.length) {
          const current = stack.pop()!;
          component.push(current);
          for (const neighbor of undirectedByTaskId.get(current) ?? []) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            stack.push(neighbor);
          }
        }
        for (const taskId of component) {
          componentSizeByTaskId.set(taskId, component.length);
        }
      }

      const fallbackTaskCompare = (left: TTask, right: TTask) => {
        const leftStart = left.timelineStart ? dayNumber(left.timelineStart) : Number.MAX_SAFE_INTEGER;
        const rightStart = right.timelineStart ? dayNumber(right.timelineStart) : Number.MAX_SAFE_INTEGER;
        if (leftStart !== rightStart) return leftStart - rightStart;
        const leftEnd = left.timelineEnd ? dayNumber(left.timelineEnd) : Number.MAX_SAFE_INTEGER;
        const rightEnd = right.timelineEnd ? dayNumber(right.timelineEnd) : Number.MAX_SAFE_INTEGER;
        if (leftEnd !== rightEnd) return leftEnd - rightEnd;
        return left.id.localeCompare(right.id);
      };

      const taskById = new Map(lane.tasks.map((task) => [task.id, task] as const));
      const indegreeByTaskId = new Map<string, number>();
      const depthByTaskId = new Map<string, number>();
      for (const task of lane.tasks) {
        indegreeByTaskId.set(task.id, incomingByTaskId.get(task.id)?.size ?? 0);
        depthByTaskId.set(task.id, 0);
      }

      const queue = [...lane.tasks]
        .filter((task) => (indegreeByTaskId.get(task.id) ?? 0) === 0)
        .sort(fallbackTaskCompare);
      while (queue.length) {
        const current = queue.shift()!;
        const currentDepth = depthByTaskId.get(current.id) ?? 0;
        for (const targetTaskId of outgoingByTaskId.get(current.id) ?? []) {
          depthByTaskId.set(targetTaskId, Math.max(depthByTaskId.get(targetTaskId) ?? 0, currentDepth + 1));
          const nextInDegree = (indegreeByTaskId.get(targetTaskId) ?? 0) - 1;
          indegreeByTaskId.set(targetTaskId, nextInDegree);
          if (nextInDegree === 0) {
            const nextTask = taskById.get(targetTaskId);
            if (nextTask) {
              queue.push(nextTask);
              queue.sort(fallbackTaskCompare);
            }
          }
        }
      }

      const tasksForPacking = [...lane.tasks].sort((left, right) => {
        if (input.dependencyAwarePacking) {
          const leftComponentSize = componentSizeByTaskId.get(left.id) ?? 1;
          const rightComponentSize = componentSizeByTaskId.get(right.id) ?? 1;
          if (leftComponentSize !== rightComponentSize) return rightComponentSize - leftComponentSize;
          const leftDepth = depthByTaskId.get(left.id) ?? 0;
          const rightDepth = depthByTaskId.get(right.id) ?? 0;
          if (leftDepth !== rightDepth) return leftDepth - rightDepth;
        }
        return fallbackTaskCompare(left, right);
      });

      const activeRows: Array<{ rowIndex: number; endDay: number }> = [];
      const availableRowIndexes: number[] = [];
      let nextRowIndex = 0;

      for (const task of tasksForPacking) {
        let rowIndex: number;
        if (task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd) {
          const taskStartDay = dayNumber(task.timelineStart);
          const taskEndDay = dayNumber(task.timelineEnd);

          while (activeRows.length && activeRows[0]!.endDay < taskStartDay) {
            const released = popHeap(activeRows, (left, right) => left.endDay - right.endDay || left.rowIndex - right.rowIndex);
            if (released) {
              pushHeap(availableRowIndexes, released.rowIndex, (left, right) => left - right);
            }
          }

          rowIndex = popHeap(availableRowIndexes, (left, right) => left - right) ?? nextRowIndex++;
          pushHeap(activeRows, { rowIndex, endDay: taskEndDay }, (left, right) => left.endDay - right.endDay || left.rowIndex - right.rowIndex);
        } else {
          rowIndex = nextRowIndex++;
        }

        rowIndexByTaskId[task.id] = rowIndex;
      }
    }

    for (const task of lane.tasks) {
      const rowIndex = input.compactRows ? (rowIndexByTaskId[task.id] ?? rows.length) : rows.length;
      if (!rows[rowIndex]) {
        rows[rowIndex] = {
          index: rowIndex,
          top: cursorY + rowIndex * input.taskRowHeight,
          tasks: [],
        };
      }
      const row = rows[rowIndex]!;
      const rowTop = row.top;
      taskRowsById[task.id] = { top: rowTop, height: input.taskRowHeight };

      const visibleStart = task.timelineStart && task.timelineStart < input.windowStart ? input.windowStart : task.timelineStart;
      const visibleEnd = task.timelineEnd && task.timelineEnd > input.windowEnd ? input.windowEnd : task.timelineEnd;

      if (task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd) {
        barsByTaskId[task.id] = {
          left: Math.max(0, dayDiff(input.windowStart, visibleStart ?? task.timelineStart)) * input.dayColumnWidth,
          width:
            Math.max(1, dayDiff(visibleStart ?? task.timelineStart, visibleEnd ?? task.timelineEnd) + 1)
            * input.dayColumnWidth,
          y: rowTop + input.taskRowHeight / 2,
        };
      }

      row.tasks.push(task);
      taskRows.push({ task, top: rowTop });
    }
    cursorY += rows.length * input.taskRowHeight;

    lanesWithRows.push({
      lane,
      tasks: lane.tasks,
      top: laneTop,
      bottom: cursorY,
      taskRows,
      rows,
    });
  }

  return {
    lanesWithRows,
    barsByTaskId,
    taskRowsById,
    bodyHeight: cursorY,
    totalRowCount: input.lanes.length + lanesWithRows.reduce((sum, lane) => sum + lane.rows.length, 0),
  };
}
