import { BadRequestException } from '@nestjs/common';
import { CustomFieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  parseCustomFieldDefinition,
  parseCustomFieldValue,
} from '../src/custom-fields/custom-field.validation';

describe('custom field validation', () => {
  it('accepts valid select field definition', () => {
    const parsed = parseCustomFieldDefinition({
      name: 'Priority',
      type: CustomFieldType.SELECT,
      options: [
        { label: 'High', value: 'high', color: '#ff0000' },
        { label: 'Low', value: 'low', color: '#00ff00' },
      ],
    });

    expect(parsed.type).toBe(CustomFieldType.SELECT);
    expect(parsed.options?.length).toBe(2);
  });

  it('rejects select field definition without options', () => {
    expect(() =>
      parseCustomFieldDefinition({
        name: 'Priority',
        type: CustomFieldType.SELECT,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate select options', () => {
    expect(() =>
      parseCustomFieldDefinition({
        name: 'Priority',
        type: CustomFieldType.SELECT,
        options: [
          { label: 'High', value: 'HIGH' },
          { label: 'High duplicate', value: 'high' },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('parses typed values and allows clearing via null', () => {
    const dateField = {
      id: '6f4da5e3-7543-4e76-af87-a3d2f7683cbf',
      type: CustomFieldType.DATE,
      archivedAt: null,
    };

    const textField = {
      id: 'fe7fd058-73ed-464f-b570-e03a41f96689',
      type: CustomFieldType.TEXT,
      archivedAt: null,
    };

    const dateValue = parseCustomFieldValue(dateField, '2026-03-01T00:00:00.000Z');
    expect(dateValue?.type).toBe(CustomFieldType.DATE);
    expect((dateValue as { valueDate: Date }).valueDate.toISOString()).toContain('2026-03-01');

    const textValue = parseCustomFieldValue(textField, 'backend validated text');
    expect(textValue).toEqual({
      type: CustomFieldType.TEXT,
      valueText: 'backend validated text',
    });

    expect(parseCustomFieldValue(textField, null)).toBeNull();
  });

  it('rejects invalid number value', () => {
    const numberField = {
      id: 'be2a1385-cfdf-4477-9f06-d9d87f99af81',
      type: CustomFieldType.NUMBER,
      archivedAt: null,
    };

    expect(() => parseCustomFieldValue(numberField, '12')).toThrow(BadRequestException);
  });

  it('accepts select value by option id and rejects unknown option', () => {
    const selectField = {
      id: 'f389d7a2-f45f-4e03-84f2-f31896874d3f',
      type: CustomFieldType.SELECT,
      archivedAt: null,
      options: [
        { id: 'b3eb7cb4-d2fd-42d0-8f07-875f26a7e5f8', value: 'in-progress', archivedAt: null },
      ],
    };

    expect(parseCustomFieldValue(selectField, 'b3eb7cb4-d2fd-42d0-8f07-875f26a7e5f8')).toEqual({
      type: CustomFieldType.SELECT,
      optionId: 'b3eb7cb4-d2fd-42d0-8f07-875f26a7e5f8',
      valueText: 'in-progress',
    });

    expect(() => parseCustomFieldValue(selectField, 'ddf8a7b2-4afa-445a-8dfa-a7f5bb867db3')).toThrow(
      BadRequestException,
    );
  });
});
