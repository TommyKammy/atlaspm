'use client';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectMember, SectionTaskGroup, Task } from '@/lib/types';

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position);
}

function removeTaskFromGroups(groups: SectionTaskGroup[], taskId: string) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => task.id !== taskId),
  }));
}

function upsertTaskInSection(groups: SectionTaskGroup[], sectionId: string, task: Task) {
  return groups.map((group) => {
    if (group.section.id !== sectionId) return group;
    const nextTasks = sortByPosition([task, ...group.tasks.filter((item) => item.id !== task.id)]);
    return { ...group, tasks: nextTasks };
  });
}

function moveTaskPreview(
  groups: SectionTaskGroup[],
  taskId: string,
  toSectionId: string,
  targetTaskId: string | null,
) {
  const cloned = groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
  let movingTask: Task | null = null;

  for (const group of cloned) {
    const index = group.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      movingTask = group.tasks[index] ?? null;
      group.tasks.splice(index, 1);
      break;
    }
  }

  if (!movingTask) return groups;

  const destination = cloned.find((group) => group.section.id === toSectionId);
  if (!destination) return groups;

  const insertAt = targetTaskId
    ? Math.max(destination.tasks.findIndex((task) => task.id === targetTaskId), 0)
    : destination.tasks.length;

  destination.tasks.splice(insertAt, 0, { ...movingTask, sectionId: toSectionId });
  return cloned;
}

function resolveAssigneeLabel(task: Task, members: ProjectMember[]) {
  if (!task.assigneeUserId) return '';
  const member = members.find((item) => item.userId === task.assigneeUserId);
  if (!member) return task.assigneeUserId;
  return member.user.displayName || member.user.email || member.userId;
}

function AssigneeCombobox({
  task,
  members,
  onSelect,
}: {
  task: Task;
  members: ProjectMember[];
  onSelect: (assigneeUserId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selectedLabel = resolveAssigneeLabel(task, members);
  const candidates = useMemo(() => {
    if (!debounced) return members;
    return members.filter((member) => {
      const name = (member.user.displayName || '').toLowerCase();
      const email = (member.user.email || '').toLowerCase();
      return name.includes(debounced) || email.includes(debounced);
    });
  }, [debounced, members]);

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-sm text-slate-700"
        data-testid={`assignee-trigger-${task.id}`}
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
      >
        {selectedLabel || 'Unassigned'}
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-b border-slate-200 px-2 py-2 text-sm outline-none"
            placeholder="Search assignee"
            data-testid={`assignee-search-${task.id}`}
          />
          <button
            type="button"
            className="block w-full px-2 py-2 text-left text-sm hover:bg-slate-100"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            Unassigned
          </button>
          <div className="max-h-48 overflow-auto">
            {candidates.map((member) => {
              const label = member.user.displayName || member.user.email || member.user.id;
              const sub = member.user.email || member.user.id;
              return (
                <button
                  type="button"
                  key={member.id}
                  className="block w-full px-2 py-2 text-left text-sm hover:bg-slate-100"
                  data-testid={`assignee-option-${task.id}-${member.userId}`}
                  onClick={() => {
                    onSelect(member.userId);
                    setOpen(false);
                  }}
                >
                  <div className="font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </button>
              );
            })}
            {!candidates.length ? <div className="px-2 py-2 text-sm text-slate-500">No members found.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  sectionId,
  onEdit,
  members,
}: {
  task: Task;
  sectionId: string;
  onEdit: (taskId: string, patch: Partial<Task> & { version: number }) => void;
  members: ProjectMember[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { sectionId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="grid grid-cols-5 items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 hover:bg-slate-50"
      data-testid={`task-${task.id}`}
      data-task-title={task.title}
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 active:cursor-grabbing"
          data-testid={`drag-handle-${task.id}`}
          aria-label={`Drag ${task.title}`}
          type="button"
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
        <span className="text-sm text-slate-800">{task.title}</span>
      </div>
      <AssigneeCombobox
        task={task}
        members={members}
        onSelect={(assigneeUserId) => onEdit(task.id, { assigneeUserId, version: task.version })}
      />
      <input
        type="date"
        className="rounded border border-slate-300 p-1 text-sm"
        value={task.dueAt ? String(task.dueAt).slice(0, 10) : ''}
        onChange={(e) =>
          onEdit(task.id, {
            dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
            version: task.version,
          })
        }
      />
      <input
        type="number"
        className="rounded border border-slate-300 p-1 text-sm"
        min={0}
        max={100}
        value={task.progressPercent}
        onChange={(e) => onEdit(task.id, { progressPercent: Number(e.target.value), version: task.version })}
      />
      <select
        className="rounded border border-slate-300 p-1 text-sm"
        value={task.status}
        onChange={(e) => onEdit(task.id, { status: e.target.value as Task['status'], version: task.version })}
      >
        <option value="TODO">TODO</option>
        <option value="IN_PROGRESS">IN_PROGRESS</option>
        <option value="DONE">DONE</option>
        <option value="BLOCKED">BLOCKED</option>
      </select>
    </div>
  );
}

function QuickAddTask({
  sectionId,
  onCreate,
}: {
  sectionId: string;
  onCreate: (sectionId: string, title: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await onCreate(sectionId, trimmed);
    setTitle('');
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`quick-add-open-${sectionId}`}
        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
        onClick={() => setOpen(true)}
      >
        + Add task
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder="Task name"
        data-testid={`quick-add-input-${sectionId}`}
      />
      <button
        type="button"
        className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
        data-testid={`quick-add-submit-${sectionId}`}
        onClick={() => void submit()}
      >
        Add
      </button>
    </div>
  );
}

function SectionDropTarget({
  sectionId,
  children,
}: {
  sectionId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-drop-${sectionId}`,
    data: { sectionId },
  });

  return (
    <section
      ref={setNodeRef}
      className={`rounded-xl border bg-white transition ${
        isOver ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'
      }`}
      data-testid={`section-${sectionId}`}
    >
      {children}
    </section>
  );
}

function SectionDropZone({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-drop-zone-${sectionId}`,
    data: { sectionId },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`section-drop-zone-${sectionId}`}
      className={`rounded-md border border-dashed px-3 py-2 text-xs transition ${
        isOver ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-500'
      }`}
    >
      Drop tasks here
    </div>
  );
}

export default function ProjectBoard({ projectId }: { projectId: string }) {
  const sensors = useSensors(useSensor(PointerSensor));
  const queryClient = useQueryClient();

  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });

  const patchTask = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Partial<Task> & { version: number } }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }) as Promise<Task>,
    onMutate: async ({ taskId, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId ? { ...task, ...patch, version: task.version + 1 } : task,
          ),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        const removed = removeTaskFromGroups(current, updated.id);
        return upsertTaskInSection(removed, updated.sectionId, updated);
      });
    },
  });

  const createTask = useMutation({
    mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
      api(`/projects/${projectId}/tasks`, { method: 'POST', body: { sectionId, title } }) as Promise<Task>,
    onSuccess: (created) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        const removed = removeTaskFromGroups(current, created.id);
        return upsertTaskInSection(removed, created.sectionId, created);
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
    },
  });

  const reorderTask = useMutation({
    mutationFn: ({
      taskId,
      toSectionId,
      beforeTaskId,
      afterTaskId,
    }: {
      taskId: string;
      toSectionId: string;
      beforeTaskId: string | null;
      afterTaskId: string | null;
    }) =>
      api(`/sections/${toSectionId}/tasks/reorder`, {
        method: 'POST',
        body: {
          taskId,
          beforeTaskId,
          afterTaskId,
        },
      }),
    onMutate: async ({ taskId, toSectionId, afterTaskId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        moveTaskPreview(current, taskId, toSectionId, afterTaskId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const groups = groupsQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overTaskId = String(over.id);
    const droppedOnSection =
      overTaskId.startsWith('section-drop-') || overTaskId.startsWith('section-drop-zone-');
    const overSectionIdFromId = overTaskId.startsWith('section-drop-zone-')
      ? overTaskId.replace('section-drop-zone-', '')
      : overTaskId.startsWith('section-drop-')
        ? overTaskId.replace('section-drop-', '')
        : '';
    const fallbackSectionId =
      groups.find((group) => group.tasks.some((task) => task.id === overTaskId))?.section.id ?? '';
    const toSectionId = String(over.data.current?.sectionId ?? overSectionIdFromId ?? fallbackSectionId);
    if (!toSectionId) return;

    const targetGroup = groups.find((group) => group.section.id === toSectionId);
    const targetTasks = targetGroup?.tasks ?? [];
    const overIndex = droppedOnSection ? -1 : targetTasks.findIndex((task) => task.id === overTaskId);

    const beforeTaskId = overIndex > 0 ? targetTasks[overIndex - 1]?.id ?? null : null;
    const afterTaskId = overIndex >= 0 ? targetTasks[overIndex]?.id ?? null : null;

    reorderTask.mutate({ taskId: activeTaskId, toSectionId, beforeTaskId, afterTaskId });
  };

  const onEdit = (taskId: string, patch: Partial<Task> & { version: number }) => {
    patchTask.mutate({ taskId, patch });
  };

  if (groupsQuery.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading tasks...</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-5">
        {groups.map((group) => (
          <SectionDropTarget key={group.section.id} sectionId={group.section.id}>
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">{group.section.name}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{group.tasks.length}</span>
            </header>
            <div className="grid grid-cols-5 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div>Name</div>
              <div>Assignee</div>
              <div>Due date</div>
              <div>Progress</div>
              <div>Status</div>
            </div>
            <SortableContext items={group.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  sectionId={group.section.id}
                  onEdit={onEdit}
                  members={members}
                />
              ))}
            </SortableContext>
            {!group.tasks.length ? (
              <div className="px-3 py-3 text-sm text-slate-500" data-testid={`empty-section-${group.section.id}`}>
                No tasks in this section.
              </div>
            ) : null}
            <div className="border-t border-slate-100 px-3 py-2">
              <SectionDropZone sectionId={group.section.id} />
              <QuickAddTask
                sectionId={group.section.id}
                onCreate={async (sectionId, title) => {
                  await createTask.mutateAsync({ sectionId, title });
                }}
              />
            </div>
          </SectionDropTarget>
        ))}
        {!groups.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No sections yet. Add a section to start planning tasks.
          </div>
        ) : null}
      </div>
    </DndContext>
  );
}
