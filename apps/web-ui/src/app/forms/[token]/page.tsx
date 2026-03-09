'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Form, FormQuestion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function FormSubmitPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | string[]>>({});
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const formQuery = useQuery<Form & { questions: FormQuestion[] }>({
    queryKey: ['public-form', token],
    queryFn: () => api(`/forms/public/${token}`),
    retry: false,
  });

  const submitForm = useMutation({
    mutationFn: (data: {
      submitterName: string;
      submitterEmail: string;
      website: string;
      answers: Array<{ questionId: string; value: string | number | boolean | string[] }>;
    }) => api(`/forms/${formQuery.data?.id}/submit`, { method: 'POST', body: data }) as Promise<{ submissionId: string; taskId: string }>,
    onSuccess: (data) => {
      setIsSubmitted(true);
      setCreatedTaskId(data.taskId);
    },
  });

  if (formQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (formQuery.error || !formQuery.data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('formNotFound')}</CardTitle>
            <CardDescription>{t('formNotFoundDescription')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const form = formQuery.data;
  const questions = form.questions ?? [];

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>{t('submissionSuccess')}</CardTitle>
            <CardDescription>{t('submissionSuccessDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {createdTaskId && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">{t('taskCreated')}</p>
                <Link
                  href={`/projects/${form.projectId}?task=${createdTaskId}`}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 h-9 px-4 py-2 w-full"
                >
                  {t('viewTask')}
                </Link>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              {t('submitAnother')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const answersArray = questions.map((q) => ({
      questionId: q.id,
      value: answers[q.id] ?? (q.type === 'CHECKBOX' ? false : q.type === 'MULTI_SELECT' ? [] : ''),
    }));

    submitForm.mutate({
      submitterName,
      submitterEmail,
      website,
      answers: answersArray,
    });
  };

  const updateAnswer = (questionId: string, value: string | number | boolean | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{form.title}</CardTitle>
            {form.description && <CardDescription>{form.description}</CardDescription>}
          </CardHeader>
        </Card>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('yourInformation')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('name')} *</Label>
                  <Input
                    id="name"
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={submitterEmail}
                    onChange={(e) => setSubmitterEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {questions.map((question) => (
              <QuestionInput
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(value) => updateAnswer(question.id, value)}
              />
            ))}

            <Button
              type="submit"
              className="w-full"
              disabled={submitForm.isPending || !submitterName || !submitterEmail}
            >
              {submitForm.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: FormQuestion;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[]) => void;
}) {
  const { t } = useI18n();

  const renderInput = () => {
    switch (question.type) {
      case 'TEXT':
        return (
          <Input
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={question.required}
          />
        );
      case 'TEXTAREA':
        return (
          <Textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={question.required}
            rows={4}
          />
        );
      case 'NUMBER':
        return (
          <Input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
            required={question.required}
          />
        );
      case 'EMAIL':
        return (
          <Input
            type="email"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={question.required}
          />
        );
      case 'DATE':
        return (
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={question.required}
          />
        );
      case 'CHECKBOX':
        return (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={(value as boolean) ?? false}
            onChange={(e) => onChange(e.target.checked)}
          />
        );
      case 'SELECT':
        return (
          <Select
            value={(value as string) ?? ''}
            onValueChange={onChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectOption')} />
            </SelectTrigger>
            <SelectContent>
              {question.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'MULTI_SELECT': {
        const selectedValues = (value as string[]) ?? [];
        return (
          <div className="space-y-2">
            {question.options?.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={selectedValues.includes(opt.value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    if (e.target.checked) {
                      onChange([...selectedValues, opt.value]);
                    } else {
                      onChange(selectedValues.filter((v) => v !== opt.value));
                    }
                  }}
                />
                <Label className="text-sm font-normal">{opt.label}</Label>
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <Label className="text-base">
          {question.label}
          {question.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {question.description && (
          <p className="text-sm text-muted-foreground">{question.description}</p>
        )}
        {renderInput()}
      </CardContent>
    </Card>
  );
}
