'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { DEFAULT_REMINDER_PREFERENCES } from '@/lib/reminder-preferences';
import type { ReminderPreferences, Task, TaskReminder } from '@/lib/types';
import {
  buildDefaultReminderInputValue,
  parseReminderInputToIso,
  toDatetimeLocalInputValue,
} from '@/components/task-detail/task-detail-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TaskDetailReminderSection({
  taskId,
  currentTask,
  onAuditChanged,
}: {
  taskId: string;
  currentTask: Task | undefined;
  onAuditChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [reminderAtInput, setReminderAtInput] = useState('');

  const reminderQuery = useQuery<TaskReminder | null>({
    queryKey: queryKeys.taskReminder(taskId),
    queryFn: () => api(`/tasks/${taskId}/reminder`),
  });

  const reminderPreferencesQuery = useQuery<ReminderPreferences>({
    queryKey: queryKeys.reminderPreferences,
    queryFn: () => api('/me/reminder-preferences'),
  });

  const reminderPreferences = reminderPreferencesQuery.data ?? DEFAULT_REMINDER_PREFERENCES;
  const reminderLocal = reminderQuery.data?.remindAt
    ? toDatetimeLocalInputValue(new Date(reminderQuery.data.remindAt))
    : '';
  const defaultReminderInput =
    !reminderQuery.data?.id && reminderPreferences.enabled
      ? buildDefaultReminderInputValue(currentTask?.dueAt, reminderPreferences.defaultLeadTimeMinutes)
      : '';
  const reminderInput = reminderAtInput || reminderLocal || defaultReminderInput;
  const reminderIso = parseReminderInputToIso(reminderInput);

  const setReminder = useMutation({
    mutationFn: (remindAt: string) => api(`/tasks/${taskId}/reminder`, { method: 'PUT', body: { remindAt } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId) });
      await onAuditChanged();
    },
  });

  const clearReminder = useMutation({
    mutationFn: () => api(`/tasks/${taskId}/reminder`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId) });
      await onAuditChanged();
    },
  });

  return (
    <section className="space-y-2 pb-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('dueReminder')}</div>
      <div className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/25">
        <Input
          type="datetime-local"
          value={reminderInput}
          onChange={(event) => setReminderAtInput(event.target.value)}
          className="h-8 w-[250px] border-transparent bg-transparent shadow-none hover:bg-muted/30 focus-visible:border-border"
          disabled={!reminderPreferences.enabled}
          data-testid="task-reminder-input"
        />
        <Button
          size="sm"
          onClick={() => {
            if (!reminderIso) return;
            setReminder.mutate(reminderIso);
            setReminderAtInput('');
          }}
          disabled={!reminderIso || setReminder.isPending || !reminderPreferences.enabled}
          data-testid="task-reminder-save"
        >
          {setReminder.isPending ? t('saving') : t('saveReminder')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearReminder.mutate();
            setReminderAtInput('');
          }}
          disabled={!reminderQuery.data?.id || clearReminder.isPending}
          data-testid="task-reminder-clear"
        >
          <Clock3 className="mr-1 h-4 w-4" />
          {t('clearReminder')}
        </Button>
      </div>
      {!reminderPreferences.enabled ? (
        <p className="px-1 text-xs text-muted-foreground" data-testid="task-reminder-disabled-note">
          {t('taskReminderDeliveryPaused')}
        </p>
      ) : (
        !reminderQuery.data?.id
        && defaultReminderInput && (
          <p className="px-1 text-xs text-muted-foreground" data-testid="task-reminder-default-note">
            {t('taskReminderDefaultTimingHint')}
          </p>
        )
      )}
    </section>
  );
}
