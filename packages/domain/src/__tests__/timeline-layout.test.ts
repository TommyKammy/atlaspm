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

test('buildTimelineLanes groups assignee lanes with unassigned at the end', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Assigned',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      hasSchedule: true,
      inWindow: true,
      timelineStart: new Date('2026-03-01T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-03T00:00:00.000Z'),
    },
    {
      id: 'task-2',
      title: 'Unassigned',
      sectionId: 'default',
      assigneeUserId: null,
      hasSchedule: true,
      inWindow: true,
      timelineStart: new Date('2026-03-01T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-02T00:00:00.000Z'),
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

test('buildTimelineLayout calculates row and bar positions', () => {
  const tasks: TaskInput[] = [
    {
      id: 'task-1',
      title: 'Scheduled',
      sectionId: 'design',
      assigneeUserId: 'user-1',
      hasSchedule: true,
      inWindow: true,
      timelineStart: new Date('2026-03-02T00:00:00.000Z'),
      timelineEnd: new Date('2026-03-04T00:00:00.000Z'),
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
    windowStart: new Date('2026-03-01T00:00:00.000Z'),
    windowEnd: new Date('2026-03-10T00:00:00.000Z'),
    dayColumnWidth: 20,
    sectionRowHeight: 32,
    taskRowHeight: 40,
  });

  assert.equal(layout.bodyHeight, 72);
  assert.equal(layout.totalRowCount, 2);
  assert.deepEqual(layout.taskRowsById['task-1'], { top: 32, height: 40 });
  assert.deepEqual(layout.barsByTaskId['task-1'], { left: 20, width: 60, y: 52 });
});
