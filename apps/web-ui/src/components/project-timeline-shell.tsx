'use client';

import { ProjectScheduleCanvas } from '@/components/project-timeline-view';
import type { Task } from '@/lib/types';

type ProjectTimelineShellProps = {
  projectId: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  initialTaskId?: string | null;
};

export function ProjectTimelineShell(props: ProjectTimelineShellProps) {
  return <ProjectScheduleCanvas {...props} mode="timeline" />;
}
