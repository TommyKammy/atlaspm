'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, GripVertical, Trash2, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useI18n } from '@/lib/i18n';
import type { Form, FormQuestion, FormQuestionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


const QUESTION_TYPES: { value: FormQuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Text Area' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SELECT', label: 'Select' },
  { value: 'MULTI_SELECT', label: 'Multi Select' },
  { value: 'DATE', label: 'Date' },
  { value: 'CHECKBOX', label: 'Checkbox' },
];

export default function FormBuilderPage() {
  const { id: projectId, formId } = useParams<{ id: string; formId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);

  const formQuery = useQuery<Form>({
    queryKey: queryKeys.formDetail(formId),
    queryFn: () => api(`/forms/${formId}`),
  });

  const questionsQuery = useQuery<FormQuestion[]>({
    queryKey: queryKeys.formQuestions(formId),
    queryFn: () => api(`/forms/${formId}`),
  });

  const updateForm = useMutation({
    mutationFn: (data: { title?: string; description?: string; isPublic?: boolean }) =>
      api(`/forms/${formId}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formDetail(formId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectForms(projectId) });
    },
  });

  const addQuestion = useMutation({
    mutationFn: (data: {
      type: FormQuestionType;
      label: string;
      description?: string;
      required?: boolean;
      options?: Array<{ label: string; value: string }>;
    }) => api(`/forms/${formId}/questions`, { method: 'POST', body: data }) as Promise<FormQuestion>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formQuestions(formId) });
      setIsAddQuestionOpen(false);
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: (questionId: string) =>
      api(`/forms/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formQuestions(formId) });
    },
  });

  const form = formQuery.data;
  const questions = questionsQuery.data ?? [];

  if (formQuery.isLoading) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-center text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-center text-muted-foreground">{t('formNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/forms`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back')}
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{form.title}</h1>
            <p className="text-muted-foreground">{t('formBuilder')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {form.isPublic && form.publicToken && (
            <Button variant="outline" onClick={() => window.open(`/forms/${form.publicToken}`, '_blank')}>
              <Eye className="mr-2 h-4 w-4" />
              {t('preview')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('formSettings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('formTitle')}</Label>
                <Input
                  id="title"
                  defaultValue={form.title}
                  onBlur={(e) => {
                    if (e.target.value !== form.title) {
                      updateForm.mutate({ title: e.target.value });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('formDescription')}</Label>
                <Textarea
                  id="description"
                  defaultValue={form.description ?? ''}
                  rows={3}
                  onBlur={(e) => {
                    if (e.target.value !== form.description) {
                      updateForm.mutate({ description: e.target.value });
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('publicAccess')}</Label>
                  <p className="text-sm text-muted-foreground">{t('publicAccessDescription')}</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={form.isPublic}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateForm.mutate({ isPublic: e.target.checked })}
                />
              </div>
              {form.isPublic && form.publicToken && (
                <div className="space-y-2">
                  <Label>{t('publicLink')}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/forms/${form.publicToken}`}
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigator.clipboard.writeText(`${window.location.origin}/forms/${form.publicToken}`)
                      }
                    >
                      {t('copy')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('questions')}</CardTitle>
              <Dialog open={isAddQuestionOpen} onOpenChange={setIsAddQuestionOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('addQuestion')}
                  </Button>
                </DialogTrigger>
                <AddQuestionDialog
                  onAdd={(data) => addQuestion.mutate(data)}
                  isPending={addQuestion.isPending}
                />
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">{t('noQuestionsYet')}</p>
              ) : (
                questions
                  .sort((a, b) => a.position - b.position)
                  .map((question, index) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      index={index}
                      onDelete={() => deleteQuestion.mutate(question.id)}
                      isDeleting={deleteQuestion.isPending}
                    />
                  ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>{t('submissions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/projects/${projectId}/forms/${formId}/submissions`)}
              >
                {t('viewSubmissions')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddQuestionDialog({
  onAdd,
  isPending,
}: {
  onAdd: (data: {
    type: FormQuestionType;
    label: string;
    description?: string;
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }) => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<FormQuestionType>('TEXT');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState('');

  const needsOptions = type === 'SELECT' || type === 'MULTI_SELECT';

  const handleSubmit = () => {
    const data: Parameters<typeof onAdd>[0] = {
      type,
      label,
      required,
      ...(description ? { description } : {}),
    };

    if (needsOptions && options) {
      data.options = options.split('\n').map((opt) => {
        const trimmed = opt.trim();
        return { label: trimmed, value: trimmed.toLowerCase().replace(/\s+/g, '-') };
      });
    }

    onAdd(data);
    setLabel('');
    setDescription('');
    setRequired(false);
    setOptions('');
    setType('TEXT');
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('addQuestion')}</DialogTitle>
        <DialogDescription>{t('addQuestionDescription')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>{t('questionType')}</Label>
          <Select value={type} onValueChange={(v) => setType(v as FormQuestionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((qt) => (
                <SelectItem key={qt.value} value={qt.value}>
                  {qt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="label">{t('questionLabel')}</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('questionLabelPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{t('questionDescription')}</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('questionDescriptionPlaceholder')}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>{t('required')}</Label>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={required}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRequired(e.target.checked)}
          />
        </div>
        {needsOptions && (
          <div className="space-y-2">
            <Label htmlFor="options">{t('options')}</Label>
            <Textarea
              id="options"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={t('optionsPlaceholder')}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{t('optionsHelp')}</p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={!label.trim() || isPending}>
          {isPending ? t('adding') : t('add')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function QuestionCard({
  question,
  index,
  onDelete,
  isDeleting,
}: {
  question: FormQuestion;
  index: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-2 mt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <span className="text-sm text-muted-foreground">{index + 1}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{question.label}</p>
              {question.required && (
                <span className="text-destructive">*</span>
              )}
            </div>
            {question.description && (
              <p className="text-sm text-muted-foreground">{question.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {QUESTION_TYPES.find((qt) => qt.value === question.type)?.label}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
