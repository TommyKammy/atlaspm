import { describe, expect, test } from 'vitest';
import type { TimelineTask } from '@/hooks/use-timeline-data';
import type { DependencyGraphEdge, Section, Task } from '@/lib/types';
import {
  buildTimelineTaskViewModel,
  normalizeTimelineManualLayoutState,
  type TimelineMode,
  type TimelineScheduleFilter,
  type TimelineSortMode,
} from './project-timeline-view-model';

const defaultSection: Section = {
  id: 'default',
  projectId: 'project-1',
  name: 'Default',
  position: 1000,
  isDefault: true,
};

function createTask(overrides: Partial<TimelineTask> = {}): TimelineTask {
  const baseTask = {
    id: 'task-1',
    projectId: 'project-1',
    sectionId: 'default',
    title: 'Task',
    status: 'TODO',
    type: 'TASK',
    progressPercent: 0,
    priority: 'MEDIUM',
    position: 1000,
    version: 1,
    assigneeUserId: null,
    description: null,
    startAt: null,
    dueAt: null,
    completedAt: null,
    parentId: null,
    customFieldValues: [],
    baselineStartAt: null,
    baselineDueAt: null,
    section: defaultSection,
    timelineStart: null,
    timelineEnd: null,
    baselineStart: null,
    baselineEnd: null,
    hasSchedule: false,
    hasBaseline: false,
    inWindow: false,
  } satisfies Partial<Task> & Partial<TimelineTask>;

  return {
    ...baseTask,
    ...overrides,
  } as TimelineTask;
}

function buildViewModel(args: {
  tasks: TimelineTask[];
  dependencyEdges?: DependencyGraphEdge[];
  mode?: TimelineMode;
  search?: string;
  statusFilter?: 'ALL' | Task['status'];
  priorityFilter?: 'ALL' | NonNullable<Task['priority']>;
  scheduleFilter?: TimelineScheduleFilter;
  sortMode?: TimelineSortMode;
  ganttRiskFilterMode?: 'all' | 'risk';
  today?: Date;
}) {
  return buildTimelineTaskViewModel({
    tasks: args.tasks,
    dependencyEdges: args.dependencyEdges ?? [],
    mode: args.mode ?? 'timeline',
    search: args.search ?? '',
    statusFilter: args.statusFilter ?? 'ALL',
    priorityFilter: args.priorityFilter ?? 'ALL',
    effectiveScheduleFilter: args.scheduleFilter ?? 'all',
    effectiveSortMode: args.sortMode ?? 'manual',
    ganttRiskFilterMode: args.ganttRiskFilterMode ?? 'all',
    today: args.today ?? new Date('2026-03-10T09:00:00.000Z'),
  });
}

describe('project timeline view model', () => {
  test('filters scheduled timeline tasks and derives gantt risk summaries', () => {
    const blocker = createTask({
      id: 'task-blocker',
      title: 'Blocker',
      status: 'IN_PROGRESS',
      startAt: '2026-03-01T00:00:00.000Z',
      dueAt: '2026-03-08T00:00:00.000Z',
      timelineStart: new Date('2026-03-01T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-08T00:00:00.000Z'),
      hasSchedule: true,
      inWindow: true,
    });
    const target = createTask({
      id: 'task-target',
      title: 'Target',
      status: 'TODO',
      startAt: '2026-03-05T00:00:00.000Z',
      dueAt: '2026-03-06T00:00:00.000Z',
      timelineStart: new Date('2026-03-05T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-06T00:00:00.000Z'),
      baselineStart: new Date('2026-03-04T00:00:00.000Z'),
      baselineEnd: new Date('2026-03-05T00:00:00.000Z'),
      baselineStartAt: '2026-03-04T00:00:00.000Z',
      baselineDueAt: '2026-03-05T00:00:00.000Z',
      hasSchedule: true,
      hasBaseline: true,
      inWindow: true,
    });
    const unscheduled = createTask({
      id: 'task-unscheduled',
      title: 'Inbox',
      hasSchedule: false,
      inWindow: false,
    });

    const viewModel = buildViewModel({
      tasks: [unscheduled, target, blocker],
      dependencyEdges: [
        { source: 'task-blocker', target: 'task-target', type: 'BLOCKS' } as DependencyGraphEdge,
        { source: 'task-unscheduled', target: 'task-target', type: 'RELATES_TO' } as DependencyGraphEdge,
      ],
      mode: 'gantt',
      scheduleFilter: 'scheduled',
      sortMode: 'dueAt',
      ganttRiskFilterMode: 'risk',
    });

    expect(viewModel.baseFilteredTasks.map((task) => task.id)).toEqual(['task-target', 'task-blocker']);
    expect(viewModel.filteredTasks.map((task) => task.id)).toEqual(['task-target', 'task-blocker']);
    expect(viewModel.scheduledTimelineTasks.map((task) => task.id)).toEqual(['task-target', 'task-blocker']);
    expect(viewModel.ganttRiskTasks.map((task) => task.id)).toEqual(['task-target', 'task-blocker']);
    expect(viewModel.ganttBlockedTasks.map((task) => task.id)).toEqual(['task-target']);
    expect(viewModel.ganttDelayedTasks.map((task) => task.id)).toEqual(['task-target']);
    expect(viewModel.ganttAheadTasks).toEqual([]);
    expect(viewModel.totalDependencyEdges).toBe(1);
    expect(viewModel.ganttRiskByTaskId.get('task-target')).toEqual({
      isAtRisk: true,
      overdue: true,
      blockedByOpen: 1,
      blockedByLate: 1,
    });
  });

  test('keeps gantt risk metadata from blockers that are filtered out of the visible task list', () => {
    const blocker = createTask({
      id: 'task-blocker',
      title: 'Hidden blocker',
      status: 'IN_PROGRESS',
      startAt: '2026-03-01T00:00:00.000Z',
      dueAt: '2026-03-04T00:00:00.000Z',
      timelineStart: new Date('2026-03-01T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-04T00:00:00.000Z'),
      hasSchedule: true,
      inWindow: true,
    });
    const target = createTask({
      id: 'task-target',
      title: 'Visible target',
      status: 'TODO',
      startAt: '2026-03-05T00:00:00.000Z',
      dueAt: '2026-03-06T00:00:00.000Z',
      timelineStart: new Date('2026-03-05T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-06T00:00:00.000Z'),
      hasSchedule: true,
      inWindow: true,
    });

    const viewModel = buildViewModel({
      tasks: [blocker, target],
      dependencyEdges: [
        { source: 'task-blocker', target: 'task-target', type: 'BLOCKS' } as DependencyGraphEdge,
      ],
      mode: 'gantt',
      statusFilter: 'TODO',
      scheduleFilter: 'scheduled',
      ganttRiskFilterMode: 'risk',
      today: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(viewModel.baseFilteredTasks.map((task) => task.id)).toEqual(['task-target']);
    expect(viewModel.filteredTasks.map((task) => task.id)).toEqual(['task-target']);
    expect(viewModel.ganttRiskTasks.map((task) => task.id)).toEqual(['task-target']);
    expect(viewModel.ganttRiskByTaskId.get('task-target')).toEqual({
      isAtRisk: true,
      overdue: false,
      blockedByOpen: 1,
      blockedByLate: 0,
    });
  });

  test('normalizes legacy and malformed manual layout state', () => {
    const state = normalizeTimelineManualLayoutState({
      section: {
        'section:default': {
          taskIds: [' task-1 ', 'task-2', 'task-1', '', null],
          rowHints: {
            ' task-1 ': 2,
            'task-2': 9,
            'task-3': 1,
            '': 4,
          },
        },
      },
      assignee: {
        'assignee:user-1': {
          taskOrder: [' task-6 ', 'task-7', 'task-6'],
          rowByTaskId: {
            ' task-6 ': 1,
            'task-7': 9,
            'task-8': 0,
          },
        },
      },
      status: {
        'status:TODO': ['task-4', 'task-5'],
      },
    });

    expect(state).toEqual({
      section: {
        'section:default': {
          orderedTaskIds: ['task-1', 'task-2'],
          rowByTaskId: {
            'task-1': 1,
            'task-2': 1,
          },
        },
      },
      assignee: {
        'assignee:user-1': {
          orderedTaskIds: ['task-6', 'task-7'],
          rowByTaskId: {
            'task-6': 1,
            'task-7': 1,
          },
        },
      },
      status: {
        'status:TODO': {
          orderedTaskIds: ['task-4', 'task-5'],
        },
      },
    });
  });
});
