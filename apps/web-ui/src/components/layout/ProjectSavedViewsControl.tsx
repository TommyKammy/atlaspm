'use client';

import { Bookmark, Pencil, Star, Trash2 } from 'lucide-react';
import { type ProjectViewMode } from '@atlaspm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PROJECT_SAVED_VIEW_PARAM,
  buildListLikeProjectViewQueryUpdates,
  buildListLikeProjectViewState,
  dispatchProjectViewStateApply,
  getSavedViewDisplayName,
  hasProjectViewState,
  readTimelineProjectViewState,
  resolveListLikeProjectViewState,
  writeTimelineProjectViewState,
} from '@/lib/project-saved-views';
import { queryKeys } from '@/lib/query-keys';
import type { CustomFieldFilter } from '@/lib/project-filters';
import type { ProjectSavedView, ProjectSavedViewsResponse, Task } from '@/lib/types';

type SupportedProjectViewMode = Extract<ProjectViewMode, 'list' | 'board' | 'timeline' | 'gantt'>;

function isSupportedMode(mode: string): mode is SupportedProjectViewMode {
  return mode === 'list' || mode === 'board' || mode === 'timeline' || mode === 'gantt';
}

export function ProjectSavedViewsControl({
  projectId,
  currentView,
  searchParamsString,
  selectedStatuses,
  selectedAssignees,
  selectedCustomFieldFilters,
  updateProjectQueryParams,
}: {
  projectId: string;
  currentView: string;
  searchParamsString: string;
  selectedStatuses: Task['status'][];
  selectedAssignees: string[];
  selectedCustomFieldFilters: CustomFieldFilter[];
  updateProjectQueryParams: (updates: Record<string, string | null>) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const mode = isSupportedMode(currentView) ? currentView : null;
  const selectedViewId = useMemo(
    () => new URLSearchParams(searchParamsString).get(PROJECT_SAVED_VIEW_PARAM),
    [searchParamsString],
  );
  const listLikeWorkingState = useMemo(
    () =>
      mode === 'list' || mode === 'board'
        ? buildListLikeProjectViewState({
            mode,
            statuses: selectedStatuses,
            assignees: selectedAssignees,
            customFieldFilters: selectedCustomFieldFilters,
          })
        : null,
    [mode, selectedAssignees, selectedCustomFieldFilters, selectedStatuses],
  );

  const savedViewsQuery = useQuery<ProjectSavedViewsResponse>({
    queryKey: queryKeys.projectSavedViews(projectId),
    queryFn: () => api(`/projects/${projectId}/saved-views`) as Promise<ProjectSavedViewsResponse>,
    enabled: Boolean(projectId) && Boolean(mode),
  });

  const visibleViews = useMemo(() => {
    if (!mode) return [];
    return (savedViewsQuery.data?.views ?? []).filter((view) => view.mode === mode);
  }, [mode, savedViewsQuery.data?.views]);
  const activeNamedView = useMemo(
    () => visibleViews.find((view) => view.id === selectedViewId) ?? null,
    [selectedViewId, visibleViews],
  );

  useEffect(() => {
    if (!mode || (mode !== 'list' && mode !== 'board') || !savedViewsQuery.data || !listLikeWorkingState) return;

    const resolved = resolveListLikeProjectViewState({
      mode,
      savedViews: savedViewsQuery.data,
      selectedViewId,
      workingState: listLikeWorkingState,
    });
    const nextViewId = resolved.source.namedViewId;
    const nextFilters = buildListLikeProjectViewQueryUpdates(resolved.state);
    const currentFilters = buildListLikeProjectViewQueryUpdates(listLikeWorkingState);

    if (
      currentFilters.statuses === nextFilters.statuses &&
      currentFilters.assignees === nextFilters.assignees &&
      currentFilters.cf === nextFilters.cf &&
      selectedViewId === nextViewId
    ) {
      return;
    }

    updateProjectQueryParams({
      ...nextFilters,
      [PROJECT_SAVED_VIEW_PARAM]: nextViewId,
    });
  }, [listLikeWorkingState, mode, savedViewsQuery.data, selectedViewId, updateProjectQueryParams]);

  if (!projectId || !mode) return null;

  const getCurrentState = () => {
    if (mode === 'list' || mode === 'board') {
      return listLikeWorkingState ?? buildListLikeProjectViewState({
        mode,
        statuses: [],
        assignees: [],
        customFieldFilters: [],
      });
    }

    return readTimelineProjectViewState(projectId, mode) ?? null;
  };

  const currentState = getCurrentState();
  const currentStateIsSavable = currentState ? hasProjectViewState(mode, currentState) : false;

  const invalidateSavedViews = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projectSavedViews(projectId) });
  };

  const saveViewMutation = useMutation({
    mutationFn: async () => {
      if (!currentState) {
        throw new Error('Current view state is unavailable');
      }
      return api(`/projects/${projectId}/saved-views`, {
        method: 'POST',
        body: {
          name: nameDraft.trim(),
          mode,
          state: currentState,
        },
      }) as Promise<ProjectSavedView>;
    },
    onSuccess: async (created) => {
      setNameDraft('');
      queryClient.setQueryData<ProjectSavedViewsResponse | undefined>(
        queryKeys.projectSavedViews(projectId),
        (current) =>
          current
            ? {
                ...current,
                views: [...current.views.filter((view) => view.id !== created.id), created],
              }
            : {
                projectId,
                userId: created.userId,
                defaultsByMode: {
                  list: null,
                  board: null,
                  timeline: null,
                  gantt: null,
                },
                views: [created],
              },
      );
      updateProjectQueryParams({ [PROJECT_SAVED_VIEW_PARAM]: created.id });
      await invalidateSavedViews();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!currentState) {
        throw new Error('Current view state is unavailable');
      }
      return api(`/projects/${projectId}/saved-views/defaults/${mode}`, {
        method: 'PUT',
        body: { state: currentState },
      }) as Promise<ProjectSavedViewsResponse>;
    },
    onSuccess: invalidateSavedViews,
  });

  const renameViewMutation = useMutation({
    mutationFn: async ({ viewId, name }: { viewId: string; name: string }) => {
      return api(`/saved-views/${viewId}`, {
        method: 'PATCH',
        body: { name },
      }) as Promise<ProjectSavedView>;
    },
    onSuccess: async () => {
      setEditingViewId(null);
      setRenameDraft('');
      await invalidateSavedViews();
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      return api(`/saved-views/${viewId}`, {
        method: 'DELETE',
      }) as Promise<{ ok: true }>;
    },
    onSuccess: async (_result, viewId) => {
      if (selectedViewId === viewId) {
        updateProjectQueryParams({ [PROJECT_SAVED_VIEW_PARAM]: null });
      }
      await invalidateSavedViews();
    },
  });

  const applyView = (view: ProjectSavedView) => {
    if (mode === 'list' || mode === 'board') {
      updateProjectQueryParams({
        ...buildListLikeProjectViewQueryUpdates(view.state),
        [PROJECT_SAVED_VIEW_PARAM]: view.id,
      });
    } else {
      updateProjectQueryParams({ [PROJECT_SAVED_VIEW_PARAM]: view.id });
      const applied = writeTimelineProjectViewState(projectId, mode, view.state);
      dispatchProjectViewStateApply(mode, applied);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-full hover:bg-muted/50"
          data-testid="saved-view-trigger"
          aria-label={t('savedViews')}
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium">{t('savedViews')}</p>
          <p className="text-xs text-muted-foreground" data-testid="saved-view-active-name">
            {getSavedViewDisplayName(activeNamedView) || t('savedViewNoneActive')}
          </p>
        </div>

        <div className="space-y-3 p-3">
          <div className="space-y-2">
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder={t('savedViewName')}
              data-testid="saved-view-name-input"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => saveViewMutation.mutate()}
                disabled={!currentStateIsSavable || !nameDraft.trim() || saveViewMutation.isPending}
                data-testid="saved-view-save"
              >
                {saveViewMutation.isPending ? t('saving') : t('saveView')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setDefaultMutation.mutate()}
                disabled={!currentStateIsSavable || setDefaultMutation.isPending}
                data-testid="saved-view-set-default"
              >
                <Star className="mr-1 h-3.5 w-3.5" />
                {setDefaultMutation.isPending ? t('saving') : t('savedViewSetDefault')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {!visibleViews.length ? (
              <p className="text-xs text-muted-foreground">{t('noSavedViewsYet')}</p>
            ) : (
              visibleViews.map((view) =>
                editingViewId === view.id ? (
                  <div key={view.id} className="space-y-2 rounded-md border p-2">
                    <Input
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      data-testid={`saved-view-rename-input-${view.id}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => renameViewMutation.mutate({ viewId: view.id, name: renameDraft.trim() })}
                        disabled={!renameDraft.trim() || renameViewMutation.isPending}
                        data-testid={`saved-view-rename-save-${view.id}`}
                      >
                        {renameViewMutation.isPending ? t('saving') : t('save')}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingViewId(null)}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={view.id} className="flex items-center gap-2 rounded-md border p-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left text-sm"
                      onClick={() => applyView(view)}
                      data-testid={`saved-view-apply-${view.name}`}
                    >
                      <span className="block truncate font-medium">{view.name}</span>
                      {activeNamedView?.id === view.id ? (
                        <span className="block text-xs text-muted-foreground">{t('savedViewActive')}</span>
                      ) : null}
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingViewId(view.id);
                        setRenameDraft(view.name);
                      }}
                      data-testid={`saved-view-rename-${view.id}`}
                      aria-label={t('rename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => deleteViewMutation.mutate(view.id)}
                      data-testid={`saved-view-delete-${view.id}`}
                      aria-label={t('delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ),
              )
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
