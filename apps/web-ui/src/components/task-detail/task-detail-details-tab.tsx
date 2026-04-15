'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type RefObject } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  ProjectMember,
  Task,
} from '@/lib/types';
import { DependencyManager } from '@/components/dependency-manager';
import TaskDescriptionEditor from '@/components/editor/TaskDescriptionEditor';
import { SubtaskList } from '@/components/subtask-list';
import { TaskDetailAttachmentsSection } from '@/components/task-detail/task-detail-attachments-section';
import { TaskDetailOverviewSection } from '@/components/task-detail/task-detail-overview-section';
import { TaskDetailRecurrenceSection } from '@/components/task-detail/task-detail-recurrence-section';
import { TaskDetailReminderSection } from '@/components/task-detail/task-detail-reminder-section';

export function TaskDetailDetailsTab({
  taskId,
  projectId,
  currentTask,
  attachmentsSectionRef,
  onTaskUpdated,
}: {
  taskId: string;
  projectId: string;
  currentTask: Task | undefined;
  attachmentsSectionRef: RefObject<HTMLElement | null>;
  onTaskUpdated: (updated: Task) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });

  const members = membersQuery.data ?? [];

  const invalidateAudit = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
  };

  return (
    <div className="space-y-5">
      <TaskDetailOverviewSection
        taskId={taskId}
        projectId={projectId}
        currentTask={currentTask}
        members={members}
        onTaskUpdated={onTaskUpdated}
        onAuditChanged={invalidateAudit}
      />

      <TaskDetailReminderSection
        taskId={taskId}
        currentTask={currentTask}
        onAuditChanged={invalidateAudit}
      />

      <TaskDetailRecurrenceSection
        projectId={projectId}
        currentTask={currentTask}
        onAuditChanged={invalidateAudit}
      />

      <TaskDescriptionEditor
        taskId={taskId}
        descriptionDoc={currentTask?.descriptionDoc ?? null}
        descriptionVersion={currentTask?.descriptionVersion ?? 0}
        members={members}
        onSaved={async (updated) => {
          await onTaskUpdated(updated);
          await invalidateAudit();
        }}
        onReloadLatest={async () => {
          await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
        }}
        onAttachmentChanged={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
          void invalidateAudit();
        }}
      />

      <TaskDetailAttachmentsSection
        taskId={taskId}
        attachmentsSectionRef={attachmentsSectionRef}
        onAuditChanged={invalidateAudit}
      />

      <>
        <SubtaskList
          taskId={taskId}
          projectId={projectId}
          canCreateSubtask={!currentTask?.parentId}
          onTaskClick={(newTaskId) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(newTaskId) });
            const next = new URLSearchParams(searchParams.toString());
            next.set('task', newTaskId);
            router.push(`${pathname}?${next.toString()}`, { scroll: false });
          }}
        />
        <DependencyManager taskId={taskId} />
      </>
    </div>
  );
}
