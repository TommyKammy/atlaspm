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
  footerHeight: number;
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

export type TimelineLaneSubtaskMeta = {
  visibleTaskIds: string[];
  childIdsByParentId: Record<string, string[]>;
  depthByTaskId: Record<string, number>;
  rowHintByTaskId: Record<string, number>;
};

export type TimelineManualLanePlacement = {
  orderedTaskIds?: string[];
  rowByTaskId?: Record<string, number>;
};

export type BuildTimelineLayoutInput<TTask extends TimelineLayoutTaskInput> = {
  lanes: Array<TimelineLane<TTask>>;
  windowStart: Date;
  windowEnd: Date;
  dayColumnWidth: number;
  sectionRowHeight: number;
  taskRowHeight: number;
  laneFooterHeight?: number;
  compactRows?: boolean;
  manualPlacementByLane?: Record<string, TimelineManualLanePlacement>;
  expandedRowLaneIds?: string[];
  dependencyAwarePacking?: boolean;
  dependencyEdges?: Array<{ source: string; target: string; type?: string }>;
};

export type TimelineTaskOrderByLane = Record<string, string[]>;

type CompactRowPlacement = {
  rowIndexByTaskId: Record<string, number>;
  packingOrderByTaskId: Map<string, number>;
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

function applyManualPlacementOrder<TTask extends { id: string }>(
  tasks: TTask[],
  manualPlacement: TimelineManualLanePlacement | undefined,
): TTask[] {
  const orderedTaskIds = manualPlacement?.orderedTaskIds ?? [];
  if (!orderedTaskIds.length) return tasks;
  return applyTaskOrder(
    '__manual-placement__',
    tasks,
    { '__manual-placement__': orderedTaskIds },
    new Map(tasks.map((task, index) => [task.id, index])),
  );
}

function buildCompactRowPlacement<TTask extends TimelineLayoutTaskInput>(
  tasks: TTask[],
  dependencyAwarePacking: boolean | undefined,
  dependencyEdges: Array<{ source: string; target: string; type?: string }> | undefined,
  manualRowByTaskId: Record<string, number> | undefined,
  preserveInputOrder: boolean = false,
): CompactRowPlacement {
  const rowIndexByTaskId: Record<string, number> = {};
  const laneTaskIds = new Set(tasks.map((task) => task.id));
  const relevantDependencyEdges = dependencyAwarePacking
    ? (dependencyEdges ?? []).filter(
        (edge) =>
          edge.type !== 'RELATES_TO' && laneTaskIds.has(edge.source) && laneTaskIds.has(edge.target),
      )
    : [];
  const incomingByTaskId = new Map<string, Set<string>>();
  const outgoingByTaskId = new Map<string, Set<string>>();
  const undirectedByTaskId = new Map<string, Set<string>>();
  for (const task of tasks) {
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
  for (const task of tasks) {
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

  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const indegreeByTaskId = new Map<string, number>();
  const depthByTaskId = new Map<string, number>();
  for (const task of tasks) {
    indegreeByTaskId.set(task.id, incomingByTaskId.get(task.id)?.size ?? 0);
    depthByTaskId.set(task.id, 0);
  }

  const queue = [...tasks]
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

  const tasksForPacking = preserveInputOrder
    ? [...tasks]
    : [...tasks].sort((left, right) => {
        if (dependencyAwarePacking) {
          const leftComponentSize = componentSizeByTaskId.get(left.id) ?? 1;
          const rightComponentSize = componentSizeByTaskId.get(right.id) ?? 1;
          if (leftComponentSize !== rightComponentSize) {
            return rightComponentSize - leftComponentSize;
          }
          const leftDepth = depthByTaskId.get(left.id) ?? 0;
          const rightDepth = depthByTaskId.get(right.id) ?? 0;
          if (leftDepth !== rightDepth) return leftDepth - rightDepth;
        }
        return fallbackTaskCompare(left, right);
      });

  const occupiedRangesByRow: Array<Array<{ startDay: number; endDay: number }>> = [];
  let nextRowIndex = 0;

  for (const task of tasksForPacking) {
    let rowIndex: number;
    const maxPreferredRowIndex = Math.max(tasksForPacking.length - 1, 0);
    if (task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd) {
      const taskStartDay = dayNumber(task.timelineStart);
      const taskEndDay = dayNumber(task.timelineEnd);
      const preferredRowIndex = Math.min(
        Math.max(0, manualRowByTaskId?.[task.id] ?? 0),
        maxPreferredRowIndex,
      );
      rowIndex = -1;
      for (
        let candidateRowIndex = preferredRowIndex;
        candidateRowIndex < occupiedRangesByRow.length;
        candidateRowIndex += 1
      ) {
        const occupiedRanges = occupiedRangesByRow[candidateRowIndex] ?? [];
        const overlapsExistingTask = occupiedRanges.some(
          (range) => !(range.endDay < taskStartDay || range.startDay > taskEndDay),
        );
        if (!overlapsExistingTask) {
          rowIndex = candidateRowIndex;
          occupiedRanges.push({ startDay: taskStartDay, endDay: taskEndDay });
          break;
        }
      }
      if (rowIndex < 0) {
        rowIndex = Math.max(nextRowIndex, preferredRowIndex);
        nextRowIndex = rowIndex + 1;
        occupiedRangesByRow[rowIndex] = [{ startDay: taskStartDay, endDay: taskEndDay }];
      }
    } else {
      rowIndex = Math.max(
        nextRowIndex,
        Math.min(Math.max(0, manualRowByTaskId?.[task.id] ?? nextRowIndex), maxPreferredRowIndex),
      );
      nextRowIndex = rowIndex + 1;
    }

    rowIndexByTaskId[task.id] = rowIndex;
  }

  return {
    rowIndexByTaskId,
    packingOrderByTaskId: new Map(tasksForPacking.map((task, index) => [task.id, index])),
  };
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
  const expandedRowLaneIds = new Set(input.expandedRowLaneIds ?? []);
  const laneFooterHeight = Math.max(0, input.laneFooterHeight ?? 0);
  const footerRowCount = laneFooterHeight > 0 ? Math.ceil(laneFooterHeight / input.taskRowHeight) : 0;

  for (const lane of input.lanes) {
    const laneManualPlacement = input.manualPlacementByLane?.[lane.id];
    const orderedLaneTasks = applyManualPlacementOrder(lane.tasks, laneManualPlacement);
    const laneTop = cursorY;
    cursorY += input.sectionRowHeight;
    const taskRows: Array<TimelineTaskRow<TTask>> = [];
    const rows: Array<TimelinePackedRow<TTask>> = [];
    const rowIndexByTaskId: Record<string, number> = {};
    const laneUsesManualPlacement = Boolean(laneManualPlacement);
    const laneUsesExpandedRows = expandedRowLaneIds.has(lane.id);

    if (input.compactRows && !laneUsesExpandedRows) {
      Object.assign(
        rowIndexByTaskId,
        buildCompactRowPlacement(
          orderedLaneTasks,
          input.dependencyAwarePacking,
          input.dependencyEdges,
          laneManualPlacement?.rowByTaskId,
          laneUsesManualPlacement,
        ).rowIndexByTaskId,
      );
    }

    for (const task of orderedLaneTasks) {
      const rowIndex =
        input.compactRows && !laneUsesExpandedRows
          ? (rowIndexByTaskId[task.id] ?? rows.length)
          : rows.length;
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
    cursorY += laneFooterHeight;

    lanesWithRows.push({
      lane: { ...lane, tasks: orderedLaneTasks },
      tasks: orderedLaneTasks,
      top: laneTop,
      bottom: cursorY,
      footerHeight: laneFooterHeight,
      taskRows,
      rows,
    });
  }

  return {
    lanesWithRows,
    barsByTaskId,
    taskRowsById,
    bodyHeight: cursorY,
    totalRowCount:
      input.lanes.length +
      lanesWithRows.reduce((sum, lane) => sum + lane.rows.length + footerRowCount, 0),
  };
}

export function buildTimelineTaskOrderByLane<TTask extends TimelineLayoutTaskInput>(
  input: BuildTimelineLayoutInput<TTask>,
): TimelineTaskOrderByLane {
  const laneTaskOrder: TimelineTaskOrderByLane = {};
  const expandedRowLaneIds = new Set(input.expandedRowLaneIds ?? []);
  for (const lane of input.lanes) {
    const orderedLaneTasks = applyManualPlacementOrder(
      lane.tasks,
      input.manualPlacementByLane?.[lane.id],
    );
    if (!orderedLaneTasks.length) continue;
    if (!input.compactRows || expandedRowLaneIds.has(lane.id)) {
      laneTaskOrder[lane.id] = orderedLaneTasks.map((task) => task.id);
      continue;
    }

    const compactPlacement = buildCompactRowPlacement(
      orderedLaneTasks,
      input.dependencyAwarePacking,
      input.dependencyEdges,
      input.manualPlacementByLane?.[lane.id]?.rowByTaskId,
      Boolean(input.manualPlacementByLane?.[lane.id]),
    );
    laneTaskOrder[lane.id] = [...orderedLaneTasks]
      .sort((left, right) => {
        const rowDelta =
          (compactPlacement.rowIndexByTaskId[left.id] ?? 0) -
          (compactPlacement.rowIndexByTaskId[right.id] ?? 0);
        if (rowDelta !== 0) return rowDelta;
        return (
          (compactPlacement.packingOrderByTaskId.get(left.id) ?? 0) -
          (compactPlacement.packingOrderByTaskId.get(right.id) ?? 0)
        );
      })
      .map((task) => task.id);
  }
  return laneTaskOrder;
}

export function buildTimelineLaneSubtaskMeta<TTask extends { id: string; parentId?: string | null }>(
  tasks: TTask[],
  collapsedParentIds: Set<string>,
  baseRowByTaskId?: Record<string, number>,
): TimelineLaneSubtaskMeta {
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const laneTaskIds = new Set(tasks.map((task) => task.id));
  const childIdsByParentId: Record<string, string[]> = {};
  for (const task of tasks) {
    const parentId = task.parentId ?? null;
    if (!parentId || !laneTaskIds.has(parentId)) continue;
    (childIdsByParentId[parentId] ??= []).push(task.id);
  }

  const roots = tasks.filter((task) => !task.parentId || !laneTaskIds.has(task.parentId));
  const visibleTaskIds: string[] = [];
  const depthByTaskId: Record<string, number> = {};
  const rowHintByTaskId: Record<string, number> = {};
  const visitedTaskIds = new Set<string>();

  const visit = (taskId: string, depth: number, inheritedRowHint: number) => {
    if (visitedTaskIds.has(taskId)) return;
    const task = taskById.get(taskId);
    if (!task) return;
    visitedTaskIds.add(taskId);
    depthByTaskId[taskId] = depth;
    const ownRowHint = Math.max(baseRowByTaskId?.[taskId] ?? 0, inheritedRowHint);
    rowHintByTaskId[taskId] = ownRowHint;
    visibleTaskIds.push(taskId);
    if (collapsedParentIds.has(taskId)) return;
    const childIds = childIdsByParentId[taskId] ?? [];
    childIds.forEach((childId) => visit(childId, depth + 1, ownRowHint + 1));
  };

  const shouldFallbackVisit = (taskId: string) => {
    const seenTaskIds = new Set<string>([taskId]);
    let currentTask = taskById.get(taskId);
    while (currentTask) {
      const parentId = currentTask.parentId ?? null;
      if (!parentId || !laneTaskIds.has(parentId)) {
        return false;
      }
      if (collapsedParentIds.has(parentId)) {
        return false;
      }
      if (seenTaskIds.has(parentId)) {
        return true;
      }
      seenTaskIds.add(parentId);
      currentTask = taskById.get(parentId);
    }
    return false;
  };

  roots.forEach((task) => visit(task.id, 0, baseRowByTaskId?.[task.id] ?? 0));
  for (const task of tasks) {
    if (!shouldFallbackVisit(task.id)) continue;
    visit(task.id, 0, baseRowByTaskId?.[task.id] ?? 0);
  }

  return {
    visibleTaskIds,
    childIdsByParentId,
    depthByTaskId,
    rowHintByTaskId,
  };
}
