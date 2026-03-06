import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTimelineLanes,
  buildTimelineLayout,
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

test('buildTimelineLanes groups assignee lanes with unassigned at the end', () => {
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
    },
    preferredLaneOrder: [],
    defaultSectionLabel: 'Tasks',
    unassignedLabel: 'Unassigned',
  });

  assert.deepEqual(
    lanes.map((lane) => lane.id),
    ['assignee:user-1', 'assignee:__unassigned__'],
  );
  assert.equal(lanes[0]?.label, 'Dev User');
  assert.equal(lanes[1]?.label, 'Unassigned');
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

test('buildTimelineLanes groups status lanes in fixed workflow order', () => {
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
    lanes.map((lane) => lane.id),
    ['status:TODO', 'status:DONE', 'status:BLOCKED'],
  );
  assert.equal(lanes[0]?.label, 'To do');
  assert.equal(lanes[1]?.label, 'Done');
  assert.equal(lanes[2]?.label, 'Blocked');
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

  assert.equal(layout.bodyHeight, 104);
  assert.equal(layout.totalRowCount, 3);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 64, height: 40 });
  assert.deepEqual(layout.barsByTaskId['task-1'], { left: 20, width: 60, y: 84 });
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

<<<<<<< HEAD
  const designLane = layout.lanesWithRows.find(
    (lane) => lane.lane.id === 'section:design',
  );

  assert.equal(layout.bodyHeight, 144);
  assert.equal(layout.totalRowCount, 4);
  assert.equal(designLane?.rows.length, 2);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 64, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-2'], { top: 64, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-3'], { top: 104, height: 40 });
=======
  assert.equal(layout.bodyHeight, 144);
  assert.equal(layout.totalRowCount, 4);
  assert.equal(layout.lanesWithRows[0]?.rows.length, 2);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 32, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-2'], { top: 32, height: 40 });
  assert.deepEqual(layout.taskRowsById['task-3'], { top: 72, height: 40 });
>>>>>>> 236be17 (test(domain): align timeline layout expected heights)
});
