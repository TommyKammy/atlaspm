'use client';

import { ProjectScheduleCanvas } from '@/components/project-timeline-view';
import type { Task } from '@/lib/types';

type ProjectGanttShellProps = {
  projectId: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  initialTaskId?: string | null;
};

export function ProjectGanttShell(props: ProjectGanttShellProps) {
  return <ProjectScheduleCanvas {...props} mode="gantt" />;
}
