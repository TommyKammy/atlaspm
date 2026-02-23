'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FieldType } from './custom-fields-dialog';

interface CustomFieldValue {
  fieldDefinitionId: string;
  fieldName: string;
  fieldType: FieldType;
  value: unknown;
}

interface CustomFieldDefinition {
  id: string;
  name: string;
  fieldType: FieldType;
  options: Array<{ id: string; label: string; color?: string }> | null;
}

interface CustomFieldsEditorProps {
  projectId: string;
  taskId: string;
  members: Array<{ userId: string; user: { id: string; displayName?: string | null; email?: string | null } }>;
}

export default function CustomFieldsEditor({ projectId, taskId, members }: CustomFieldsEditorProps) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);

  const queryClient = useQueryClient();

  const definitionsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: queryKeys.customFields.definitions(projectId),
    queryFn: () => api(`/projects/${projectId}/custom-fields/definitions`),
  });

  const valuesQuery = useQuery<CustomFieldValue[]>({
    queryKey: queryKeys.customFields.values(taskId),
    queryFn: () => api(`/projects/${projectId}/custom-fields/values/${taskId}`),
  });

  const setFieldValue = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: unknown }) =>
      api(`/projects/${projectId}/custom-fields/values/${taskId}/${fieldId}`, {
        method: 'POST',
        body: { value },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.values(taskId) });
      setEditingFieldId(null);
    },
  });

  const deleteFieldValue = useMutation({
    mutationFn: (fieldId: string) =>
      api(`/projects/${projectId}/custom-fields/values/${taskId}/${fieldId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.values(taskId) });
    },
  });

  const definitions = definitionsQuery.data ?? [];
  const values = valuesQuery.data ?? [];
  const valuesMap = new Map(values.map((v) => [v.fieldDefinitionId, v]));

  const getFieldValue = (fieldId: string): unknown => {
    const value = valuesMap.get(fieldId)?.value;
    return value;
  };

  const renderFieldValue = (field: CustomFieldDefinition): React.ReactNode => {
    const value = getFieldValue(field.id);

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    switch (field.fieldType) {
      case 'checkbox':
        return value ? '✓ Yes' : '✗ No';
      case 'user':
        const user = members.find((m) => m.userId === (value as string));
        return user?.user.displayName ?? user?.user.email ?? (value as string);
      case 'select':
        const option = field.options?.find((o) => o.id === value);
        return option?.label ?? (value as string);
      case 'multi_select':
        const selectedIds = value as string[];
        const selectedOptions = field.options?.filter((o) => selectedIds.includes(o.id));
        return (
          <div className="flex flex-wrap gap-1">
            {selectedOptions?.map((opt) => (
              <span key={opt.id} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {opt.label}
              </span>
            ))}
          </div>
        );
      case 'url':
        return (
          <a
            href={value as string}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {value as string}
          </a>
        );
      case 'email':
        return (
          <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
            {value as string}
          </a>
        );
      case 'phone':
        return (
          <a href={`tel:${value}`} className="text-blue-600 hover:underline">
            {value as string}
          </a>
        );
      default:
        return String(value);
    }
  };

  const renderFieldEditor = (field: CustomFieldDefinition): React.ReactNode => {
    const value = editingFieldId === field.id ? editValue : getFieldValue(field.id);

    switch (field.fieldType) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return (
          <Input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={`Enter ${field.name.toLowerCase()}`}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => setEditValue(e.target.valueAsNumber)}
            placeholder="Enter number"
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );
      case 'checkbox':
        return (
          <Button
            variant={value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditValue(!value)}
          >
            {value ? '✓ Checked' : '☐ Unchecked'}
          </Button>
        );
      case 'select':
        const selectedOption = field.options?.find((o) => o.id === value);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                {selectedOption?.label ?? 'Select...'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setEditValue(null)}>—</DropdownMenuItem>
              {field.options?.map((option) => (
                <DropdownMenuItem key={option.id} onClick={() => setEditValue(option.id)}>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      case 'multi_select':
        const selectedIds = (value as string[]) ?? [];
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {field.options?.map((option) => {
                const isSelected = selectedIds.includes(option.id);
                return (
                  <Button
                    key={option.id}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const newIds = isSelected
                        ? selectedIds.filter((id) => id !== option.id)
                        : [...selectedIds, option.id];
                      setEditValue(newIds);
                    }}
                  >
                    {isSelected && '✓ '}{option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      case 'user':
        const selectedUser = members.find((m) => m.userId === (value as string));
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                {selectedUser?.user.displayName ?? selectedUser?.user.email ?? 'Select user...'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setEditValue(null)}>—</DropdownMenuItem>
              {members.map((member) => (
                <DropdownMenuItem key={member.userId} onClick={() => setEditValue(member.userId)}>
                  {member.user.displayName ?? member.user.email ?? member.userId}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return <Input value={String(value ?? '')} onChange={(e) => setEditValue(e.target.value)} />;
    }
  };

  if (definitions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border bg-card p-3">
      <h4 className="mb-3 text-sm font-medium">Custom Fields</h4>
      <div className="space-y-3">
        {definitions.map((field) => (
          <div key={field.id} className="flex items-start justify-between gap-2">
            <div className="min-w-[120px] text-sm font-medium">{field.name}</div>
            <div className="flex-1">
              {editingFieldId === field.id ? (
                <div className="space-y-2">
                  {renderFieldEditor(field)}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        setFieldValue.mutate({
                          fieldId: field.id,
                          value: editValue,
                        })
                      }
                      disabled={setFieldValue.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingFieldId(null);
                        setEditValue(null);
                      }}
                    >
                      Cancel
                    </Button>
                    {getFieldValue(field.id) !== null && getFieldValue(field.id) !== undefined && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          deleteFieldValue.mutate(field.id);
                          setEditingFieldId(null);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer rounded px-2 py-1 hover:bg-muted"
                  onClick={() => {
                    setEditingFieldId(field.id);
                    setEditValue(getFieldValue(field.id));
                  }}
                >
                  <div className="text-sm">{renderFieldValue(field)}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
