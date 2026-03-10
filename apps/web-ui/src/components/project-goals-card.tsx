'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { goalStatusBadgeClass, goalStatusLabel } from '@/components/goal-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { linkGoalProject, useGoals, useProjectGoals, unlinkGoalProject } from '@/lib/api/goals';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';

export function ProjectGoalsCard({
  projectId,
  workspaceId,
  canEdit = true,
}: {
  projectId: string;
  workspaceId: string;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const goalsQuery = useGoals(workspaceId);
  const projectGoalsQuery = useProjectGoals(projectId);

  const availableGoals = useMemo(
    () =>
      (goalsQuery.data ?? []).filter(
        (goal) => !projectGoalsQuery.data?.some((linkedGoal) => linkedGoal.id === goal.id),
      ),
    [goalsQuery.data, projectGoalsQuery.data],
  );

  const refreshAlignment = async (goalId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projectGoals(projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.goal(goalId) }),
      queryClient.invalidateQueries({ queryKey: ['goal', goalId, 'history'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.goalProjects(goalId) }),
    ]);
  };

  const addAlignment = useMutation({
    mutationFn: async (goalId: string) => {
      const created = await linkGoalProject(goalId, projectId);
      await refreshAlignment(goalId);
      return created;
    },
    onSuccess: () => setIsAddOpen(false),
  });

  const removeAlignment = useMutation({
    mutationFn: async (goalId: string) => {
      await unlinkGoalProject(goalId, projectId);
      await refreshAlignment(goalId);
    },
  });

  const isLoadingAlignment =
    goalsQuery.isLoading || projectGoalsQuery.isLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{t('projectAlignment')}</CardTitle>
          <CardDescription>{t('projectAlignmentDescription')}</CardDescription>
        </div>
        {canEdit ? (
          <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={goalsQuery.isLoading || availableGoals.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                {t('addGoalAlignment')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput placeholder={t('searchGoals')} />
                <CommandEmpty>{t('noGoalsAvailable')}</CommandEmpty>
                <CommandGroup>
                  {availableGoals.map((goal) => (
                    <CommandItem
                      key={goal.id}
                      onSelect={() => addAlignment.mutate(goal.id)}
                      disabled={addAlignment.isPending}
                    >
                      {goal.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingAlignment ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
        {!isLoadingAlignment && (projectGoalsQuery.data?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <p>{t('noLinkedGoals')}</p>
            <Link className="mt-3 inline-flex text-sm font-medium text-primary" href={`/workspaces/${workspaceId}/goals`}>
              {t('manageGoals')}
            </Link>
          </div>
        ) : null}
        {projectGoalsQuery.data?.map((goal) => (
          <div key={goal.id} className="rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/workspaces/${workspaceId}/goals/${goal.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {goal.title}
                  </Link>
                  <Badge className={goalStatusBadgeClass(goal.status)}>{goalStatusLabel(goal.status, t)}</Badge>
                </div>
                {goal.description ? (
                  <p className="text-sm text-muted-foreground">{goal.description}</p>
                ) : null}
              </div>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAlignment.mutate(goal.id)}
                  disabled={removeAlignment.isPending}
                  aria-label={t('unlinkProject')}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : null}
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('goalProgress')}</span>
                <span>{goal.progressPercent}%</span>
              </div>
              <Progress value={goal.progressPercent} className="h-2" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
