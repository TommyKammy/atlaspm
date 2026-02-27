import { BadRequestException } from '@nestjs/common';
import { CustomFieldType } from '@prisma/client';
import { z } from 'zod';

const MAX_FIELD_NAME_LENGTH = 80;
const MAX_FIELD_DESCRIPTION_LENGTH = 500;
const MAX_OPTION_COUNT = 100;
const MAX_OPTION_LABEL_LENGTH = 80;
const MAX_OPTION_VALUE_LENGTH = 80;
const MAX_TEXT_VALUE_LENGTH = 4000;
const MAX_ABS_NUMBER_VALUE = 1_000_000_000_000;

const optionSchema = z.object({
  label: z.string().trim().min(1).max(MAX_OPTION_LABEL_LENGTH),
  value: z.string().trim().min(1).max(MAX_OPTION_VALUE_LENGTH),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
});

const definitionSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_FIELD_NAME_LENGTH),
    type: z.nativeEnum(CustomFieldType),
    description: z.string().trim().max(MAX_FIELD_DESCRIPTION_LENGTH).optional(),
    required: z.boolean().optional(),
    position: z.number().int().min(0).max(1_000_000).optional(),
    options: z.array(optionSchema).min(1).max(MAX_OPTION_COUNT).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.type === CustomFieldType.SELECT && (!input.options || input.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SELECT field requires at least one option',
        path: ['options'],
      });
    }

    if (input.type !== CustomFieldType.SELECT && input.options && input.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Options are only allowed for SELECT fields',
        path: ['options'],
      });
    }

    if (!input.options) return;
    const seen = new Set<string>();
    for (const option of input.options) {
      const key = option.value.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate option value: ${option.value}`,
          path: ['options'],
        });
        return;
      }
      seen.add(key);
    }
  });

const definitionOptionRefSchema = z.object({
  id: z.string().uuid(),
  value: z.string().trim().min(1).max(MAX_OPTION_VALUE_LENGTH),
  archivedAt: z.date().nullable().optional(),
});

const definitionRefSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(CustomFieldType),
  archivedAt: z.date().nullable().optional(),
  options: z.array(definitionOptionRefSchema).optional(),
});

const textValueSchema = z.string().trim().max(MAX_TEXT_VALUE_LENGTH);

const numberValueSchema = z
  .number()
  .finite()
  .refine((value) => Math.abs(value) <= MAX_ABS_NUMBER_VALUE, 'Number value is out of allowed range');

const dateValueSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date must be an ISO-8601 string');

export type CustomFieldDefinitionInput = z.infer<typeof definitionSchema>;
export type CustomFieldDefinitionRef = z.infer<typeof definitionRefSchema>;

export type ParsedCustomFieldValue =
  | { type: 'TEXT'; valueText: string }
  | { type: 'NUMBER'; valueNumber: number }
  | { type: 'DATE'; valueDate: Date }
  | { type: 'BOOLEAN'; valueBoolean: boolean }
  | { type: 'SELECT'; optionId: string; valueText: string };

export function parseCustomFieldDefinition(input: unknown): CustomFieldDefinitionInput {
  const result = definitionSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid custom field definition',
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function parseCustomFieldDefinitionRef(input: unknown): CustomFieldDefinitionRef {
  const result = definitionRefSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid custom field reference',
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function parseCustomFieldValue(
  definitionInput: unknown,
  rawValue: unknown,
): ParsedCustomFieldValue | null {
  const definition = parseCustomFieldDefinitionRef(definitionInput);
  if (definition.archivedAt) {
    throw new BadRequestException({
      message: 'Custom field is archived',
      fieldId: definition.id,
    });
  }

  if (rawValue === null || typeof rawValue === 'undefined') {
    return null;
  }

  switch (definition.type) {
    case CustomFieldType.TEXT: {
      const parsed = textValueSchema.safeParse(rawValue);
      if (!parsed.success) {
        throw new BadRequestException({
          message: 'Invalid custom field value',
          fieldId: definition.id,
          expectedType: definition.type,
          issues: parsed.error.issues,
        });
      }
      return { type: CustomFieldType.TEXT, valueText: parsed.data };
    }
    case CustomFieldType.NUMBER: {
      const parsed = numberValueSchema.safeParse(rawValue);
      if (!parsed.success) {
        throw new BadRequestException({
          message: 'Invalid custom field value',
          fieldId: definition.id,
          expectedType: definition.type,
          issues: parsed.error.issues,
        });
      }
      return { type: CustomFieldType.NUMBER, valueNumber: parsed.data };
    }
    case CustomFieldType.DATE: {
      const parsed = dateValueSchema.safeParse(rawValue);
      if (!parsed.success) {
        throw new BadRequestException({
          message: 'Invalid custom field value',
          fieldId: definition.id,
          expectedType: definition.type,
          issues: parsed.error.issues,
        });
      }
      return { type: CustomFieldType.DATE, valueDate: new Date(parsed.data) };
    }
    case CustomFieldType.BOOLEAN: {
      if (typeof rawValue !== 'boolean') {
        throw new BadRequestException({
          message: 'Invalid custom field value',
          fieldId: definition.id,
          expectedType: definition.type,
        });
      }
      return { type: CustomFieldType.BOOLEAN, valueBoolean: rawValue };
    }
    case CustomFieldType.SELECT: {
      const optionId =
        typeof rawValue === 'string'
          ? rawValue
          : typeof rawValue === 'object' &&
              rawValue !== null &&
              'optionId' in rawValue &&
              typeof (rawValue as Record<string, unknown>).optionId === 'string'
            ? ((rawValue as Record<string, unknown>).optionId as string)
            : null;

      if (!optionId) {
        throw new BadRequestException({
          message: 'Invalid custom field value',
          fieldId: definition.id,
          expectedType: definition.type,
        });
      }

      const option = definition.options?.find((candidate) => candidate.id === optionId);
      if (!option || option.archivedAt) {
        throw new BadRequestException({
          message: 'Unknown or archived select option',
          fieldId: definition.id,
          optionId,
        });
      }

      return {
        type: CustomFieldType.SELECT,
        optionId: option.id,
        valueText: option.value,
      };
    }
    default:
      throw new BadRequestException({
        message: 'Unsupported custom field type',
        fieldId: definition.id,
      });
  }
}
