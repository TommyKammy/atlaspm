'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { UserWorkload, WorkloadViewMode } from '@atlaspm/shared-types';
import { AlertTriangle, Calendar, Users, Briefcase, Clock, List } from 'lucide-react';
import { useTeamWorkload, useProjectWorkload } from '@/lib/api/workload';
import { useProjects } from '@/lib/api/projects';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  createAlertsByWeekMap,
  filterWeeks,
  filterWorkloads,
  getWeeklyCapacityState,
  getWorkloadStatus,
  type WorkloadStatusFilter,
} from './workload-helpers';

const CAPACITY_TASKS = 10;
const CAPACITY_HOURS = 40;

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export default function WorkloadPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [view, setView] = useState<'team' | 'project'>('team');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'tasks' | 'effort'>('tasks');
  const [periodWeeks, setPeriodWeeks] = useState<number>(4);
  const [statusFilter, setStatusFilter] = useState<WorkloadStatusFilter>('all');

  const { data: projects } = useProjects(workspaceId);
  const { data: teamWorkload, isLoading: isTeamLoading } = useTeamWorkload(workspaceId, {
    viewMode,
    periodWeeks,
  });
  const { data: projectWorkload, isLoading: isProjectLoading } = useProjectWorkload(
    workspaceId,
    selectedProjectId,
    { viewMode, periodWeeks },
  );

  const isLoading = view === 'team' ? isTeamLoading : isProjectLoading;
  const workload = view === 'team' ? teamWorkload : projectWorkload;
  const workloadStatusByUserId = new Map<string, Exclude<WorkloadStatusFilter, 'all'>>();
  let overCapacityCount = 0;
  let reducedCapacityCount = 0;
  let availableCount = 0;

  for (const user of workload ?? []) {
    const status = getWorkloadStatus(user, viewMode);
    workloadStatusByUserId.set(user.userId, status);
    if (status === 'over-capacity') {
      overCapacityCount += 1;
    } else if (status === 'reduced-capacity') {
      reducedCapacityCount += 1;
    } else {
      availableCount += 1;
    }
  }

  const filteredWorkload = workload
    ? filterWorkloads(workload, statusFilter, viewMode, workloadStatusByUserId)
    : workload;

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workload Management</h1>
          <p className="text-muted-foreground mt-1">
            Track team capacity and identify overloads
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={view} onValueChange={(v) => setView(v as 'team' | 'project')}>
            <TabsList>
              <TabsTrigger value="team" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Team View
              </TabsTrigger>
              <TabsTrigger value="project" className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Project View
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {view === 'project' && (
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project: { id: string; name: string }) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'tasks' | 'effort')}>
          <TabsList>
            <TabsTrigger value="effort" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Effort View
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Task Count
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={periodWeeks.toString()} onValueChange={(v) => setPeriodWeeks(parseInt(v))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 weeks</SelectItem>
            <SelectItem value="4">4 weeks</SelectItem>
            <SelectItem value="8">8 weeks</SelectItem>
            <SelectItem value="12">12 weeks</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as WorkloadStatusFilter)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Status filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All people ({workload?.length ?? 0})</SelectItem>
            <SelectItem value="over-capacity">Over capacity ({overCapacityCount})</SelectItem>
            <SelectItem value="reduced-capacity">Reduced capacity ({reducedCapacityCount})</SelectItem>
            <SelectItem value="available">Available ({availableCount})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20 bg-muted" />
              <CardContent className="h-48 bg-muted mt-4" />
            </Card>
          ))}
        </div>
      ) : !filteredWorkload || filteredWorkload.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {!workload || workload.length === 0 ? 'No workload data' : 'No people match this filter'}
            </h3>
            <p className="text-muted-foreground">
              {!workload || workload.length === 0
                ? view === 'project' && !selectedProjectId
                  ? 'Select a project to view workload'
                  : 'No team members found with assigned tasks'
                : 'Try a different capacity filter or period.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredWorkload.map((user) => (
            <UserWorkloadCard
              key={user.userId}
              workload={user}
              viewMode={viewMode}
              statusFilter={statusFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserWorkloadCard({
  workload,
  viewMode,
  statusFilter,
}: {
  workload: UserWorkload;
  viewMode: WorkloadViewMode;
  statusFilter: WorkloadStatusFilter;
}) {
  const alertsByWeek = createAlertsByWeekMap(workload.overloadAlerts);
  const hasOverloads = workload.overloadAlerts.length > 0;
  const workloadStatus = getWorkloadStatus(workload, viewMode, alertsByWeek);
  const visibleWeeks = filterWeeks(workload, statusFilter, viewMode, alertsByWeek);

  if (viewMode === 'effort') {
    const maxMinutes = Math.max(
      ...visibleWeeks.map((w) => Math.max(w.estimateMinutes, w.capacityMinutes)),
      CAPACITY_HOURS * 60,
    );

    return (
      <Card data-testid={`workload-card-${workload.userId}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{workload.userName}</CardTitle>
              <CardDescription>{workload.email}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold">{formatMinutes(workload.totalEstimateMinutes)}</p>
                <p className="text-sm text-muted-foreground">estimated</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{formatMinutes(workload.totalSpentMinutes)}</p>
                <p className="text-sm text-muted-foreground">spent</p>
              </div>
              {hasOverloads && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {workload.overloadAlerts.length} overloads
                </Badge>
              )}
              {workloadStatus === 'reduced-capacity' && (
                <Badge variant="secondary" className="border border-amber-500/40 bg-amber-50 text-amber-700">
                  Reduced capacity
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {visibleWeeks.map((week) => {
              const state = getWeeklyCapacityState(week, viewMode, alertsByWeek.get(week.week));
              const percentage = Math.min((week.estimateMinutes / maxMinutes) * 100, 100);

              return (
                <div key={week.week} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{week.week}</span>
                      <span className="text-muted-foreground">({week.tasks.length} tasks)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state.isReducedCapacity && !state.isOverCapacity && (
                        <Badge
                          variant="secondary"
                          className="border border-amber-500/40 bg-amber-50 text-xs text-amber-700"
                        >
                          {formatMinutes(state.capacity)} capacity
                        </Badge>
                      )}
                      {state.isOverCapacity && (
                        <Badge variant="destructive" className="text-xs">
                          +{formatMinutes(state.excess)} over capacity
                        </Badge>
                      )}
                      <span
                        className={cn(
                          'font-medium',
                          state.isOverCapacity
                            ? 'text-destructive'
                            : state.isReducedCapacity
                              ? 'text-amber-700'
                              : 'text-muted-foreground',
                        )}
                      >
                        {formatMinutes(week.estimateMinutes)} / {formatMinutes(state.capacity)}
                      </span>
                    </div>
                  </div>

                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'absolute h-full transition-all duration-500',
                        state.isOverCapacity ? 'bg-destructive' : state.isReducedCapacity ? 'bg-amber-500' : 'bg-primary',
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-destructive/50"
                      style={{ left: `${(state.capacity / maxMinutes) * 100}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Spent: {formatMinutes(week.spentMinutes)}</span>
                    <span>
                      {week.estimateMinutes > 0
                        ? Math.round((week.spentMinutes / week.estimateMinutes) * 100)
                        : 0}
                      % complete
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  } else {
    const maxTasks = Math.max(...visibleWeeks.map((w) => Math.max(w.taskCount, w.capacityTasks)), CAPACITY_TASKS);

    return (
      <Card data-testid={`workload-card-${workload.userId}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{workload.userName}</CardTitle>
              <CardDescription>{workload.email}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold">{workload.totalTasks}</p>
                <p className="text-sm text-muted-foreground">total tasks</p>
              </div>
              {hasOverloads && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {workload.overloadAlerts.length} overloads
                </Badge>
              )}
              {workloadStatus === 'reduced-capacity' && (
                <Badge variant="secondary" className="border border-amber-500/40 bg-amber-50 text-amber-700">
                  Reduced capacity
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {visibleWeeks.map((week) => {
              const state = getWeeklyCapacityState(week, viewMode, alertsByWeek.get(week.week));
              const percentage = Math.min((week.taskCount / maxTasks) * 100, 100);

              return (
                <div key={week.week} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{week.week}</span>
                      <span className="text-muted-foreground">({week.tasks.length} tasks)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state.isReducedCapacity && !state.isOverCapacity && (
                        <Badge
                          variant="secondary"
                          className="border border-amber-500/40 bg-amber-50 text-xs text-amber-700"
                        >
                          {state.capacity} task capacity
                        </Badge>
                      )}
                      {state.isOverCapacity && (
                        <Badge variant="destructive" className="text-xs">
                          +{state.excess} over capacity
                        </Badge>
                      )}
                      <span
                        className={cn(
                          'font-medium',
                          state.isOverCapacity
                            ? 'text-destructive'
                            : state.isReducedCapacity
                              ? 'text-amber-700'
                              : 'text-muted-foreground',
                        )}
                      >
                        {week.taskCount}/{state.capacity}
                      </span>
                    </div>
                  </div>

                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'absolute h-full transition-all duration-500',
                        state.isOverCapacity ? 'bg-destructive' : state.isReducedCapacity ? 'bg-amber-500' : 'bg-primary',
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-destructive/50"
                      style={{ left: `${(state.capacity / maxTasks) * 100}%` }}
                    />
                  </div>

                  {week.tasks.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {week.tasks.slice(0, 5).map((task) => (
                        <Badge
                          key={task.id}
                          variant="secondary"
                          className="text-xs truncate max-w-[200px]"
                          title={task.title}
                        >
                          {task.title}
                        </Badge>
                      ))}
                      {week.tasks.length > 5 && (
                        <Badge variant="secondary" className="text-xs">
                          +{week.tasks.length - 5} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }
}
