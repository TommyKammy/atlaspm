'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, TrendingUp, CheckCircle2, Clock, Circle } from 'lucide-react';
import {
  usePortfolio,
  useUpdatePortfolio,
  useAddProjectToPortfolio,
  useRemoveProjectFromPortfolio,
} from '@/lib/api/portfolios';
import { useProjects } from '@/lib/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function PortfolioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const portfolioId = params.portfolioId as string;

  const { data: portfolio, isLoading } = usePortfolio(workspaceId, portfolioId);
  const { data: allProjects } = useProjects(workspaceId);
  const updatePortfolio = useUpdatePortfolio(workspaceId, portfolioId);
  const addProject = useAddProjectToPortfolio(workspaceId, portfolioId);
  const removeProject = useRemoveProjectFromPortfolio(workspaceId, portfolioId);

  const [isEditing, setIsEditing] = useState(false);
  const [editedPortfolio, setEditedPortfolio] = useState({ name: '', description: '' });
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);

  if (isLoading || !portfolio) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleUpdate = async () => {
    await updatePortfolio.mutateAsync(editedPortfolio);
    setIsEditing(false);
  };

  const handleAddProject = async (projectId: string) => {
    await addProject.mutateAsync(projectId);
    setIsAddProjectOpen(false);
  };

  const handleRemoveProject = async (projectId: string) => {
    if (confirm('Remove this project from the portfolio?')) {
      await removeProject.mutateAsync(projectId);
    }
  };

  const availableProjects = allProjects?.filter(
    (project: { id: string }) => !portfolio.projects.some((p) => p.projectId === project.id),
  );

  const totalTasks = portfolio.progress?.reduce((sum, p) => sum + p.totalTasks, 0) || 0;
  const completedTasks = portfolio.progress?.reduce((sum, p) => sum + p.completedTasks, 0) || 0;
  const inProgressTasks = portfolio.progress?.reduce((sum, p) => sum + p.inProgressTasks, 0) || 0;
  const todoTasks = portfolio.progress?.reduce((sum, p) => sum + p.todoTasks, 0) || 0;

  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Portfolios
      </Button>

      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editedPortfolio.name}
                  onChange={(e) =>
                    setEditedPortfolio({ ...editedPortfolio, name: e.target.value })
                  }
                  className="max-w-md"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editedPortfolio.description}
                  onChange={(e) =>
                    setEditedPortfolio({ ...editedPortfolio, description: e.target.value })
                  }
                  className="max-w-md"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdate} disabled={updatePortfolio.isPending}>
                  Save
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold">{portfolio.name}</h1>
              {portfolio.description && (
                <p className="text-muted-foreground mt-2 max-w-2xl">{portfolio.description}</p>
              )}
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => {
                  setEditedPortfolio({
                    name: portfolio.name,
                    description: portfolio.description || '',
                  });
                  setIsEditing(true);
                }}
              >
                Edit Details
              </Button>
            </div>
          )}
        </div>

        <Popover open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen}>
          <PopoverTrigger asChild>
            <Button disabled={portfolio.projects.length >= 50}>
              <Plus className="w-4 h-4 mr-2" />
              Add Project
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search projects..." />
              <CommandEmpty>No projects available.</CommandEmpty>
              <CommandGroup>
                {availableProjects?.map((project: { id: string; name: string }) => (
                  <CommandItem
                    key={project.id}
                    onSelect={() => handleAddProject(project.id)}
                    disabled={addProject.isPending}
                  >
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inProgressTasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">To Do</CardTitle>
            <Circle className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{todoTasks}</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-semibold mb-4">Projects</h2>

      {portfolio.projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground mb-4">No projects in this portfolio yet.</p>
            <Button onClick={() => setIsAddProjectOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {portfolio.progress?.map((projectProgress) => {
            const project = portfolio.projects.find(
              (p) => p.projectId === projectProgress.projectId,
            );
            if (!project) return null;

            return (
              <Card key={project.projectId}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{projectProgress.projectName}</CardTitle>
                      <CardDescription>
                        {projectProgress.totalTasks} tasks
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveProject(project.projectId)}
                      disabled={removeProject.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex gap-2">
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {projectProgress.completedTasks} done
                        </Badge>
                        <Badge variant="default" className="bg-blue-100 text-blue-800">
                          {projectProgress.inProgressTasks} in progress
                        </Badge>
                        <Badge variant="secondary">
                          {projectProgress.todoTasks} todo
                        </Badge>
                      </div>
                      <span className="font-medium">{projectProgress.progress}%</span>
                    </div>
                    <Progress value={projectProgress.progress} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
