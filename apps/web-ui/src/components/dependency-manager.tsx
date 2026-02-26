'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Link2, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { TaskDependency, DependencyType, BlockedStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';

type AddDependencyInput = {
  dependsOnId: string;
  type?: DependencyType;
};

const dependencyTypeLabels: Record<DependencyType, { labelKey: string; color: string }> = {
  BLOCKS: { labelKey: 'dependencyBlocks', color: 'bg-red-100 text-red-700 border-red-200' },
  BLOCKED_BY: { labelKey: 'dependencyBlockedBy', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  RELATES_TO: { labelKey: 'dependencyRelatesTo', color: 'bg-blue-100 text-blue-700 border-blue-200' },
};

function DependencyItem({
  dependency,
  taskId,
  isIncoming = false,
}: {
  dependency: TaskDependency;
  taskId: string;
  isIncoming?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const relatedTask = isIncoming ? undefined : dependency.dependsOnTask;
  const type = isIncoming ? 'BLOCKS' : dependency.type;
  const typeInfo = dependencyTypeLabels[type];

  const removeDependency = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/dependencies/${isIncoming ? dependency.taskId : dependency.dependsOnId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskDependencies(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskDependents(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskBlocked(taskId) });
    },
  });

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card" data-testid={`dependency-item-${dependency.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge className={typeInfo.color}>
            {t(typeInfo.labelKey)}
          </Badge>
          {relatedTask && (
            <span className="text-sm truncate">{relatedTask.title}</span>
          )}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 flex-shrink-0"
        onClick={() => removeDependency.mutate()}
        disabled={removeDependency.isPending}
        data-testid={`dependency-delete-${dependency.id}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function AddDependencyDialog({
  taskId,
  existingTaskIds,
  children,
}: {
  taskId: string;
  existingTaskIds: string[];
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dependsOnId, setDependsOnId] = useState('');
  const [type, setType] = useState<DependencyType>('BLOCKS');
  const [error, setError] = useState<string | null>(null);

  const addDependency = useMutation({
    mutationFn: (data: AddDependencyInput) =>
      api(`/tasks/${taskId}/dependencies`, { method: 'POST', body: data }) as Promise<TaskDependency>,
    onSuccess: () => {
      setDependsOnId('');
      setType('BLOCKS');
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskDependencies(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskBlocked(taskId) });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const isValidTaskId = dependsOnId.length > 0 && dependsOnId !== taskId && !existingTaskIds.includes(dependsOnId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addDependency')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('taskIdLabel')}</label>
            <Input
              value={dependsOnId}
              onChange={(e) => {
                setDependsOnId(e.target.value);
                setError(null);
              }}
              placeholder={t('enterTaskIdToDependOn')}
            />
            <p className="text-xs text-muted-foreground">
              {t('enterTaskIdHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('dependencyType')}</label>
            <Select value={type} onValueChange={(v: string) => setType(v as DependencyType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BLOCKS">{t('blocksOption')}</SelectItem>
                <SelectItem value="BLOCKED_BY">{t('blockedByOption')}</SelectItem>
                <SelectItem value="RELATES_TO">{t('relatesToOption')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button
            onClick={() => addDependency.mutate({ dependsOnId, type })}
            disabled={!isValidTaskId || addDependency.isPending}
            className="w-full"
          >
            {t('addDependency')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DependencyManager({
  taskId,
}: {
  taskId: string;
}) {
  const { t } = useI18n();
  const dependenciesQuery = useQuery<TaskDependency[]>({
    queryKey: queryKeys.taskDependencies(taskId),
    queryFn: () => api(`/tasks/${taskId}/dependencies`),
  });

  const dependentsQuery = useQuery<TaskDependency[]>({
    queryKey: queryKeys.taskDependents(taskId),
    queryFn: () => api(`/tasks/${taskId}/dependents`),
  });

  const blockedQuery = useQuery<BlockedStatus>({
    queryKey: queryKeys.taskBlocked(taskId),
    queryFn: () => api(`/tasks/${taskId}/blocked`),
  });

  const dependencies = dependenciesQuery.data ?? [];
  const dependents = dependentsQuery.data ?? [];
  const isBlocked = (blockedQuery.data as { isBlocked?: boolean; blocked?: boolean } | undefined)?.isBlocked
    ?? (blockedQuery.data as { blocked?: boolean } | undefined)?.blocked
    ?? false;
  const unresolvedBlockers = dependencies.filter(
    (dep) =>
      (dep.type === 'BLOCKS' || dep.type === 'BLOCKED_BY') &&
      dep.dependsOnTask?.status !== 'DONE',
  );

  const existingTaskIds = [
    ...dependencies.map((d) => d.dependsOnId),
    ...dependents.map((d) => d.taskId),
  ];
  const blockersText =
    unresolvedBlockers.length === 1
      ? `1 ${t('blockingTaskPendingSingle')}`
      : `${unresolvedBlockers.length} ${t('blockingTasksPending')}`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {isBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{t('thisTaskIsBlocked')}</p>
              <p className="text-xs text-red-600">{blockersText}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <h3 className="text-sm font-medium" data-testid="dependencies-heading">{t('dependencies')}</h3>
            {dependencies.length > 0 && (
              <Badge className="bg-secondary text-secondary-foreground" data-testid="dependencies-count">
                {dependencies.length}
              </Badge>
            )}
          </div>
          <AddDependencyDialog
            taskId={taskId}
            existingTaskIds={existingTaskIds}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-auto px-1 py-0.5 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
              data-testid="dependencies-add-btn"
            >
              <Plus className="mr-1 h-3 w-3" />
              {t('addDependency')}
            </Button>
          </AddDependencyDialog>
        </div>

        {dependenciesQuery.isLoading || dependentsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">{t('loadingDependencies')}</div>
        ) : dependencies.length === 0 && dependents.length === 0 ? (
          <div className="py-1 text-sm text-muted-foreground" data-testid="dependencies-empty">
            {t('noDependenciesYet')}
          </div>
        ) : (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <DependencyItem
                key={dep.id}
                dependency={dep}
                taskId={taskId}
              />
            ))}
            {dependents.map((dep) => (
              <DependencyItem
                key={dep.id}
                dependency={dep}
                taskId={taskId}
                isIncoming
              />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
