'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Settings } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'user' | 'checkbox' | 'url' | 'email' | 'phone';

interface FieldOption {
  id: string;
  label: string;
  color?: string;
}

interface CustomFieldDefinition {
  id: string;
  name: string;
  fieldType: FieldType;
  options: FieldOption[] | null;
  config: Record<string, unknown>;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const fieldTypeLabels: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Single Select',
  multi_select: 'Multi Select',
  user: 'User',
  checkbox: 'Checkbox',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
};

const fieldTypeIcons: Record<FieldType, string> = {
  text: 'T',
  number: '#',
  date: '📅',
  select: '▼',
  multi_select: '☑',
  user: '👤',
  checkbox: '☐',
  url: '🔗',
  email: '@',
  phone: '📞',
};

export default function CustomFieldsDialog({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  

  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState<FieldOption[]>([]);
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const queryClient = useQueryClient();

  const definitionsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: queryKeys.customFields.definitions(projectId),
    queryFn: () => api(`/projects/${projectId}/custom-fields/definitions?includeInactive=true`),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; fieldType: FieldType; options?: FieldOption[] }) =>
      api(`/projects/${projectId}/custom-fields/definitions`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.definitions(projectId) });
      resetCreateForm();
      setShowCreateForm(false);
    },
    onError: (error: Error) => {
      console.error('Failed to create field:', error);
      alert(`Failed to create field: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomFieldDefinition> }) =>
      api(`/projects/${projectId}/custom-fields/definitions/${id}`, {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.definitions(projectId) });
      setEditingField(null);
    },
    onError: (error: Error) => {
      console.error('Failed to update field:', error);
      alert(`Failed to update field: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/projects/${projectId}/custom-fields/definitions/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields.definitions(projectId) });
    },
    onError: (error: Error) => {
      console.error('Failed to archive field:', error);
      alert(`Failed to archive field: ${error.message}`);
    },
  });

  const resetCreateForm = () => {
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldOptions([]);
    setNewOptionLabel('');
  };

  const handleCreate = () => {
    if (!newFieldName.trim()) return;
    const payload: { name: string; fieldType: FieldType; options?: FieldOption[] } = {
      name: newFieldName.trim(),
      fieldType: newFieldType,
    };
    if (['select', 'multi_select'].includes(newFieldType)) {
      payload.options = newFieldOptions;
    }
    createMutation.mutate(payload);
  };

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    const newOption: FieldOption = {
      id: crypto.randomUUID(),
      label: newOptionLabel.trim(),
    };
    setNewFieldOptions([...newFieldOptions, newOption]);
    setNewOptionLabel('');
  };

  const handleRemoveOption = (optionId: string) => {
    setNewFieldOptions(newFieldOptions.filter(o => o.id !== optionId));
  };

  const definitions = definitionsQuery.data ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Custom Fields
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Custom Fields</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Manage custom fields for this project. Fields can be used to add additional metadata to tasks.
          </Dialog.Description>

          {isAdmin && !showCreateForm && !editingField && (
            <Button 
              onClick={() => setShowCreateForm(true)} 
              className="mb-4"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          )}

          {showCreateForm && (
            <div className="mb-4 rounded-lg border bg-card p-4">
              <h4 className="mb-3 font-medium">Create New Field</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Field Name</label>
                  <Input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="e.g., Priority, Epic, Story Points"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Field Type</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <span className="mr-2">{fieldTypeIcons[newFieldType]}</span>
                        {fieldTypeLabels[newFieldType]}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      {(Object.keys(fieldTypeLabels) as FieldType[]).map((type) => (
                        <DropdownMenuItem key={type} onClick={() => setNewFieldType(type)}>
                          <span className="mr-2">{fieldTypeIcons[type]}</span>
                          {fieldTypeLabels[type]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {['select', 'multi_select'].includes(newFieldType) && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">Options</label>
                    <div className="flex gap-2">
                      <Input
                        value={newOptionLabel}
                        onChange={(e) => setNewOptionLabel(e.target.value)}
                        placeholder="Add option"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddOption();
                          }
                        }}
                      />
                      <Button onClick={handleAddOption} size="sm">Add</Button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {newFieldOptions.map((option) => (
                        <div key={option.id} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                          <span className="text-sm">{option.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveOption(option.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={handleCreate}
                    disabled={!newFieldName.trim() || createMutation.isPending}
                    size="sm"
                  >
                    Create Field
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      resetCreateForm();
                      setShowCreateForm(false);
                    }}
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {editingField && (
            <div className="mb-4 rounded-lg border bg-card p-4">
              <h4 className="mb-3 font-medium">Edit Field</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Field Name</label>
                  <Input
                    value={editingField.name}
                    onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
                  />
                </div>

                {['select', 'multi_select'].includes(editingField.fieldType) && editingField.options && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">Options</label>
                    <div className="space-y-1">
                      {editingField.options.map((option) => (
                        <div key={option.id} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                          <Input
                            value={option.label}
                            onChange={(e) => {
                              const newOptions = editingField.options!.map(o =>
                                o.id === option.id ? { ...o, label: e.target.value } : o
                              );
                              setEditingField({ ...editingField, options: newOptions });
                            }}
                            className="h-6 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const newOptions = editingField.options!.filter(o => o.id !== option.id);
                              setEditingField({ ...editingField, options: newOptions });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      const data: { name: string; options?: FieldOption[] } = { name: editingField.name };
                      if (editingField.options) data.options = editingField.options;
                      updateMutation.mutate({ id: editingField.id, data });
                    }}
                    disabled={updateMutation.isPending}
                    size="sm"
                  >
                    Save Changes
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setEditingField(null)}
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Separator className="my-4" />

          <div className="space-y-2">
            {definitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom fields yet.</p>
            ) : (
              definitions.map((field) => (
                <div
                  key={field.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${!field.isActive ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{fieldTypeIcons[field.fieldType]}</span>
                    <div>
                      <div className="font-medium">{field.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {fieldTypeLabels[field.fieldType]}
                        {!field.isActive && ' • Archived'}
                      </div>
                    </div>
                  </div>
                  
                  {isAdmin && !editingField && !showCreateForm && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingField(field)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm('Are you sure you want to archive this field?')) {
                            deleteMutation.mutate(field.id);
                          }
                        }}
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
