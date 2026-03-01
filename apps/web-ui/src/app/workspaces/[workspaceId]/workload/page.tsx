'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Calendar, Users, Briefcase, Clock, List } from 'lucide-react';
import { useTeamWorkload, useProjectWorkload } from '@/lib/api/workload';
import { useProjects } from '@/lib/api';
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
      ) : !workload || workload.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No workload data</h3>
            <p className="text-muted-foreground">
              {view === 'project' && !selectedProjectId
                ? 'Select a project to view workload'
                : 'No team members found with assigned tasks'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {workload.map((user) => (
            <UserWorkloadCard key={user.userId} workload={user} viewMode={viewMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserWorkloadCard({
  workload,
  viewMode,
}: {
  workload: import('@/lib/api/workload').UserWorkload;
  viewMode: 'tasks' | 'effort';
}) {
  const hasOverloads = workload.overloadAlerts.length > 0;

  if (viewMode === 'effort') {
    const maxMinutes = Math.max(
      ...workload.weeklyBreakdown.map((w) => w.estimateMinutes),
      CAPACITY_HOURS * 60,
    );
    const capacityMinutes = CAPACITY_HOURS * 60;

    return (
      <Card>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workload.weeklyBreakdown.map((week) => {
              const isOverloaded = week.estimateMinutes > capacityMinutes;
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
                      {isOverloaded && (
                        <Badge variant="destructive" className="text-xs">
                          +{formatMinutes(week.estimateMinutes - capacityMinutes)} over capacity
                        </Badge>
                      )}
                      <span
                        className={cn(
                          'font-medium',
                          isOverloaded ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {formatMinutes(week.estimateMinutes)} / {CAPACITY_HOURS}h
                      </span>
                    </div>
                  </div>

                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'absolute h-full transition-all duration-500',
                        isOverloaded ? 'bg-destructive' : 'bg-primary',
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-destructive/50"
                      style={{ left: `${(capacityMinutes / maxMinutes) * 100}%` }}
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
    const maxTasks = Math.max(...workload.weeklyBreakdown.map((w) => w.taskCount), CAPACITY_TASKS);

    return (
      <Card>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workload.weeklyBreakdown.map((week) => {
              const isOverloaded = week.taskCount > CAPACITY_TASKS;
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
                      {isOverloaded && (
                        <Badge variant="destructive" className="text-xs">
                          +{week.taskCount - CAPACITY_TASKS} over capacity
                        </Badge>
                      )}
                      <span
                        className={cn(
                          'font-medium',
                          isOverloaded ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {week.taskCount}/{CAPACITY_TASKS}
                      </span>
                    </div>
                  </div>

                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'absolute h-full transition-all duration-500',
                        isOverloaded ? 'bg-destructive' : 'bg-primary',
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-destructive/50"
                      style={{ left: `${(CAPACITY_TASKS / maxTasks) * 100}%` }}
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
