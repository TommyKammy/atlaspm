import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { z } from 'zod';

const triggerSchema = z.enum(['task.progress.changed']);
const opSchema = z.enum(['eq', 'lt', 'lte', 'gt', 'gte', 'between']);
const actionTypeSchema = z.enum(['setStatus', 'setCompletedAtNow', 'setCompletedAtNull']);

const conditionNumericRangeShape = z.object({
  op: opSchema,
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

function validateNumericCondition(
  cond: { op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between'; value?: number; min?: number; max?: number },
  ctx: z.RefinementCtx,
) {
    if (cond.op === 'between') {
      if (typeof cond.min !== 'number' || typeof cond.max !== 'number') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'between requires min/max' });
      }
      return;
    }
    if (typeof cond.value !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${cond.op} requires value` });
    }
}

const progressConditionSchema = conditionNumericRangeShape
  .extend({
    field: z.literal('progressPercent'),
  })
  .superRefine(validateNumericCondition);

const customFieldNumberConditionSchema = conditionNumericRangeShape
  .extend({
    field: z.literal('customFieldNumber'),
    fieldId: z.string().uuid(),
  })
  .superRefine(validateNumericCondition);

const conditionSchema = z.union([progressConditionSchema, customFieldNumberConditionSchema]);

const actionSchema = z
  .object({
    type: actionTypeSchema,
    status: z.nativeEnum(TaskStatus).optional(),
  })
  .superRefine((action, ctx) => {
    if (action.type === 'setStatus' && !action.status) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'setStatus requires status' });
    }
  });

export const ruleDefinitionSchema = z.object({
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});

export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

export function parseRuleDefinition(input: unknown): RuleDefinition {
  const result = ruleDefinitionSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid rule definition',
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function templateDefinition(templateKey: string): RuleDefinition {
  if (templateKey === 'progress_to_done') {
    return {
      trigger: 'task.progress.changed',
      conditions: [{ field: 'progressPercent', op: 'eq', value: 100 }],
      actions: [{ type: 'setStatus', status: TaskStatus.DONE }, { type: 'setCompletedAtNow' }],
    };
  }
  return {
    trigger: 'task.progress.changed',
    conditions: [{ field: 'progressPercent', op: 'between', min: 0, max: 99 }],
    actions: [{ type: 'setStatus', status: TaskStatus.IN_PROGRESS }, { type: 'setCompletedAtNull' }],
  };
}
