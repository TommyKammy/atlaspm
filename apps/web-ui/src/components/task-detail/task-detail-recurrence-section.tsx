'use client';

import { normalizeDateOnlyUtcIso } from '@atlaspm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type {
  RecurringFrequency,
  RecurringRule,
  Task,
} from '@/lib/types';
import {
  createRecurrenceDraft,
  RECURRENCE_WEEKDAY_KEYS,
  recurrenceSummary,
  type RecurrenceDraft,
} from '@/components/task-detail/task-detail-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TaskDetailRecurrenceSection({
  projectId,
  currentTask,
  onAuditChanged,
}: {
  projectId: string;
  currentTask: Task | undefined;
  onAuditChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDraft>(createRecurrenceDraft(undefined, null));
  const [isRecurrenceEditing, setIsRecurrenceEditing] = useState(false);
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);

  const recurringRulesQuery = useQuery<RecurringRule[]>({
    queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
    queryFn: () => api(`/projects/${projectId}/recurring-rules?includeInactive=true`),
  });

  const currentRecurringRule = useMemo(() => {
    if (!currentTask) return null;
    const rules = recurringRulesQuery.data ?? [];
    if (currentTask.recurringRuleId) {
      const generatedRule = rules.find((rule) => rule.id === currentTask.recurringRuleId);
      if (generatedRule) return generatedRule;
    }
    return rules.find((rule) => rule.sourceTaskId === currentTask.id) ?? null;
  }, [currentTask, recurringRulesQuery.data]);

  useEffect(() => {
    setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
    setRecurrenceError(null);
    setIsRecurrenceEditing(false);
  }, [currentRecurringRule?.id, currentRecurringRule?.updatedAt, currentTask?.id]);

  const createRecurrence = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/projects/${projectId}/recurring-rules`, {
        method: 'POST',
        body,
      }) as Promise<RecurringRule>,
    onSuccess: async (created) => {
      setRecurrenceError(null);
      setIsRecurrenceEditing(false);
      queryClient.setQueryData<RecurringRule[]>(
        queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
        (current = []) => [created, ...current.filter((rule) => rule.id !== created.id)],
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }) });
      await onAuditChanged();
    },
    onError: (error) => {
      setRecurrenceError(error instanceof Error ? error.message : t('recurrenceSaveFailed'));
    },
  });

  const updateRecurrence = useMutation({
    mutationFn: ({ ruleId, body }: { ruleId: string; body: Record<string, unknown> }) =>
      api(`/recurring-rules/${ruleId}`, {
        method: 'PUT',
        body,
      }) as Promise<RecurringRule>,
    onSuccess: async (updated) => {
      setRecurrenceError(null);
      setIsRecurrenceEditing(false);
      queryClient.setQueryData<RecurringRule[]>(
        queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
        (current = []) => {
          if (!current.some((rule) => rule.id === updated.id)) {
            return [updated, ...current];
          }
          return current.map((rule) => (rule.id === updated.id ? { ...rule, ...updated } : rule));
        },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }) });
      await onAuditChanged();
    },
    onError: (error) => {
      setRecurrenceError(error instanceof Error ? error.message : t('recurrenceSaveFailed'));
    },
  });

  const toggleRecurrenceWeekday = (day: number) => {
    setRecurrenceDraft((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((item) => item !== day)
        : [...current.daysOfWeek, day].sort((left, right) => left - right),
    }));
  };

  const saveRecurrence = () => {
    if (!currentTask) return;

    const parsedInterval = Number.parseInt(recurrenceDraft.interval, 10);
    if (!Number.isFinite(parsedInterval) || parsedInterval < 1 || !recurrenceDraft.startDate) {
      setRecurrenceError(t('recurrenceSaveFailed'));
      return;
    }

    if (recurrenceDraft.frequency === 'WEEKLY' && recurrenceDraft.daysOfWeek.length === 0) {
      setRecurrenceError(t('recurrenceWeeklyValidation'));
      return;
    }

    const parsedDayOfMonth = Number.parseInt(recurrenceDraft.dayOfMonth, 10);
    if (
      recurrenceDraft.frequency === 'MONTHLY'
      && (!Number.isFinite(parsedDayOfMonth) || parsedDayOfMonth < 1 || parsedDayOfMonth > 31)
    ) {
      setRecurrenceError(t('recurrenceMonthlyValidation'));
      return;
    }

    const body = {
      frequency: recurrenceDraft.frequency,
      interval: parsedInterval,
      daysOfWeek: recurrenceDraft.frequency === 'WEEKLY' ? recurrenceDraft.daysOfWeek : [],
      dayOfMonth: recurrenceDraft.frequency === 'MONTHLY' ? parsedDayOfMonth : null,
      startDate: normalizeDateOnlyUtcIso(recurrenceDraft.startDate),
      endDate: recurrenceDraft.endDate ? normalizeDateOnlyUtcIso(recurrenceDraft.endDate) : null,
    };

    if (currentRecurringRule) {
      updateRecurrence.mutate({ ruleId: currentRecurringRule.id, body });
      return;
    }

    createRecurrence.mutate({
      ...body,
      title: currentTask.title.trim() || t('untitledTask'),
      description: currentTask.descriptionText ?? currentTask.description ?? '',
      sectionId: currentTask.sectionId,
      sourceTaskId: currentTask.id,
      assigneeUserId: currentTask.assigneeUserId ?? undefined,
      priority: currentTask.priority ?? undefined,
      tags: currentTask.tags ?? [],
    });
  };

  const toggleRecurrenceActive = (nextActive: boolean) => {
    if (!currentRecurringRule) return;
    updateRecurrence.mutate({
      ruleId: currentRecurringRule.id,
      body: { isActive: nextActive },
    });
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-3"
      data-testid="task-detail-recurrence-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('recurrence')}
          </div>
          <p className="text-sm text-muted-foreground">
            {currentTask?.recurringRuleId ? t('recurrenceGeneratedHint') : t('recurrenceHelp')}
          </p>
        </div>
        {currentRecurringRule ? (
          <Badge variant="secondary">
            {currentRecurringRule.isActive ? t('recurrenceActive') : t('recurrenceDisabled')}
          </Badge>
        ) : null}
      </div>

      {recurrenceError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {recurrenceError}
        </div>
      ) : null}

      {!isRecurrenceEditing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-foreground" data-testid="task-detail-recurrence-summary">
            {currentRecurringRule ? recurrenceSummary(currentRecurringRule, locale, t) : t('recurrenceEmpty')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentRecurringRule ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="task-detail-recurrence-edit"
                  onClick={() => {
                    setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
                    setRecurrenceError(null);
                    setIsRecurrenceEditing(true);
                  }}
                >
                  {t('recurrenceEdit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="task-detail-recurrence-disable"
                  disabled={updateRecurrence.isPending}
                  onClick={() => toggleRecurrenceActive(!currentRecurringRule.isActive)}
                >
                  {currentRecurringRule.isActive ? t('recurrenceDisable') : t('recurrenceEnable')}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                data-testid="task-detail-recurrence-create"
                onClick={() => {
                  setRecurrenceDraft(createRecurrenceDraft(currentTask, null));
                  setRecurrenceError(null);
                  setIsRecurrenceEditing(true);
                }}
              >
                {t('recurrenceCreate')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('recurrenceFrequency')}</span>
              <select
                value={recurrenceDraft.frequency}
                onChange={(event) =>
                  setRecurrenceDraft((current) => ({
                    ...current,
                    frequency: event.target.value as RecurringFrequency,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="task-detail-recurrence-frequency"
              >
                <option value="DAILY">{t('recurrenceDaily')}</option>
                <option value="WEEKLY">{t('recurrenceWeekly')}</option>
                <option value="MONTHLY">{t('recurrenceMonthly')}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('recurrenceInterval')}</span>
              <Input
                type="number"
                min={1}
                value={recurrenceDraft.interval}
                onChange={(event) => setRecurrenceDraft((current) => ({ ...current, interval: event.target.value }))}
                data-testid="task-detail-recurrence-interval"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('recurrenceStartDate')}</span>
              <Input
                type="date"
                value={recurrenceDraft.startDate}
                onChange={(event) => setRecurrenceDraft((current) => ({ ...current, startDate: event.target.value }))}
                data-testid="task-detail-recurrence-start-date"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('recurrenceEndDate')}</span>
              <Input
                type="date"
                value={recurrenceDraft.endDate}
                onChange={(event) => setRecurrenceDraft((current) => ({ ...current, endDate: event.target.value }))}
                data-testid="task-detail-recurrence-end-date"
              />
            </label>
          </div>

          {recurrenceDraft.frequency === 'WEEKLY' ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{t('recurrenceDays')}</div>
              <div className="flex flex-wrap gap-2">
                {RECURRENCE_WEEKDAY_KEYS.map((labelKey, day) => (
                  <Button
                    key={labelKey}
                    type="button"
                    size="sm"
                    variant={recurrenceDraft.daysOfWeek.includes(day) ? 'default' : 'outline'}
                    data-testid={`task-detail-recurrence-weekday-${day}`}
                    onClick={() => toggleRecurrenceWeekday(day)}
                  >
                    {t(labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {recurrenceDraft.frequency === 'MONTHLY' ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('recurrenceDayOfMonth')}</span>
              <Input
                type="number"
                min={1}
                max={31}
                value={recurrenceDraft.dayOfMonth}
                onChange={(event) => setRecurrenceDraft((current) => ({ ...current, dayOfMonth: event.target.value }))}
                data-testid="task-detail-recurrence-day-of-month"
              />
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              data-testid="task-detail-recurrence-save"
              disabled={createRecurrence.isPending || updateRecurrence.isPending}
              onClick={saveRecurrence}
            >
              {createRecurrence.isPending || updateRecurrence.isPending ? t('saving') : t('recurrenceSave')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
                setRecurrenceError(null);
                setIsRecurrenceEditing(false);
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
