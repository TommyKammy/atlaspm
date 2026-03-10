'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  GOAL_STATUS_OPTIONS,
  goalHistoryActionLabel,
  goalStatusBadgeClass,
  goalStatusLabel,
} from '@/components/goal-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  useArchiveGoal,
  useGoal,
  useGoalHistory,
  useGoalProjects,
  useLinkGoalProject,
  useUnlinkGoalProject,
  useUpdateGoal,
} from '@/lib/api/goals';
import { useProjects } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { GoalStatus } from '@/lib/types';

export default function GoalDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ workspaceId: string; goalId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;
  const goalId = params.goalId;
  const goalQuery = useGoal(goalId);
  const goalProjectsQuery = useGoalProjects(goalId);
  const goalHistoryQuery = useGoalHistory(goalId, { take: 20 });
  const projectsQuery = useProjects(workspaceId);
  const updateGoal = useUpdateGoal(goalId, workspaceId);
  const archiveGoal = useArchiveGoal(workspaceId);
  const linkProject = useLinkGoalProject(goalId, workspaceId);
  const unlinkProject = useUnlinkGoalProject(goalId, workspaceId);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    status: 'NOT_STARTED' as GoalStatus,
    progressPercent: '0',
  });

  const goal = goalQuery.data;
  const linkedProjectIds = useMemo(
    () => new Set((goalProjectsQuery.data ?? []).map((link) => link.projectId)),
    [goalProjectsQuery.data],
  );
  const availableProjects =
    projectsQuery.data?.filter((project) => !linkedProjectIds.has(project.id)) ?? [];

  const startEditing = () => {
    if (!goal) return;
    setDraft({
      title: goal.title,
      description: goal.description ?? '',
      status: goal.status,
      progressPercent: goal.progressPercent.toString(),
    });
    setIsEditing(true);
  };

  const saveGoal = async () => {
    await updateGoal.mutateAsync({
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      status: draft.status,
      progressPercent: Number.parseInt(draft.progressPercent || '0', 10),
    });
    setIsEditing(false);
  };

  const handleArchive = async () => {
    if (!goal) return;
    if (confirm(t('archiveGoalConfirm'))) {
      await archiveGoal.mutateAsync(goal.id);
      router.push(`/workspaces/${workspaceId}/goals`);
    }
  };

  if (goalQuery.isLoading || !goal) {
    return <div className="container mx-auto py-8 text-sm text-muted-foreground">{t('loading')}</div>;
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <Button variant="ghost" className="w-fit" onClick={() => router.push(`/workspaces/${workspaceId}/goals`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('backToGoals')}
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-3">
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-goal-title">{t('name')}</Label>
                  <Input
                    id="edit-goal-title"
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-goal-description">{t('description')}</Label>
                  <Textarea
                    id="edit-goal-description"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-goal-status">{t('status')}</Label>
                    <select
                      id="edit-goal-status"
                      className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: event.target.value as GoalStatus,
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
                    <Label htmlFor="edit-goal-progress">{t('progress')}</Label>
                    <Input
                      id="edit-goal-progress"
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
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold">{goal.title}</h1>
                  <Badge className={goalStatusBadgeClass(goal.status)}>{goalStatusLabel(goal.status, t)}</Badge>
                  {goal.archivedAt ? <Badge variant="secondary">{t('archived')}</Badge> : null}
                </div>
                {goal.description ? (
                  <CardDescription className="max-w-2xl text-sm">{goal.description}</CardDescription>
                ) : null}
              </>
            )}
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={saveGoal} disabled={updateGoal.isPending || !draft.title.trim()}>
                  {t('saveChanges')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={startEditing}>
                  {t('editGoal')}
                </Button>
                <Button variant="outline" onClick={handleArchive} disabled={archiveGoal.isPending}>
                  {t('archiveGoal')}
                </Button>
              </>
            )}
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t('linkedProjects')}</CardTitle>
              <CardDescription>{t('goalAlignmentDescription')}</CardDescription>
            </div>
            <Popover open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={availableProjects.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('linkProject')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command>
                  <CommandInput placeholder={t('searchProjects')} />
                  <CommandEmpty>{t('noProjectsAvailable')}</CommandEmpty>
                  <CommandGroup>
                    {availableProjects.map((project) => (
                      <CommandItem
                        key={project.id}
                        onSelect={() => {
                          linkProject.mutate(project.id);
                          setIsAddProjectOpen(false);
                        }}
                        disabled={linkProject.isPending}
                      >
                        {project.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent className="space-y-3">
            {(goalProjectsQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                {t('noProjectsLinked')}
              </div>
            ) : null}
            {goalProjectsQuery.data?.map((link) => (
              <div key={link.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="font-medium">{link.project.name}</p>
                  <p className="text-sm text-muted-foreground">{t('alignmentVisibleInProject')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/projects/${link.projectId}`)}
                  >
                    {t('openProject')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => unlinkProject.mutate(link.projectId)}
                    disabled={unlinkProject.isPending}
                    aria-label={t('unlinkProject')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('goalHistory')}</CardTitle>
            <CardDescription>{t('goalHistoryDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {goalHistoryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            ) : null}
            {(goalHistoryQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noGoalHistory')}</p>
            ) : null}
            {goalHistoryQuery.data?.map((entry) => (
              <div key={entry.id} className="rounded-lg border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{goalHistoryActionLabel(entry.action, t)}</p>
                  <time className="text-xs text-muted-foreground" dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge className={goalStatusBadgeClass(entry.status)}>
                    {goalStatusLabel(entry.status, t)}
                  </Badge>
                  <span className="text-muted-foreground">{entry.progressPercent}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
