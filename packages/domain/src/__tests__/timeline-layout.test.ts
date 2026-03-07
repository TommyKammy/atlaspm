import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTimelineLanes,
  buildTimelineLayout,
  buildTimelineTaskOrderByLane,
  type TimelineLaneTaskInput,
  type TimelineSectionInput,
} from '../services/timeline-layout.js';

type TaskInput = TimelineLaneTaskInput & {
  title: string;
  hasSchedule: boolean;
  inWindow: boolean;
  timelineStart: Date | null;
  timelineEnd: Date | null;
};

const sections: TimelineSectionInput[] = [
  { id: 'default', name: 'No Section', position: 1000, isDefault: true },
  { id: 'design', name: 'Design', position: 2000, isDefault: false },
];

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}


test('buildTimelineLanes keeps assignee lanes visible for project members and unassigned', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Assigned',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'IN_PROGRESS',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-03'),
    },
    {
      id: 'task-2',
      title: 'Unassigned',
      sectionId: 'default',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-02'),
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'assignee',
    tasks,
    sections,
    membersById: {
      'user-1': { displayName: 'Dev User' },
      'user-2': { displayName: 'QA User' },
    },
    preferredLaneOrder: [],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  assert.deepEqual(
    lanes.map((lane) => ({ id: lane.id, taskCount: lane.tasks.length })),
    [
      { id: 'assignee:user-1', taskCount: 1 },
      { id: 'assignee:user-2', taskCount: 0 },
      { id: 'assignee:__unassigned__', taskCount: 1 },
    ],
  );
  assert.equal(lanes[0]?.label, 'Dev User');
  assert.equal(lanes[1]?.label, 'QA User');
  assert.equal(lanes[2]?.label, 'Unassigned');
});

test('buildTimelineLanes respects preferred section order', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Default task',
      sectionId: 'default',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
    {
      id: 'task-2',
      title: 'Design task',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'BLOCKED',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'section',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: ['section:design', 'section:default'],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  assert.deepEqual(
    lanes.map((lane) => lane.id),
    ['section:design', 'section:default'],
  );
});

test('buildTimelineLanes keeps empty sections visible and ordered by preference', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Design task',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'section',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: ['section:default', 'section:design'],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  assert.deepEqual(
    lanes.map((lane) => ({ id: lane.id, taskCount: lane.tasks.length })),
    [
      { id: 'section:default', taskCount: 0 },
      { id: 'section:design', taskCount: 1 },
    ],
  );
});

test('buildTimelineLanes keeps status lanes visible in fixed workflow order', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Blocked task',
      sectionId: 'default',
      assigneeUserId: null,
      status: 'BLOCKED',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
    {
      id: 'task-2',
      title: 'Todo task',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
    {
      id: 'task-3',
      title: 'Done task',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'DONE',
      hasSchedule: false,
      inWindow: false,
      timelineStart: null,
      timelineEnd: null,
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'status',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: ['status:DONE', 'status:BLOCKED'],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
    statusLabels: {
      TODO: 'To do',
      IN_PROGRESS: 'In progress',
      BLOCKED: 'Blocked',
      DONE: 'Done',
    },
  });

  assert.deepEqual(
    lanes.map((lane) => ({ id: lane.id, taskCount: lane.tasks.length })),
    [
      { id: 'status:TODO', taskCount: 1 },
      { id: 'status:IN_PROGRESS', taskCount: 0 },
      { id: 'status:DONE', taskCount: 1 },
      { id: 'status:BLOCKED', taskCount: 1 },
    ],
  );
  assert.equal(lanes[0]?.label, 'To do');
  assert.equal(lanes[1]?.label, 'In progress');
  assert.equal(lanes[2]?.label, 'Done');
  assert.equal(lanes[3]?.label, 'Blocked');
});

test('buildTimelineLanes respects preferred task order per lane', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'First',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-03'),
    },
    {
      id: 'task-2',
      title: 'Second',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-03'),
    },
    {
      id: 'task-3',
      title: 'Third',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-03'),
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'section',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: [],
    preferredTaskOrderByLane: {
      'section:design': ['task-3', 'task-1'],
    },
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  assert.deepEqual(
    lanes.find((lane) => lane.id === 'section:design')?.tasks.map((task) => task.id),
    ['task-3', 'task-1', 'task-2'],
  );
});

test('buildTimelineLayout calculates row and bar positions', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Scheduled',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'IN_PROGRESS',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-02'),
      timelineEnd: utcDate('2026-03-04'),
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'section',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: [],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  const layout = buildTimelineLayout({
    lanes,
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
  });

  const designLane = layout.lanesWithRows.find((lane) => lane.lane.id === 'section:design');
  assert.equal(layout.bodyHeight, 104);
  assert.equal(layout.totalRowCount, 3);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 64, height: 40 });
  assert.deepEqual(layout.barsByTaskId['task-1'], { left: 20, width: 60, y: 84 });
  assert.equal(designLane?.rows.length, 1);
});

test('buildTimelineLayout compacts non-overlapping tasks into shared rows', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'First',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-02'),
      timelineEnd: utcDate('2026-03-03'),
    },
    {
      id: 'task-2',
      title: 'Second',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'IN_PROGRESS',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-05'),
      timelineEnd: utcDate('2026-03-06'),
    },
    {
      id: 'task-3',
      title: 'Overlap',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'BLOCKED',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-03'),
      timelineEnd: utcDate('2026-03-05'),
    },
  ];

  const lanes = buildTimelineLanes({
    swimlane: 'section',
    tasks,
    sections,
    membersById: {},
    preferredLaneOrder: [],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  const layout = buildTimelineLayout({
    lanes,
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
  });

  const designLane = layout.lanesWithRows.find((lane) => lane.lane.id === 'section:design');

  assert.equal(layout.bodyHeight, 144);
  assert.equal(layout.totalRowCount, 4);
  assert.equal(designLane?.rows.length, 2);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 64, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-2'], { top: 64, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-3'], { top: 104, height: 40 });
  assert.deepEqual(designLane?.rows.map((row) => ({ index: row.index, taskIds: row.tasks.map((task) => task.id) })), [
    { index: 0, taskIds: ['task-1', 'task-2'] },
    { index: 1, taskIds: ['task-3'] },
  ]);
});

test('buildTimelineLayout keeps manual-layout lanes expanded while compacting other lanes', () => {
  const layout = buildTimelineLayout({
    lanes: [
      {
        id: 'section:design',
        label: 'Design',
        tasks: [
          {
            id: 'task-manual-1',
            title: 'Manual First',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-02'),
            timelineEnd: utcDate('2026-03-03'),
          },
          {
            id: 'task-manual-2',
            title: 'Manual Second',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'IN_PROGRESS',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-05'),
            timelineEnd: utcDate('2026-03-06'),
          },
        ],
      },
      {
        id: 'section:default',
        label: 'Tasks',
        tasks: [
          {
            id: 'task-packed-1',
            title: 'Packed First',
            sectionId: 'default',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-02'),
            timelineEnd: utcDate('2026-03-03'),
          },
          {
            id: 'task-packed-2',
            title: 'Packed Second',
            sectionId: 'default',
            assigneeUserId: 'user-1',
            status: 'IN_PROGRESS',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-05'),
            timelineEnd: utcDate('2026-03-06'),
          },
        ],
      },
    ],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    manualRowLaneIds: ['section:design'],
  });

  const designLane = layout.lanesWithRows.find((lane) => lane.lane.id === 'section:design');
  const defaultLane = layout.lanesWithRows.find((lane) => lane.lane.id === 'section:default');

  assert.equal(designLane?.rows.length, 2);
  assert.equal(defaultLane?.rows.length, 1);
});

test('buildTimelineLayout keeps manual task order authoritative over dependency packing', () => {
  const layout = buildTimelineLayout({
    lanes: [
      {
        id: 'section:design',
        label: 'Design',
        tasks: [
          {
            id: 'task-blocker',
            title: 'Manual blocker first',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-02'),
            timelineEnd: utcDate('2026-03-10'),
          },
          {
            id: 'task-chain-a',
            title: 'Chain start',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'IN_PROGRESS',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-05'),
            timelineEnd: utcDate('2026-03-06'),
          },
          {
            id: 'task-chain-b',
            title: 'Chain follow-up',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-07'),
            timelineEnd: utcDate('2026-03-08'),
          },
        ],
      },
    ],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    manualRowLaneIds: ['section:design'],
    dependencyAwarePacking: true,
    dependencyEdges: [{ source: 'task-chain-a', target: 'task-chain-b', type: 'BLOCKS' }],
  });

  const designLane = layout.lanesWithRows[0];

  assert.deepEqual(
    designLane?.rows.map((row) => ({ index: row.index, taskIds: row.tasks.map((task) => task.id) })),
    [
      { index: 0, taskIds: ['task-blocker'] },
      { index: 1, taskIds: ['task-chain-a'] },
      { index: 2, taskIds: ['task-chain-b'] },
    ],
  );
  assert.equal(layout.taskRowsById['task-blocker']?.top, 32);
  assert.equal(layout.taskRowsById['task-chain-a']?.top, 72);
  assert.equal(layout.taskRowsById['task-chain-b']?.top, 112);
});

test('buildTimelineLayout keeps input order inside compact rows', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-due-later',
      title: 'Due later',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-05'),
      timelineEnd: utcDate('2026-03-06'),
    },
    {
      id: 'task-due-earlier',
      title: 'Due earlier',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'DONE',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-02'),
      timelineEnd: utcDate('2026-03-03'),
    },
  ];

  const layout = buildTimelineLayout({
    lanes: [{ id: 'section:design', label: 'Design', tasks }],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
  });

  assert.deepEqual(layout.lanesWithRows[0]?.rows[0]?.tasks.map((task) => task.id), ['task-due-later', 'task-due-earlier']);
});

test('buildTimelineLayout can align dependency chains ahead of unrelated blockers', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-blocker',
      title: 'Long blocker',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-02'),
      timelineEnd: utcDate('2026-03-10'),
    },
    {
      id: 'task-chain-a',
      title: 'Chain start',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'IN_PROGRESS',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-05'),
      timelineEnd: utcDate('2026-03-06'),
    },
    {
      id: 'task-chain-b',
      title: 'Chain follow-up',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-07'),
      timelineEnd: utcDate('2026-03-08'),
    },
  ];

  const lanes = [{ id: 'section:design', label: 'Design', tasks }];

  const compactLayout = buildTimelineLayout({
    lanes,
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
  });

  const alignedLayout = buildTimelineLayout({
    lanes,
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    dependencyAwarePacking: true,
    dependencyEdges: [{ source: 'task-chain-a', target: 'task-chain-b', type: 'BLOCKS' }],
  });

  assert.equal(compactLayout.taskRowsById['task-blocker']?.top, 32);
  assert.equal(compactLayout.taskRowsById['task-chain-a']?.top, 72);
  assert.equal(compactLayout.taskRowsById['task-chain-b']?.top, 72);

  assert.equal(alignedLayout.taskRowsById['task-chain-a']?.top, 32);
  assert.equal(alignedLayout.taskRowsById['task-chain-b']?.top, 32);
  assert.equal(alignedLayout.taskRowsById['task-blocker']?.top, 72);
});

test('buildTimelineTaskOrderByLane returns explicit aligned order for visible lanes', () => {
  const laneTaskOrder = buildTimelineTaskOrderByLane({
    lanes: [
      {
        id: 'section:design',
        label: 'Design',
        tasks: [
          {
            id: 'task-chain-b',
            title: 'Chain follow-up',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-07'),
            timelineEnd: utcDate('2026-03-08'),
          },
          {
            id: 'task-chain-a',
            title: 'Chain start',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'IN_PROGRESS',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-05'),
            timelineEnd: utcDate('2026-03-06'),
          },
          {
            id: 'task-blocker',
            title: 'Long blocker',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-02'),
            timelineEnd: utcDate('2026-03-10'),
          },
        ],
      },
      {
        id: 'section:empty',
        label: 'Empty',
        tasks: [],
      },
    ],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    dependencyAwarePacking: true,
    dependencyEdges: [{ source: 'task-chain-a', target: 'task-chain-b', type: 'BLOCKS' }],
  });

  assert.deepEqual(laneTaskOrder, {
    'section:design': ['task-chain-a', 'task-chain-b', 'task-blocker'],
  });
});
