'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Rule, RuleAction, RuleCondition, RuleDefinition } from '@/lib/types';

const triggerOptions = ['task.progress.changed'] as const;

function ensureRuleDefinition(rule: Rule): RuleDefinition {
  if (rule.definition?.trigger && rule.definition.conditions && rule.definition.actions) {
    return rule.definition;
  }
  if (rule.templateKey === 'progress_to_done') {
    return {
      trigger: 'task.progress.changed',
      conditions: [{ field: 'progressPercent', op: 'eq', value: 100 }],
      actions: [{ type: 'setStatus', status: 'DONE' }, { type: 'setCompletedAtNow' }],
    };
  }
  return {
    trigger: 'task.progress.changed',
    conditions: [{ field: 'progressPercent', op: 'between', min: 0, max: 99 }],
    actions: [{ type: 'setStatus', status: 'IN_PROGRESS' }, { type: 'setCompletedAtNull' }],
  };
}

function RuleEditor({
  rule,
  onSave,
  onCancel,
}: {
  rule: Rule;
  onSave: (patch: { name: string; definition: RuleDefinition }) => Promise<void>;
  onCancel: () => void;
}) {
  const base = ensureRuleDefinition(rule);
  const [name, setName] = useState(rule.name);
  const [trigger, setTrigger] = useState<RuleDefinition['trigger']>(base.trigger);
  const [condition, setCondition] = useState<RuleCondition>(base.conditions[0] ?? { field: 'progressPercent', op: 'eq', value: 100 });
  const [actionStatus, setActionStatus] = useState<'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'>(
    (base.actions.find((action): action is Extract<RuleAction, { type: 'setStatus' }> => action.type === 'setStatus')
      ?.status ?? 'TODO') as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED',
  );
  const [setNow, setSetNow] = useState(base.actions.some((action) => action.type === 'setCompletedAtNow'));
  const [setNull, setSetNull] = useState(base.actions.some((action) => action.type === 'setCompletedAtNull'));

  const save = async () => {
    const actions: RuleAction[] = [{ type: 'setStatus', status: actionStatus }];
    if (setNow) actions.push({ type: 'setCompletedAtNow' });
    if (setNull) actions.push({ type: 'setCompletedAtNull' });
    await onSave({
      name,
      definition: {
        trigger,
        conditions: [condition],
        actions,
      },
    });
  };

  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Rule name
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={name}
            data-testid={`rule-name-input-${rule.id}`}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-600">
          Trigger
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as RuleDefinition['trigger'])}
          >
            {triggerOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-sm text-slate-600">
          Condition op
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={condition.op}
            onChange={(e) =>
              setCondition((prev) => ({ ...prev, op: e.target.value as RuleCondition['op'] }))
            }
          >
            <option value="eq">eq</option>
            <option value="lt">lt</option>
            <option value="lte">lte</option>
            <option value="gt">gt</option>
            <option value="gte">gte</option>
            <option value="between">between</option>
          </select>
        </label>
        {condition.op === 'between' ? (
          <>
            <label className="text-sm text-slate-600">
              Min
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                type="number"
                value={condition.min ?? 0}
                onChange={(e) => setCondition((prev) => ({ ...prev, min: Number(e.target.value) }))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Max
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                type="number"
                value={condition.max ?? 100}
                onChange={(e) => setCondition((prev) => ({ ...prev, max: Number(e.target.value) }))}
              />
            </label>
          </>
        ) : (
          <label className="text-sm text-slate-600">
            Value
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              type="number"
              value={condition.value ?? 0}
              onChange={(e) => setCondition((prev) => ({ ...prev, value: Number(e.target.value) }))}
            />
          </label>
        )}
        <label className="text-sm text-slate-600">
          Set status
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={actionStatus}
            onChange={(e) => setActionStatus(e.target.value as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED')}
          >
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-5 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={setNow} onChange={(e) => setSetNow(e.target.checked)} />
          Set completedAt now
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={setNull} onChange={(e) => setSetNull(e.target.checked)} />
          Set completedAt null
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
          data-testid={`rule-save-${rule.id}`}
          onClick={() => void save()}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 text-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const rulesQuery = useQuery<Rule[]>({
    queryKey: queryKeys.projectRules(projectId),
    queryFn: () => api(`/projects/${projectId}/rules`),
    enabled: Boolean(projectId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/rules/${id}/${enabled ? 'disable' : 'enable'}`, { method: 'POST' }) as Promise<Rule>,
    onSuccess: (updated) => {
      queryClient.setQueryData<Rule[]>(queryKeys.projectRules(projectId), (current = []) =>
        current.map((rule) => (rule.id === updated.id ? updated : rule)),
      );
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Rule> }) =>
      api(`/rules/${id}`, { method: 'PATCH', body: patch }) as Promise<Rule>,
    onSuccess: (updated) => {
      queryClient.setQueryData<Rule[]>(queryKeys.projectRules(projectId), (current = []) =>
        current.map((rule) => (rule.id === updated.id ? updated : rule)),
      );
      setEditingRuleId(null);
    },
  });

  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);

  if (!projectId) return <div>Loading...</div>;

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-slate-900">Rules</h1>
        <p className="mt-1 text-sm text-slate-500">Edit rule names and definitions for progress automation.</p>
      </header>

      {rules.map((rule) => (
        <article key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`rule-card-${rule.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium text-slate-900" data-testid={`rule-name-${rule.id}`}>{rule.name}</div>
              <div className="text-xs text-slate-500">template: {rule.templateKey} | cooldown: {rule.cooldownSec}s</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                onClick={() => setEditingRuleId(rule.id)}
                data-testid={`rule-edit-${rule.id}`}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                onClick={() => toggleMutation.mutate({ id: rule.id, enabled: rule.enabled })}
              >
                {rule.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          {editingRuleId === rule.id ? (
            <RuleEditor
              rule={rule}
              onCancel={() => setEditingRuleId(null)}
              onSave={async (patch) => {
                await patchMutation.mutateAsync({ id: rule.id, patch });
              }}
            />
          ) : null}
        </article>
      ))}

      {!rules.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No rules found.</div>
      ) : null}
    </div>
  );
}
