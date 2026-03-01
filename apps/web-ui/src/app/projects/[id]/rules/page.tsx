'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useI18n } from '@/lib/i18n';
import type {
  CustomFieldDefinition,
  Rule,
  RuleAction,
  RuleCondition,
  RuleDefinition,
  ProjectMember,
} from '@/lib/types';

const triggerOptions = ['task.progress.changed'] as const;
type LogicalOperator = NonNullable<RuleDefinition['logicalOperator']>;

function parseApiErrorPayload(error: unknown): { code?: string; message?: string } | null {
  if (!(error instanceof Error)) return null;
  const matched = error.message.match(/^API\s+\d+:\s*(.*)$/s);
  if (!matched) return null;
  const raw = matched[1]?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as { code?: string; message?: string };
    }
  } catch {
    return null;
  }
  return null;
}

function ensureRuleDefinition(rule: Rule): RuleDefinition {
  if (rule.definition?.trigger && rule.definition.conditions && rule.definition.actions) {
    return {
      ...rule.definition,
      logicalOperator: rule.definition.logicalOperator ?? 'AND',
    };
  }
  if (rule.templateKey === 'progress_to_done') {
    return {
      trigger: 'task.progress.changed',
      logicalOperator: 'AND',
      conditions: [{ field: 'progressPercent', op: 'eq', value: 100 }],
      actions: [{ type: 'setStatus', status: 'DONE' }, { type: 'setCompletedAtNow' }],
    };
  }
  return {
    trigger: 'task.progress.changed',
    logicalOperator: 'AND',
    conditions: [{ field: 'progressPercent', op: 'between', min: 0, max: 99 }],
    actions: [{ type: 'setStatus', status: 'IN_PROGRESS' }, { type: 'setCompletedAtNull' }],
  };
}

function defaultRuleCondition(): RuleCondition {
  return { field: 'progressPercent', op: 'eq', value: 100 };
}

function withOperator(condition: RuleCondition, op: RuleCondition['op']): RuleCondition {
  if (op === 'between') {
    const min = typeof condition.min === 'number' ? condition.min : typeof condition.value === 'number' ? condition.value : 0;
    const max = typeof condition.max === 'number' ? condition.max : typeof condition.value === 'number' ? condition.value : 100;
    return { ...condition, op, min, max };
  }
  const value = typeof condition.value === 'number' ? condition.value : typeof condition.min === 'number' ? condition.min : 0;
  return { ...condition, op, value };
}

function RuleEditor({
  rule,
  customFields,
  onSave,
  onCancel,
}: {
  rule: Rule;
  customFields: CustomFieldDefinition[];
  onSave: (patch: { name: string; definition: RuleDefinition }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const base = ensureRuleDefinition(rule);
  const numberCustomFields = useMemo(
    () =>
      customFields
        .filter((field) => field.type === 'NUMBER' && !field.archivedAt)
        .sort((left, right) => left.position - right.position),
    [customFields],
  );
  const [name, setName] = useState(rule.name);
  const [trigger, setTrigger] = useState<RuleDefinition['trigger']>(base.trigger);
  const [logicalOperator, setLogicalOperator] = useState<LogicalOperator>(
    base.logicalOperator ?? 'AND',
  );
  const [conditions, setConditions] = useState<RuleCondition[]>(
    base.conditions.length ? base.conditions : [defaultRuleCondition()],
  );
  const [actionStatus, setActionStatus] = useState<'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'>(
    (base.actions.find((action): action is Extract<RuleAction, { type: 'setStatus' }> => action.type === 'setStatus')
      ?.status ?? 'TODO') as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED',
  );
  const [setNow, setSetNow] = useState(base.actions.some((action) => action.type === 'setCompletedAtNow'));
  const [setNull, setSetNull] = useState(base.actions.some((action) => action.type === 'setCompletedAtNull'));
  const hasInvalidCustomFieldCondition = conditions.some(
    (condition) => condition.field === 'customFieldNumber' && !condition.fieldId,
  );
  const updateConditionAt = (index: number, next: RuleCondition) => {
    setConditions((current) => current.map((condition, cursor) => (cursor === index ? next : condition)));
  };

  const save = async () => {
    if (!conditions.length || hasInvalidCustomFieldCondition) {
      return;
    }
    const actions: RuleAction[] = [{ type: 'setStatus', status: actionStatus }];
    if (setNow) actions.push({ type: 'setCompletedAtNow' });
    if (setNull) actions.push({ type: 'setCompletedAtNull' });
    await onSave({
      name,
      definition: {
        trigger,
        logicalOperator,
        conditions,
        actions,
      },
    });
  };

  const fieldBase = 'h-8 rounded border bg-background px-2 text-xs';

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-card p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('ruleName')}
          <input
            className={fieldBase}
            value={name}
            data-testid={`rule-name-input-${rule.id}`}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('trigger')}
          <select
            className={fieldBase}
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as RuleDefinition['trigger'])}
          >
            {triggerOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('conditionMode')}
          <select
            className={fieldBase}
            value={logicalOperator}
            onChange={(e) => setLogicalOperator(e.target.value as LogicalOperator)}
            data-testid={`rule-condition-mode-${rule.id}`}
          >
            <option value="AND">{t('conditionModeAll')}</option>
            <option value="OR">{t('conditionModeAny')}</option>
          </select>
        </label>
      </div>

      <div className="space-y-2">
        {conditions.map((condition, index) => {
          const selectedFieldKey =
            condition.field === 'customFieldNumber' ? `cf:${condition.fieldId}` : 'progressPercent';
          return (
            <div key={`${rule.id}-condition-${index}`} className="grid gap-2 md:grid-cols-5">
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('conditionField')}
                <select
                  className={fieldBase}
                  value={selectedFieldKey}
                  data-testid={`rule-condition-field-${rule.id}-${index}`}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === 'progressPercent') {
                      updateConditionAt(index, { field: 'progressPercent', op: condition.op, ...(condition.op === 'between'
                        ? {
                            min: typeof condition.min === 'number' ? condition.min : 0,
                            max: typeof condition.max === 'number' ? condition.max : 100,
                          }
                        : { value: typeof condition.value === 'number' ? condition.value : 0 }) });
                      return;
                    }
                    const [, parsedFieldId] = next.split(':');
                    const fieldId = parsedFieldId ?? numberCustomFields[0]?.id;
                    if (!fieldId) return;
                    updateConditionAt(index, {
                      field: 'customFieldNumber',
                      fieldId,
                      op: condition.op,
                      ...(condition.op === 'between'
                        ? {
                            min: typeof condition.min === 'number' ? condition.min : 0,
                            max: typeof condition.max === 'number' ? condition.max : 100,
                          }
                        : { value: typeof condition.value === 'number' ? condition.value : 0 }),
                    });
                  }}
                >
                  <option value="progressPercent">progressPercent</option>
                  {numberCustomFields.map((field) => (
                    <option key={field.id} value={`cf:${field.id}`}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('conditionOp')}
                <select
                  className={fieldBase}
                  value={condition.op}
                  data-testid={`rule-condition-op-${rule.id}-${index}`}
                  onChange={(e) => updateConditionAt(index, withOperator(condition, e.target.value as RuleCondition['op']))}
                >
                  <option value="eq">{t('opEq')}</option>
                  <option value="lt">{t('opLt')}</option>
                  <option value="lte">{t('opLte')}</option>
                  <option value="gt">{t('opGt')}</option>
                  <option value="gte">{t('opGte')}</option>
                  <option value="between">{t('opBetween')}</option>
                </select>
              </label>
              {condition.op === 'between' ? (
                <>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('min')}
                    <input
                      className={fieldBase}
                      type="number"
                      value={condition.min ?? 0}
                      onChange={(e) => updateConditionAt(index, { ...condition, min: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('max')}
                    <input
                      className={fieldBase}
                      type="number"
                      value={condition.max ?? 100}
                      onChange={(e) => updateConditionAt(index, { ...condition, max: Number(e.target.value) })}
                    />
                  </label>
                </>
              ) : (
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t('value')}
                  <input
                    className={fieldBase}
                    type="number"
                    value={condition.value ?? 0}
                    onChange={(e) => updateConditionAt(index, { ...condition, value: Number(e.target.value) })}
                  />
                </label>
              )}
              <div className="flex items-end">
                <button
                  type="button"
                  className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={conditions.length <= 1}
                  data-testid={`rule-condition-remove-${rule.id}-${index}`}
                  onClick={() =>
                    setConditions((current) => current.filter((_, cursor) => cursor !== index))
                  }
                >
                  {t('remove')}
                </button>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
          data-testid={`rule-condition-add-${rule.id}`}
          onClick={() => setConditions((current) => [...current, defaultRuleCondition()])}
        >
          {t('addCondition')}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('setStatus')}
          <select
            className={fieldBase}
            value={actionStatus}
            onChange={(e) => setActionStatus(e.target.value as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED')}
          >
            <option value="TODO">{t('statusTodo')}</option>
            <option value="IN_PROGRESS">{t('statusInProgress')}</option>
            <option value="DONE">{t('statusDone')}</option>
            <option value="BLOCKED">{t('statusBlocked')}</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={setNow} onChange={(e) => setSetNow(e.target.checked)} />
          {t('completedAtNow')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={setNull} onChange={(e) => setSetNull(e.target.checked)} />
          {t('completedAtNull')}
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
          data-testid={`rule-save-${rule.id}`}
          disabled={hasInvalidCustomFieldCondition || !conditions.length}
          onClick={() => void save()}
        >
          {t('save')}
        </button>
        <button
          type="button"
          className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

function RuleCreator({
  customFields,
  onSave,
  onCancel,
}: {
  customFields: CustomFieldDefinition[];
  onSave: (data: {
    name: string;
    templateKey: string;
    definition: RuleDefinition;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const numberCustomFields = useMemo(
    () =>
      customFields
        .filter((field) => field.type === 'NUMBER' && !field.archivedAt)
        .sort((left, right) => left.position - right.position),
    [customFields],
  );
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<RuleDefinition['trigger']>('task.progress.changed');
  const [logicalOperator, setLogicalOperator] = useState<LogicalOperator>('AND');
  const [conditions, setConditions] = useState<RuleCondition[]>([defaultRuleCondition()]);
  const [actionStatus, setActionStatus] = useState<'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'>('TODO');
  const [setNow, setSetNow] = useState(false);
  const [setNull, setSetNull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInvalidCustomFieldCondition = conditions.some(
    (condition) => condition.field === 'customFieldNumber' && !condition.fieldId,
  );

  const updateConditionAt = (index: number, next: RuleCondition) => {
    setConditions((current) => current.map((condition, cursor) => (cursor === index ? next : condition)));
  };

  const save = async () => {
    if (!name.trim()) {
      setError(t('ruleNameRequired'));
      return;
    }
    if (!conditions.length || hasInvalidCustomFieldCondition) {
      setError(t('ruleConditionsInvalid'));
      return;
    }
    setError(null);
    const actions: RuleAction[] = [{ type: 'setStatus', status: actionStatus }];
    if (setNow) actions.push({ type: 'setCompletedAtNow' });
    if (setNull) actions.push({ type: 'setCompletedAtNull' });
    try {
      await onSave({
        name: name.trim(),
        templateKey: `custom_${crypto.randomUUID()}`,
        definition: {
          trigger,
          logicalOperator,
          conditions,
          actions,
        },
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('ruleCreateFailed');
      setError(message);
    }
  };

  const fieldBase = 'h-8 rounded border bg-background px-2 text-xs';

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 font-medium">{t('createRule')}</h3>
      {error ? <div className="mb-3 text-xs text-destructive">{error}</div> : null}
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            {t('ruleName')}
            <input
              className={fieldBase}
              value={name}
              data-testid="rule-create-name-input"
              onChange={(e) => setName(e.target.value)}
              placeholder={t('ruleNamePlaceholder')}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {t('trigger')}
            <select
              className={fieldBase}
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as RuleDefinition['trigger'])}
            >
              {triggerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {t('conditionMode')}
            <select
              className={fieldBase}
              value={logicalOperator}
              onChange={(e) => setLogicalOperator(e.target.value as LogicalOperator)}
              data-testid="rule-create-condition-mode"
            >
              <option value="AND">{t('conditionModeAll')}</option>
              <option value="OR">{t('conditionModeAny')}</option>
            </select>
          </label>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const selectedFieldKey =
              condition.field === 'customFieldNumber' ? `cf:${condition.fieldId}` : 'progressPercent';
            return (
              <div key={`create-condition-${index}`} className="grid gap-2 md:grid-cols-5">
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t('conditionField')}
                  <select
                    className={fieldBase}
                    value={selectedFieldKey}
                    data-testid={`rule-create-condition-field-${index}`}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === 'progressPercent') {
                        updateConditionAt(index, {
                          field: 'progressPercent',
                          op: condition.op,
                          ...(condition.op === 'between'
                            ? {
                                min: typeof condition.min === 'number' ? condition.min : 0,
                                max: typeof condition.max === 'number' ? condition.max : 100,
                              }
                            : { value: typeof condition.value === 'number' ? condition.value : 0 }),
                        });
                        return;
                      }
                      const [, parsedFieldId] = next.split(':');
                      const fieldId = parsedFieldId ?? numberCustomFields[0]?.id;
                      if (!fieldId) return;
                      updateConditionAt(index, {
                        field: 'customFieldNumber',
                        fieldId,
                        op: condition.op,
                        ...(condition.op === 'between'
                          ? {
                              min: typeof condition.min === 'number' ? condition.min : 0,
                              max: typeof condition.max === 'number' ? condition.max : 100,
                            }
                          : { value: typeof condition.value === 'number' ? condition.value : 0 }),
                      });
                    }}
                  >
                    <option value="progressPercent">progressPercent</option>
                    {numberCustomFields.map((field) => (
                      <option key={field.id} value={`cf:${field.id}`}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t('conditionOp')}
                  <select
                    className={fieldBase}
                    value={condition.op}
                    data-testid={`rule-create-condition-op-${index}`}
                    onChange={(e) => updateConditionAt(index, withOperator(condition, e.target.value as RuleCondition['op']))}
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
                    <label className="space-y-1 text-xs text-muted-foreground">
                      {t('min')}
                      <input
                        className={fieldBase}
                        type="number"
                        value={condition.min ?? 0}
                        onChange={(e) => updateConditionAt(index, { ...condition, min: Number(e.target.value) })}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      {t('max')}
                      <input
                        className={fieldBase}
                        type="number"
                        value={condition.max ?? 100}
                        onChange={(e) => updateConditionAt(index, { ...condition, max: Number(e.target.value) })}
                      />
                    </label>
                  </>
                ) : (
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('value')}
                    <input
                      className={fieldBase}
                      type="number"
                      value={condition.value ?? 0}
                      onChange={(e) => updateConditionAt(index, { ...condition, value: Number(e.target.value) })}
                    />
                  </label>
                )}
                <div className="flex items-end">
                  <button
                    type="button"
                    className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={conditions.length <= 1}
                    data-testid={`rule-create-condition-remove-${index}`}
                    onClick={() => setConditions((current) => current.filter((_, cursor) => cursor !== index))}
                  >
                    {t('remove')}
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
            data-testid="rule-create-condition-add"
            onClick={() => setConditions((current) => [...current, defaultRuleCondition()])}
          >
            {t('addCondition')}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <label className="space-y-1 text-xs text-muted-foreground">
            {t('setStatus')}
            <select
              className={fieldBase}
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

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setNow} onChange={(e) => setSetNow(e.target.checked)} />
            {t('completedAtNow')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setNull} onChange={(e) => setSetNull(e.target.checked)} />
            {t('completedAtNull')}
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
            data-testid="rule-create-save"
            disabled={hasInvalidCustomFieldCondition || !conditions.length}
            onClick={() => void save()}
          >
            {t('create')}
          </button>
          <button
            type="button"
            className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const rulesQuery = useQuery<Rule[]>({
    queryKey: queryKeys.projectRules(projectId),
    queryFn: () => api(`/projects/${projectId}/rules`),
    enabled: Boolean(projectId),
  });
  const customFieldsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: queryKeys.projectCustomFields(projectId),
    queryFn: () => api(`/projects/${projectId}/custom-fields`),
    enabled: Boolean(projectId),
  });
  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });
  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const currentProjectRole = useMemo(() => {
    const meId = meQuery.data?.id;
    if (!meId || !membersQuery.data) return null;
    return membersQuery.data.find((member) => member.userId === meId)?.role ?? null;
  }, [meQuery.data?.id, membersQuery.data]);
  const canCreateRule = currentProjectRole ? currentProjectRole !== 'VIEWER' : false;

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      templateKey: string;
      definition: RuleDefinition;
    }) => api(`/projects/${projectId}/rules`, { method: 'POST', body }) as Promise<Rule>,
    onSuccess: (created) => {
      queryClient.setQueryData<Rule[]>(queryKeys.projectRules(projectId), (current = []) => {
        if (current.some((rule) => rule.id === created.id)) return current;
        return [...current, created].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setIsCreating(false);
    },
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/rules/${id}`, { method: 'DELETE' }) as Promise<void>,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Rule[]>(queryKeys.projectRules(projectId), (current = []) =>
        current.filter((rule) => rule.id !== id),
      );
    },
  });

  const handleDelete = async (rule: Rule) => {
    if (!confirm(t('ruleDeleteConfirm'))) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(rule.id);
    } catch (err) {
      const errorData = parseApiErrorPayload(err);
      if (errorData?.code === 'TEMPLATE_RULE_DELETION_FORBIDDEN') {
        alert(t('ruleDeleteTemplateForbidden'));
      } else {
        alert(t('ruleDeleteFailed'));
      }
    }
  };

  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const customFields = useMemo(() => customFieldsQuery.data ?? [], [customFieldsQuery.data]);

  if (!projectId) return <div>{t('loading')}</div>;

  return (
    <div className="space-y-3">
      {canCreateRule ? (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="rule-create-button"
            className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            disabled={isCreating}
            onClick={() => setIsCreating(true)}
          >
            {t('createRule')}
          </button>
        </div>
      ) : null}

      {isCreating ? (
        <RuleCreator
          customFields={customFields}
          onCancel={() => setIsCreating(false)}
          onSave={async (data) => {
            await createMutation.mutateAsync(data);
          }}
        />
      ) : null}

      {rules.map((rule) => (
        <article
          key={rule.id}
          data-testid={`rule-card-${rule.id}`}
          className="relative overflow-hidden rounded-lg border bg-muted/40 p-4"
        >
          {rule.enabled ? <div className="absolute inset-y-0 left-0 w-1 bg-primary" /> : null}
          <div className="ml-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium" data-testid={`rule-name-${rule.id}`}>{rule.name}</div>
              <div className="text-[11px] text-muted-foreground">{t('ruleTemplateInfo').replace('{{templateKey}}', rule.templateKey).replace('{{cooldownSec}}', String(rule.cooldownSec))}</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid={`rule-edit-${rule.id}`}
                className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setEditingRuleId(rule.id)}
              >
                {t('edit')}
              </button>
              <button
                type="button"
                className="h-8 rounded border bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => toggleMutation.mutate({ id: rule.id, enabled: rule.enabled })}
              >
                {rule.enabled ? t('disable') : t('enable')}
              </button>
              {canCreateRule ? (
                <button
                  type="button"
                  data-testid={`rule-delete-${rule.id}`}
                  className="h-8 rounded border bg-background px-3 text-xs text-destructive hover:text-destructive/80"
                  onClick={() => handleDelete(rule)}
                  disabled={deleteMutation.isPending}
                >
                  {t('delete')}
                </button>
              ) : null}
            </div>
          </div>

          {editingRuleId === rule.id ? (
            <div className="ml-1">
              <RuleEditor
                rule={rule}
                customFields={customFields}
                onCancel={() => setEditingRuleId(null)}
                onSave={async (patch) => {
                  await patchMutation.mutateAsync({ id: rule.id, patch });
                }}
              />
            </div>
          ) : null}
        </article>
      ))}

      {!rules.length ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">{t('noRules')}</div>
      ) : null}
    </div>
  );
}
