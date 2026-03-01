'use client';

import { Folder, X, Star, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useTaskProjectLinks,
  useAddTaskToProject,
  useRemoveTaskFromProject,
  useSetPrimaryProject,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';


interface ProjectSelectorProps {
  taskId: string;
  workspaceId: string;
  availableProjects: Array<{ id: string; name: string; workspaceId: string }>;
}

export function ProjectSelector({ taskId, workspaceId, availableProjects }: ProjectSelectorProps) {
  const { t } = useI18n();
  const [isAdding, setIsAdding] = useState(false);
  
  const { data: links = [], isLoading } = useTaskProjectLinks(taskId);
  const addProject = useAddTaskToProject();
  const removeProject = useRemoveTaskFromProject();
  const setPrimary = useSetPrimaryProject();

  const linkedProjectIds = new Set(links.map(link => link.projectId));
  const unlinkedProjects = availableProjects.filter(
    project => project.workspaceId === workspaceId && !linkedProjectIds.has(project.id)
  );

  const handleAddProject = async (projectId: string) => {
    await addProject.mutateAsync({ taskId, projectId });
    setIsAdding(false);
  };

  const handleRemoveProject = async (projectId: string) => {
    await removeProject.mutateAsync({ taskId, projectId });
  };

  const handleSetPrimary = async (projectId: string) => {
    await setPrimary.mutateAsync({ taskId, projectId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Folder className="h-3.5 w-3.5" />
        {t('loading')}...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {links.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t('noProjects')}</span>
        ) : (
          links.map((link) => (
            <Badge
              key={link.projectId}
              variant={link.isPrimary ? 'default' : 'secondary'}
              className="flex items-center gap-1.5 px-2 py-1"
            >
              <Folder className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{link.project.name}</span>
              {link.isPrimary && (
                <Star className="h-3 w-3 fill-current" />
              )}
              <div className="ml-1 flex items-center gap-0.5">
                {!link.isPrimary && links.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 hover:bg-background/50"
                    onClick={() => handleSetPrimary(link.projectId)}
                    title={t('setAsPrimary')}
                  >
                    <Star className="h-3 w-3" />
                  </Button>
                )}
                {!link.isPrimary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 hover:bg-background/50"
                    onClick={() => handleRemoveProject(link.projectId)}
                    title={t('remove')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Badge>
          ))
        )}
        
        {unlinkedProjects.length > 0 && (
          <>
            {isAdding ? (
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-sm focus:border-border focus:outline-none"
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddProject(e.target.value);
                    e.target.value = '';
                  }
                }}
                autoFocus
              >
                <option value="">{t('selectProject')}</option>
                {unlinkedProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-3 w-3" />
                {t('addProject')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
