'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink, Settings, Archive, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useI18n } from '@/lib/i18n';
import type { Form } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Badge } from '@/components/ui/badge';


export default function FormsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newFormTitle, setNewFormTitle] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');

  const formsQuery = useQuery<Form[]>({
    queryKey: queryKeys.projectForms(projectId),
    queryFn: () => api(`/projects/${projectId}/forms?includeArchived=true`),
  });

  const createForm = useMutation({
    mutationFn: (data: { title: string; description?: string }) =>
      api(`/projects/${projectId}/forms`, { method: 'POST', body: data }) as Promise<Form>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectForms(projectId) });
      setIsCreateOpen(false);
      setNewFormTitle('');
      setNewFormDescription('');
    },
  });

  const deleteForm = useMutation({
    mutationFn: (formId: string) =>
      api(`/forms/${formId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectForms(projectId) });
    },
  });

  const archiveForm = useMutation({
    mutationFn: (formId: string) =>
      api(`/forms/${formId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectForms(projectId) });
    },
  });

  const forms = formsQuery.data ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('forms')}</h1>
          <p className="text-muted-foreground">{t('formsDescription')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('createForm')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createForm')}</DialogTitle>
              <DialogDescription>{t('createFormDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('formTitle')}</Label>
                <Input
                  id="title"
                  value={newFormTitle}
                  onChange={(e) => setNewFormTitle(e.target.value)}
                  placeholder={t('formTitlePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('formDescription')}</Label>
                <Textarea
                  id="description"
                  value={newFormDescription}
                  onChange={(e) => setNewFormDescription(e.target.value)}
                  placeholder={t('formDescriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => createForm.mutate({ title: newFormTitle, description: newFormDescription })}
                disabled={!newFormTitle.trim() || createForm.isPending}
              >
                {createForm.isPending ? t('creating') : t('create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {formsQuery.isLoading ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">{t('loadingForms')}</p>
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{t('noFormsYet')}</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('createFirstForm')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id} className={form.archivedAt ? 'opacity-60' : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate">{form.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {form.description || t('noDescription')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {form.isPublic && (
                      <Badge variant="secondary">{t('public')}</Badge>
                    )}
                    {form.archivedAt && (
                      <Badge variant="secondary">{t('archived')}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{form._count?.questions ?? 0} questions</span>
                  <span>{form._count?.submissions ?? 0} submissions</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/projects/${projectId}/forms/${form.id}`)}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </Button>
                  {form.isPublic && form.publicToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(`/forms/${form.publicToken}`, '_blank')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('view')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => archiveForm.mutate(form.id)}
                    disabled={archiveForm.isPending}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteForm.mutate(form.id)}
                    disabled={deleteForm.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
