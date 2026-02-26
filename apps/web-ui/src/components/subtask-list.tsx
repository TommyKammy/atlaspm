'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Task, TaskTree, TaskBreadcrumb } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';

type CreateSubtaskInput = {
  title: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  assigneeUserId?: string;
  startAt?: string;
  dueAt?: string;
};

type SubtaskResponse = Task & { parentId: string | null; depth: number };

function SubtaskItem({
  task,
  projectId,
  depth = 0,
  onTaskClick,
  expanded,
  onToggle,
}: {
  task: TaskTree;
  projectId: string;
  depth?: number;
  onTaskClick: (taskId: string) => void;
  expanded: Set<string>;
  onToggle: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const hasChildren = task.children && task.children.length > 0;
  const isExpanded = expanded.has(task.id);

  const deleteSubtask = useMutation({
    mutationFn: () => api(`/tasks/${task.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtasks(task.parentId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtaskTree(task.parentId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  return (
    <div className="select-none">
      <div
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
        style={{ paddingLeft: `${(depth + 1) * 16}px` }}
        onClick={() => onTaskClick(task.id)}
        data-testid={`subtask-row-${task.id}`}
      >
        <button
          type="button"
          className={`h-4 w-4 flex items-center justify-center rounded hover:bg-accent ${hasChildren ? 'visible' : 'invisible'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
          data-testid={`subtask-toggle-${task.id}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        
        <span className="flex-1 text-sm truncate">{task.title}</span>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              deleteSubtask.mutate();
            }}
            disabled={deleteSubtask.isPending}
            data-testid={`subtask-delete-${task.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        
        <span className={`
          text-xs px-1.5 py-0.5 rounded
          ${task.status === 'DONE' ? 'bg-green-100 text-green-700' : ''}
          ${task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : ''}
          ${task.status === 'BLOCKED' ? 'bg-red-100 text-red-700' : ''}
          ${task.status === 'TODO' ? 'bg-gray-100 text-gray-600' : ''}
        `}>
          {task.status}
        </span>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {task.children.map((child) => (
            <SubtaskItem
              key={child.id}
              task={child}
              projectId={projectId}
              depth={depth + 1}
              onTaskClick={onTaskClick}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateSubtaskDialog({
  parentTaskId,
  projectId,
  children,
}: {
  parentTaskId: string;
  projectId: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const createSubtask = useMutation({
    mutationFn: (data: CreateSubtaskInput) =>
      api(`/tasks/${parentTaskId}/subtasks`, { method: 'POST', body: data }) as Promise<SubtaskResponse>,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtasks(parentTaskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtaskTree(parentTaskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createSubtask')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('taskName')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('enterSubtaskTitle')}
              data-testid="create-subtask-title"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('enterSubtaskDescriptionOptional')}
              className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-y"
              data-testid="create-subtask-description"
            />
          </div>
          <Button
            onClick={() => createSubtask.mutate({ title, description })}
            disabled={!title.trim() || createSubtask.isPending}
            className="w-full"
            data-testid="create-subtask-submit"
          >
            {t('createSubtask')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SubtaskList({
  taskId,
  projectId,
  onTaskClick,
}: {
  taskId: string;
  projectId: string;
  onTaskClick: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  const subtasksQuery = useQuery<TaskTree[]>({
    queryKey: queryKeys.taskSubtaskTree(taskId),
    queryFn: () => api(`/tasks/${taskId}/subtasks/tree`),
  });

  const breadcrumbsQuery = useQuery<TaskBreadcrumb[]>({
    queryKey: queryKeys.taskBreadcrumbs(taskId),
    queryFn: () => api(`/tasks/${taskId}/breadcrumbs`),
  });

  const toggleExpanded = (taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const tree = subtasksQuery.data ?? [];
  const breadcrumbs = breadcrumbsQuery.data ?? [];
  const hasSubtasks = tree.length > 0;

  return (
    <div className="space-y-3" data-testid="subtasks-section">
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center">
              {index > 0 && <ChevronRight className="h-3 w-3 mx-1" />}
              <button
                type="button"
                className="hover:text-foreground hover:underline truncate max-w-[150px]"
                onClick={() => onTaskClick(crumb.id)}
              >
                {crumb.title}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('subtasks')}</h3>
        <CreateSubtaskDialog parentTaskId={taskId} projectId={projectId}>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto px-1 py-0.5 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            data-testid="subtasks-add-btn"
          >
            <Plus className="mr-1 h-3 w-3" />
            {t('addSubtaskInline')}
          </Button>
        </CreateSubtaskDialog>
      </div>

      {subtasksQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">{t('loadingSubtasks')}</div>
      ) : hasSubtasks ? (
        <div className="rounded-md border border-border/50 bg-card/40">
          {tree.map((child) => (
            <SubtaskItem
              key={child.id}
              task={child}
              projectId={projectId}
              depth={0}
              onTaskClick={onTaskClick}
              expanded={expanded}
              onToggle={toggleExpanded}
            />
          ))}
        </div>
      ) : (
        <div className="py-1 text-sm text-muted-foreground" data-testid="subtasks-empty">
          {t('noSubtasksYet')}
        </div>
      )}
    </div>
  );
}
