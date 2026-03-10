'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Target, MoreHorizontal, Pencil, Archive } from 'lucide-react';
import { goalStatusBadgeClass, goalStatusLabel, GOAL_STATUS_OPTIONS } from '@/components/goal-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useArchiveGoal, useCreateGoal, useGoals } from '@/lib/api/goals';
import { useI18n } from '@/lib/i18n';

export default function GoalsPage() {
  const { t } = useI18n();
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;
  const { data: goals, isLoading } = useGoals(workspaceId);
  const createGoal = useCreateGoal(workspaceId);
  const archiveGoal = useArchiveGoal(workspaceId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    status: 'NOT_STARTED' as const,
    progressPercent: '0',
  });

  const handleCreate = async () => {
    await createGoal.mutateAsync({
      title: draft.title.trim(),
      status: draft.status,
      progressPercent: Number.parseInt(draft.progressPercent || '0', 10),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    });
    setDraft({ title: '', description: '', status: 'NOT_STARTED', progressPercent: '0' });
    setIsCreateOpen(false);
  };

  const handleArchive = async (goalId: string) => {
    if (confirm(t('archiveGoalConfirm'))) {
      await archiveGoal.mutateAsync(goalId);
    }
  };

  if (isLoading) {
    return <div className="container mx-auto py-8 text-sm text-muted-foreground">{t('loading')}</div>;
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('goals')}</h1>
          <p className="mt-1 text-muted-foreground">{t('goalsSubtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('newGoal')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createGoal')}</DialogTitle>
              <DialogDescription>{t('createGoalDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="goal-title">{t('name')}</Label>
                <Input
                  id="goal-title"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-description">{t('description')}</Label>
                <Textarea
                  id="goal-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="goal-status">{t('status')}</Label>
                  <select
                    id="goal-status"
                    className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring focus-visible:outline-none"
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        status: event.target.value as typeof current.status,
                      }))
                    }
                  >
                    {GOAL_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {goalStatusLabel(status, t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-progress">{t('progress')}</Label>
                  <Input
                    id="goal-progress"
                    type="number"
                    min="0"
                    max="100"
                    value={draft.progressPercent}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, progressPercent: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!draft.title.trim() || createGoal.isPending}
              >
                {t('createGoal')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {(goals?.length ?? 0) === 0 ? (
        <Card className="py-14 text-center">
          <CardContent>
            <Target className="mx-auto mb-4 h-14 w-14 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t('noGoalsYet')}</h2>
            <p className="mt-2 text-muted-foreground">{t('goalsEmptyDescription')}</p>
            <Button className="mt-6" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('createFirstGoal')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals?.map((goal) => (
            <Card
              key={goal.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/workspaces/${workspaceId}/goals/${goal.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <CardTitle>{goal.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={goalStatusBadgeClass(goal.status)}>
                        {goalStatusLabel(goal.status, t)}
                      </Badge>
                      {goal.archivedAt ? <Badge variant="secondary">{t('archived')}</Badge> : null}
                    </div>
                    {goal.description ? (
                      <CardDescription>{goal.description}</CardDescription>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/workspaces/${workspaceId}/goals/${goal.id}`);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('editGoal')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleArchive(goal.id);
                        }}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        {t('archiveGoal')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('goalProgress')}</span>
                  <span>{goal.progressPercent}%</span>
                </div>
                <Progress value={goal.progressPercent} className="h-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
