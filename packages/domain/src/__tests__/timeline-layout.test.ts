import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTimelineLaneSubtaskMeta,
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

test('buildTimelineLayout can reserve footer space below compact rows for easier dragging', () => {
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
    laneFooterHeight: 40,
  });

  const designLane = layout.lanesWithRows.find((lane) => lane.lane.id === 'section:design');
  assert.equal(layout.bodyHeight, 184);
  assert.equal(layout.totalRowCount, 5);
  assert.equal(designLane?.footerHeight, 40);
  assert.equal(designLane?.bottom, 184);
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

test('buildTimelineLayout keeps expanded-row lanes un-packed while compacting other lanes', () => {
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
    expandedRowLaneIds: ['section:design'],
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
        ],
      },
    ],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    manualPlacementByLane: {
      'section:design': {
        orderedTaskIds: ['task-blocker', 'task-chain-a', 'task-chain-b'],
      },
    },
    dependencyAwarePacking: true,
    dependencyEdges: [{ source: 'task-chain-a', target: 'task-chain-b', type: 'BLOCKS' }],
  });

  const designLane = layout.lanesWithRows[0];

  assert.deepEqual(
    designLane?.rows.map((row) => ({ index: row.index, taskIds: row.tasks.map((task) => task.id) })),
    [
      { index: 0, taskIds: ['task-blocker'] },
      { index: 1, taskIds: ['task-chain-a', 'task-chain-b'] },
    ],
  );
  assert.equal(layout.taskRowsById['task-blocker']?.top, 32);
  assert.equal(layout.taskRowsById['task-chain-a']?.top, 72);
  assert.equal(layout.taskRowsById['task-chain-b']?.top, 72);
});

test('buildTimelineLayout preserves manual vertical order while still compacting non-overlapping tasks', () => {
  const manualOrderTasks: TaskInput[] = [
    {
      id: 'task-early',
      title: 'Manual second, early dates',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'IN_PROGRESS',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-02'),
      timelineEnd: utcDate('2026-03-03'),
    },
    {
      id: 'task-overlap',
      title: 'Manual third, overlaps both',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'BLOCKED',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-03'),
      timelineEnd: utcDate('2026-03-05'),
    },
    {
      id: 'task-late',
      title: 'Manual top, late dates',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-05'),
      timelineEnd: utcDate('2026-03-06'),
    },
  ];

  const layout = buildTimelineLayout({
    lanes: [{ id: 'section:design', label: 'Design', tasks: manualOrderTasks }],
    windowStart: utcDate('2026-03-01'),
    windowEnd: utcDate('2026-03-10'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
    compactRows: true,
    manualPlacementByLane: {
      'section:design': {
        orderedTaskIds: ['task-late', 'task-early', 'task-overlap'],
      },
    },
  });

  const designLane = layout.lanesWithRows[0];

  assert.equal(designLane?.rows.length, 2);
  assert.deepEqual(
    designLane?.rows.map((row) => ({ index: row.index, taskIds: row.tasks.map((task) => task.id) })),
    [
      { index: 0, taskIds: ['task-late', 'task-early'] },
      { index: 1, taskIds: ['task-overlap'] },
    ],
  );
  assert.deepEqual(layout.taskRowsById['task-late'], { top: 32, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-early'], { top: 32, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-overlap'], { top: 72, height: 40 });
});

test('buildTimelineLaneSubtaskMeta hides collapsed descendants and cascades row hints', () => {
  const meta = buildTimelineLaneSubtaskMeta(
    [
      { id: 'parent', parentId: null },
      { id: 'child', parentId: 'parent' },
      { id: 'grandchild', parentId: 'child' },
      { id: 'sibling', parentId: null },
    ],
    new Set(['child']),
    {
      parent: 1,
      grandchild: 0,
      sibling: 4,
    },
  );

  assert.deepEqual(meta.visibleTaskIds, ['parent', 'child', 'sibling']);
  assert.deepEqual(meta.childIdsByParentId, {
    parent: ['child'],
    child: ['grandchild'],
  });
  assert.deepEqual(meta.depthByTaskId, {
    parent: 0,
    child: 1,
    sibling: 0,
  });
  assert.deepEqual(meta.rowHintByTaskId, {
    parent: 1,
    child: 2,
    sibling: 4,
  });
});

test('buildTimelineLaneSubtaskMeta keeps cyclic tasks visible', () => {
  const meta = buildTimelineLaneSubtaskMeta(
    [
      { id: 'cycle-a', parentId: 'cycle-b' },
      { id: 'cycle-b', parentId: 'cycle-a' },
      { id: 'self-parent', parentId: 'self-parent' },
    ],
    new Set(),
    {
      'cycle-b': 2,
      'self-parent': 4,
    },
  );

  assert.deepEqual(meta.visibleTaskIds, ['cycle-a', 'cycle-b', 'self-parent']);
  assert.deepEqual(meta.childIdsByParentId, {
    'cycle-a': ['cycle-b'],
    'cycle-b': ['cycle-a'],
    'self-parent': ['self-parent'],
  });
  assert.deepEqual(meta.depthByTaskId, {
    'cycle-a': 0,
    'cycle-b': 1,
    'self-parent': 0,
  });
  assert.deepEqual(meta.rowHintByTaskId, {
    'cycle-a': 0,
    'cycle-b': 2,
    'self-parent': 4,
  });
});

test('buildTimelineLayout respects manual order for overlapping tasks even when dates start earlier', () => {
  const layout = buildTimelineLayout({
    lanes: [
      {
        id: 'section:design',
        label: 'Design',
        tasks: [
          {
            id: 'task-early-second',
            title: 'Manual second despite earlier start',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'IN_PROGRESS',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-02'),
            timelineEnd: utcDate('2026-03-05'),
          },
          {
            id: 'task-late-first',
            title: 'Manual top despite later start',
            sectionId: 'design',
            assigneeUserId: 'user-1',
            status: 'TODO',
            hasSchedule: true,
            inWindow: true,
            timelineStart: utcDate('2026-03-04'),
            timelineEnd: utcDate('2026-03-07'),
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
    manualPlacementByLane: {
      'section:design': {
        orderedTaskIds: ['task-late-first', 'task-early-second'],
      },
    },
  });

  assert.deepEqual(
    layout.lanesWithRows[0]?.rows.map((row) => ({ index: row.index, taskIds: row.tasks.map((task) => task.id) })),
    [
      { index: 0, taskIds: ['task-late-first'] },
      { index: 1, taskIds: ['task-early-second'] },
    ],
  );
  assert.equal(layout.taskRowsById['task-late-first']?.top, 32);
  assert.equal(layout.taskRowsById['task-early-second']?.top, 72);
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

test('buildTimelineLayout clamps oversized manual row hints to lane size', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-a',
      title: 'Task A',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-01'),
      timelineEnd: utcDate('2026-03-02'),
    },
    {
      id: 'task-b',
      title: 'Task B',
      sectionId: 'design',
      assigneeUserId: null,
      status: 'TODO',
      hasSchedule: true,
      inWindow: true,
      timelineStart: utcDate('2026-03-03'),
      timelineEnd: utcDate('2026-03-04'),
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
    manualPlacementByLane: {
      'section:design': {
        orderedTaskIds: tasks.map((task) => task.id),
        rowByTaskId: {
          'task-a': 100000,
        },
      },
    },
  });

  assert.equal(layout.lanesWithRows[0]?.rows.length, 2);
  assert.equal(layout.taskRowsById['task-a']?.top, 72);
});
