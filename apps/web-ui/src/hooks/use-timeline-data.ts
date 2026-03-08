import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  ProjectMember,
  Section,
  SectionTaskGroup,
  Task,
} from '@/lib/types';

export type TimelineWindow = {
  start: Date;
  end: Date;
};

export type TimelineTask = Task & {
  section: Section;
  timelineStart: Date | null;
  timelineEnd: Date | null;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  hasSchedule: boolean;
  hasBaseline: boolean;
  inWindow: boolean;
};

type DependencyGraphApiResponse = {
  nodes: DependencyGraphNode[];
  links?: DependencyGraphEdge[];
  edges?: DependencyGraphEdge[];
};

export type TimelineData = {
  sections: Section[];
  tasks: TimelineTask[];
  tasksBySection: Record<string, TimelineTask[]>;
  membersById: Record<string, ProjectMember['user']>;
  dependencyNodesById: Record<string, DependencyGraphNode>;
  dependencyEdges: DependencyGraphEdge[];
  window: TimelineWindow;
  isLoading: boolean;
  isError: boolean;
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addCalendarDays(base: Date, delta: number): Date {
  const result = startOfDay(base);
  result.setDate(result.getDate() + delta);
  return result;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : startOfDay(parsed);
}

function dateRange(startRaw: string | null | undefined, dueRaw: string | null | undefined): { start: Date | null; end: Date | null } {
  const start = toDateOrNull(startRaw);
  const due = toDateOrNull(dueRaw);
  if (start && due) {
    return start <= due ? { start, end: due } : { start: due, end: start };
  }
  if (start) return { start, end: start };
  if (due) return { start: due, end: due };
  return { start: null, end: null };
}

function taskRange(task: Task): { start: Date | null; end: Date | null } {
  return dateRange(task.startAt, task.dueAt);
}

function overlapsWindow(range: { start: Date | null; end: Date | null }, window: TimelineWindow): boolean {
  if (!range.start || !range.end) return false;
  return range.end >= window.start && range.start <= window.end;
}

export function normalizeTimelineWindow(window?: Partial<TimelineWindow>): TimelineWindow {
  const today = startOfDay(new Date());
  const fallbackStart = addCalendarDays(today, -7);
  const fallbackEnd = addCalendarDays(today, 21);
  const rawStart = window?.start ? startOfDay(window.start) : fallbackStart;
  const rawEnd = window?.end ? startOfDay(window.end) : fallbackEnd;
  if (rawStart <= rawEnd) return { start: rawStart, end: rawEnd };
  return { start: rawEnd, end: rawStart };
}

export function useTimelineData(projectId: string, window?: Partial<TimelineWindow>): TimelineData {
  const normalizedWindow = useMemo(() => normalizeTimelineWindow(window), [window?.end, window?.start]);
  const [{ data: groups, isLoading: groupsLoading, isError: groupsError }, { data: members, isLoading: membersLoading, isError: membersError }, { data: dependencyGraph, isLoading: graphLoading, isError: graphError }] = useQueries({
    queries: [
      {
        queryKey: queryKeys.projectTasksGrouped(projectId),
        queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`) as Promise<SectionTaskGroup[]>,
        enabled: Boolean(projectId),
      },
      {
        queryKey: queryKeys.projectMembers(projectId),
        queryFn: () => api(`/projects/${projectId}/members`) as Promise<ProjectMember[]>,
        enabled: Boolean(projectId),
      },
      {
        queryKey: queryKeys.projectDependencyGraph(projectId),
        queryFn: () => api(`/projects/${projectId}/dependency-graph`) as Promise<DependencyGraphApiResponse>,
        enabled: Boolean(projectId),
      },
    ],
  });

  const sections = useMemo(
    () =>
      (groups ?? [])
        .map((group) => group.section)
        .sort((left, right) => left.position - right.position),
    [groups],
  );

  const tasks = useMemo<TimelineTask[]>(
    () =>
      (groups ?? []).flatMap((group) =>
        [...group.tasks]
          .sort((left, right) => left.position - right.position)
          .map((task) => {
            const range = taskRange(task);
            const baselineRange = dateRange(task.baselineStartAt, task.baselineDueAt);
            return {
              ...task,
              section: group.section,
              timelineStart: range.start,
              timelineEnd: range.end,
              baselineStart: baselineRange.start,
              baselineEnd: baselineRange.end,
              hasSchedule: Boolean(range.start && range.end),
              hasBaseline: Boolean(baselineRange.start && baselineRange.end),
              inWindow: overlapsWindow(range, normalizedWindow),
            };
          }),
      ),
    [groups, normalizedWindow],
  );

  const tasksBySection = useMemo<Record<string, TimelineTask[]>>(() => {
    const next: Record<string, TimelineTask[]> = {};
    for (const task of tasks) {
      const list = next[task.sectionId] ?? [];
      list.push(task);
      next[task.sectionId] = list;
    }
    return next;
  }, [tasks]);

  const membersById = useMemo<Record<string, ProjectMember['user']>>(() => {
    const next: Record<string, ProjectMember['user']> = {};
    for (const member of members ?? []) {
      next[member.user.id] = member.user;
    }
    return next;
  }, [members]);

  const dependencyNodesById = useMemo<Record<string, DependencyGraphNode>>(() => {
    const next: Record<string, DependencyGraphNode> = {};
    for (const node of dependencyGraph?.nodes ?? []) {
      next[node.id] = node;
    }
    return next;
  }, [dependencyGraph?.nodes]);

  const dependencyEdges = useMemo<DependencyGraphEdge[]>(
    () => dependencyGraph?.edges ?? dependencyGraph?.links ?? [],
    [dependencyGraph?.edges, dependencyGraph?.links],
  );

  return {
    sections,
    tasks,
    tasksBySection,
    membersById,
    dependencyNodesById,
    dependencyEdges,
    window: normalizedWindow,
    isLoading: groupsLoading || membersLoading || graphLoading,
    isError: groupsError || membersError || graphError,
  };
}
