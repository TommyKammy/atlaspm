'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, getToken } from '@/lib/api';

function TaskRow({ task, sectionId, onEdit }: { task: any; sectionId: string; onEdit: (taskId: string, patch: any) => Promise<void>; }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { sectionId },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="grid grid-cols-5 items-center gap-2 border-b bg-white px-2 py-2"
      data-testid={`task-${task.id}`}
      data-task-title={task.title}
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab rounded border px-2 py-1 text-xs text-slate-600 active:cursor-grabbing"
          data-testid={`drag-handle-${task.id}`}
          aria-label={`Drag ${task.title}`}
          {...attributes}
          {...listeners}
          type="button"
        >
          Drag
        </button>
        <span>{task.title}</span>
      </div>
      <input
        className="rounded border p-1"
        value={task.assigneeUserId ?? ''}
        placeholder="assignee"
        onChange={(e) => void onEdit(task.id, { assigneeUserId: e.target.value || null, version: task.version })}
      />
      <input
        type="date"
        className="rounded border p-1"
        value={task.dueAt ? String(task.dueAt).slice(0, 10) : ''}
        onChange={(e) => void onEdit(task.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null, version: task.version })}
      />
      <input
        type="number"
        className="rounded border p-1"
        min={0}
        max={100}
        value={task.progressPercent}
        onChange={(e) => void onEdit(task.id, { progressPercent: Number(e.target.value), version: task.version })}
      />
      <select
        className="rounded border p-1"
        value={task.status}
        onChange={(e) => void onEdit(task.id, { status: e.target.value, version: task.version })}
      >
        <option value="TODO">TODO</option>
        <option value="IN_PROGRESS">IN_PROGRESS</option>
        <option value="DONE">DONE</option>
        <option value="BLOCKED">BLOCKED</option>
      </select>
    </div>
  );
}

export default function ProjectBoard({ projectId }: { projectId: string }) {
  const sensors = useSensors(useSensor(PointerSensor));
  const [groups, setGroups] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const token = useMemo(() => getToken(), []);

  const reload = async () => {
    const data = await api(`/projects/${projectId}/tasks?groupBy=section`, { token });
    setGroups(data);
    const ruleList = await api(`/projects/${projectId}/rules`, { token });
    setRules(ruleList);
  };

  useEffect(() => {
    void reload();
  }, [projectId]);

  const onEdit = async (taskId: string, patch: any) => {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: patch, token });
    await reload();
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overTaskId = String(over.id);
    const toSectionId = String(over.data.current?.sectionId ?? '');
    if (!toSectionId) return;

    const targetGroup = groups.find((g) => g.section.id === toSectionId);
    const tasks = targetGroup?.tasks ?? [];
    const overIndex = tasks.findIndex((t: any) => t.id === overTaskId);
    const beforeTaskId = overIndex > 0 ? tasks[overIndex - 1].id : null;
    const afterTaskId = tasks[overIndex]?.id ?? null;

    await api(`/sections/${toSectionId}/tasks/reorder`, {
      method: 'POST',
      token,
      body: {
        taskId: activeTaskId,
        beforeTaskId,
        afterTaskId,
      },
    }).catch(async () => {
      await reload();
    });
    await reload();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="font-semibold">Rules</h2>
        <ul className="text-sm text-slate-600">
          {rules.map((r) => (
            <li key={r.id}>{r.name}: {r.enabled ? 'enabled' : 'disabled'}</li>
          ))}
        </ul>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {groups.map((group) => (
          <section key={group.section.id} className="rounded-xl border border-slate-300 bg-slate-50" data-testid={`section-${group.section.id}`}>
            <h3 className="border-b px-3 py-2 font-semibold">{group.section.name}</h3>
            <div className="grid grid-cols-5 gap-2 bg-slate-100 px-2 py-1 text-xs font-semibold uppercase text-slate-600">
              <div>Name</div>
              <div>Assignee</div>
              <div>Due date</div>
              <div>Progress</div>
              <div>Status</div>
            </div>
            <SortableContext items={group.tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
              {group.tasks.map((task: any) => (
                <TaskRow key={task.id} task={task} sectionId={group.section.id} onEdit={onEdit} />
              ))}
            </SortableContext>
          </section>
        ))}
      </DndContext>
    </div>
  );
}
