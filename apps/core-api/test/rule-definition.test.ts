import { describe, expect, it } from 'vitest';
import { parseRuleDefinition, templateDefinition } from '../src/rules/rule-definition';

describe('rule-definition', () => {
  it('defaults logicalOperator to AND for legacy payloads', () => {
    const parsed = parseRuleDefinition({
      trigger: 'task.progress.changed',
      conditions: [{ field: 'progressPercent', op: 'eq', value: 100 }],
      actions: [{ type: 'setStatus', status: 'DONE' }],
    });
    expect(parsed.logicalOperator).toBe('AND');
  });

  it('accepts OR logicalOperator for composite conditions', () => {
    const parsed = parseRuleDefinition({
      trigger: 'task.progress.changed',
      logicalOperator: 'OR',
      conditions: [
        { field: 'progressPercent', op: 'eq', value: 100 },
        {
          field: 'customFieldNumber',
          fieldId: '00000000-0000-4000-8000-000000000001',
          op: 'gt',
          value: 80,
        },
      ],
      actions: [{ type: 'setStatus', status: 'DONE' }],
    });
    expect(parsed.logicalOperator).toBe('OR');
    expect(parsed.conditions).toHaveLength(2);
  });

  it('keeps templates backward-compatible with AND operator', () => {
    expect(templateDefinition('progress_to_done').logicalOperator).toBe('AND');
    expect(templateDefinition('progress_to_in_progress').logicalOperator).toBe('AND');
  });
});
