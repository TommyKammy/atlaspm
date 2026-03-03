'use client';

import { Filter, Layers3, Menu, Moon, Search, Settings2, Sun, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { GlobalSearch } from '@/components/global-search';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Locale } from '@/lib/layout-preferences';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CustomFieldDefinition, Project, ProjectMember, Section, Task } from '@/lib/types';
import { parseCustomFieldFilters, stringifyCustomFieldFilters, type CustomFieldFilter } from '@/lib/project-filters';
import { useI18n } from '@/lib/i18n';
import { timelineEnabled } from '@/lib/feature-flags';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotificationCenter } from '@/components/notification-center';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Me = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

const FILTER_STATUSES: Task['status'][] = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialsFromUser(user?: Me) {
  const label = user?.displayName ?? user?.email ?? 'U';
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('') || 'U';
}

function statusLabel(status: Task['status'], t: (key: string) => string) {
  switch (status) {
    case 'TODO':
      return t('statusTodo');
    case 'IN_PROGRESS':
      return t('statusInProgress');
    case 'DONE':
      return t('statusDone');
    case 'BLOCKED':
      return t('statusBlocked');
    default:
      return status;
  }
}

function isFilterableCustomField(field: CustomFieldDefinition) {
  return field.type === 'SELECT' || field.type === 'BOOLEAN' || field.type === 'NUMBER' || field.type === 'DATE';
}

function ThemeToggle() {
  const { t } = useI18n();
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="theme-toggle"
          className="h-8 w-8 rounded-full hover:bg-muted/50"
        >
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">{t('theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>{t('light')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>{t('dark')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>{t('system')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonalSettingsMenu() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [saved, setSaved] = useState(false);

  const meQuery = useQuery<Me>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const patchMe = useMutation({
    mutationFn: (displayName: string) =>
      api(`/users/${meQuery.data?.id}`, {
        method: 'PATCH',
        body: { displayName },
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setTimeout(() => setSaved(false), 1200);
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-muted/50"
            data-testid="personal-settings-trigger"
            aria-label={t('personalSettings')}
          >
            <span className="text-[11px] font-medium">{initialsFromUser(meQuery.data)}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {meQuery.data?.displayName ?? meQuery.data?.email ?? meQuery.data?.id ?? ''}
          </div>
          <DropdownMenuItem
            onClick={() => {
              setDisplayNameDraft(meQuery.data?.displayName ?? '');
              setOpen(true);
            }}
          >
            {t('personalSettings')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLocale(locale === 'en' ? 'ja' : 'en')}
            data-testid="language-toggle-menu"
          >
            {t('language')}: {locale === 'en' ? t('english') : t('japanese')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled>{t('notifications')}</DropdownMenuItem>
          <DropdownMenuItem disabled>{t('appearance')}</DropdownMenuItem>
          <DropdownMenuItem disabled>{t('keyboardShortcuts')}</DropdownMenuItem>
          <DropdownMenuItem disabled>{t('security')}</DropdownMenuItem>
          <DropdownMenuItem disabled>{t('helpSupport')}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              localStorage.removeItem('atlaspm_token');
              router.push('/login');
            }}
          >
            {t('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('personalSettings')}</DialogTitle>
            <DialogDescription>{t('account')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('displayName')}</p>
              <Input
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                placeholder={t('displayName')}
                data-testid="personal-display-name-input"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('language')}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={locale === 'en' ? 'default' : 'outline'}
                  onClick={() => setLocale('en' as Locale)}
                  data-testid="locale-en-btn"
                >
                  {t('english')}
                </Button>
                <Button
                  size="sm"
                  variant={locale === 'ja' ? 'default' : 'outline'}
                  onClick={() => setLocale('ja' as Locale)}
                  data-testid="locale-ja-btn"
                >
                  {t('japanese')}
                </Button>
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p>{t('notifications')}</p>
              <p>{t('appearance')}</p>
              <p>{t('keyboardShortcuts')}</p>
              <p>{t('security')}</p>
              <p>{t('helpSupport')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => patchMe.mutate(displayNameDraft)}
              disabled={patchMe.isPending || !meQuery.data?.id}
              data-testid="personal-settings-save"
            >
              {patchMe.isPending ? t('saving') : saved ? t('saved') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HeaderBar({
  onToggleSidebarMode,
}: {
  onToggleSidebarMode?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const resolvedSearchParams = useMemo(() => new URLSearchParams(searchParamsString), [searchParamsString]);
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });
  const projectId = useMemo(() => pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null, [pathname]);
  const currentView = (resolvedSearchParams.get('view') ?? 'list').toLowerCase();
  const resolvedCurrentView = !timelineEnabled && currentView === 'timeline' ? 'list' : currentView;
  const query = resolvedSearchParams.get('q') ?? '';
  const statusesParam = resolvedSearchParams.get('statuses');
  const assigneesParam = resolvedSearchParams.get('assignees');
  const customFieldFiltersParam = resolvedSearchParams.get('cf');
  const selectedStatuses = useMemo(
    () =>
      parseListParam(statusesParam).filter(
        (value): value is Task['status'] => FILTER_STATUSES.includes(value as Task['status']),
      ),
    [statusesParam],
  );
  const selectedAssignees = useMemo(() => parseListParam(assigneesParam), [assigneesParam]);
  const selectedCustomFieldFilters = useMemo(
    () => parseCustomFieldFilters(customFieldFiltersParam),
    [customFieldFiltersParam],
  );
  const tabs = useMemo(
    () =>
      [
        { id: 'list', label: t('list') },
        { id: 'board', label: t('board') },
        ...(timelineEnabled ? [{ id: 'timeline', label: t('timeline') }] : []),
        { id: 'calendar', label: t('calendar') },
        { id: 'files', label: t('files') },
      ] as const,
    [t],
  );

  const sectionsQuery = useQuery<Section[]>({
    queryKey: queryKeys.projectSections(projectId ?? ''),
    queryFn: () => api(`/projects/${projectId}/sections`),
    enabled: Boolean(projectId),
  });
  const groupedTasksQuery = useQuery<{ section: Section; tasks: Task[] }[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId ?? ''),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
    enabled: Boolean(projectId),
  });
  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId ?? ''),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });
  const customFieldsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: queryKeys.projectCustomFields(projectId ?? ''),
    queryFn: () => api(`/projects/${projectId}/custom-fields`),
    enabled: Boolean(projectId),
  });

  const title = useMemo(() => {
    if (!projectId) return t('projects');
    return projects.find((project) => project.id === projectId)?.name ?? t('project');
  }, [projectId, projects, t]);

  const updateProjectQueryParams = useCallback((updates: Record<string, string | null>) => {
    if (!projectId) return;
    const params = new URLSearchParams(searchParamsString);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const nextQuery = params.toString();
    if (nextQuery === searchParamsString) return;
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, projectId, router, searchParamsString]);

  const setProjectQueryParam = useCallback(
    (key: string, value: string | null) => updateProjectQueryParams({ [key]: value }),
    [updateProjectQueryParams],
  );
  const projectFilterStorageKey = useMemo(
    () => (projectId ? `atlaspm:project-filters:${projectId}` : null),
    [projectId],
  );
  const applyProjectFilters = useCallback(
    (nextStatuses: Task['status'][], nextAssignees: string[], nextCustomFieldFilters: CustomFieldFilter[]) => {
      const serializedCustomFieldFilters = stringifyCustomFieldFilters(nextCustomFieldFilters);
      if (projectFilterStorageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(
          projectFilterStorageKey,
          JSON.stringify({
            statuses: nextStatuses,
            assignees: nextAssignees,
            customFieldFilters: nextCustomFieldFilters,
          }),
        );
      }
      updateProjectQueryParams({
        statuses: nextStatuses.length ? nextStatuses.join(',') : null,
        assignees: nextAssignees.length ? nextAssignees.join(',') : null,
        cf: serializedCustomFieldFilters,
      });
    },
    [projectFilterStorageKey, updateProjectQueryParams],
  );
  const toggleStatusFilter = useCallback(
    (status: Task['status']) => {
      const nextStatuses = selectedStatuses.includes(status)
        ? selectedStatuses.filter((item) => item !== status)
        : [...selectedStatuses, status];
      applyProjectFilters(nextStatuses, selectedAssignees, selectedCustomFieldFilters);
    },
    [applyProjectFilters, selectedAssignees, selectedCustomFieldFilters, selectedStatuses],
  );
  const toggleAssigneeFilter = useCallback(
    (assigneeUserId: string) => {
      const nextAssignees = selectedAssignees.includes(assigneeUserId)
        ? selectedAssignees.filter((item) => item !== assigneeUserId)
        : [...selectedAssignees, assigneeUserId];
      applyProjectFilters(selectedStatuses, nextAssignees, selectedCustomFieldFilters);
    },
    [applyProjectFilters, selectedAssignees, selectedCustomFieldFilters, selectedStatuses],
  );
  const upsertCustomFieldFilter = useCallback(
    (nextFilter: CustomFieldFilter) => {
      const next = [...selectedCustomFieldFilters.filter((item) => item.fieldId !== nextFilter.fieldId), nextFilter];
      applyProjectFilters(selectedStatuses, selectedAssignees, next);
    },
    [applyProjectFilters, selectedAssignees, selectedCustomFieldFilters, selectedStatuses],
  );
  const removeCustomFieldFilter = useCallback(
    (fieldId: string) => {
      const next = selectedCustomFieldFilters.filter((item) => item.fieldId !== fieldId);
      applyProjectFilters(selectedStatuses, selectedAssignees, next);
    },
    [applyProjectFilters, selectedAssignees, selectedCustomFieldFilters, selectedStatuses],
  );
  const clearAllFilters = useCallback(() => {
    applyProjectFilters([], [], []);
  }, [applyProjectFilters]);
  const filterCount = selectedStatuses.length + selectedAssignees.length + selectedCustomFieldFilters.length;
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const [projectSearchInput, setProjectSearchInput] = useState(query);
  const sectionTaskCounts = useMemo(
    () => new Map((groupedTasksQuery.data ?? []).map((group) => [group.section.id, group.tasks.length])),
    [groupedTasksQuery.data],
  );
  const navigableSections = useMemo(
    () =>
      (sectionsQuery.data ?? [])
        .filter((section) => !section.isDefault)
        .sort((left, right) => left.position - right.position),
    [sectionsQuery.data],
  );
  const filterableCustomFields = useMemo(
    () =>
      (customFieldsQuery.data ?? [])
        .filter((field) => !field.archivedAt)
        .filter((field) => isFilterableCustomField(field))
        .sort((left, right) => left.position - right.position),
    [customFieldsQuery.data],
  );
  const customFieldFilterById = useMemo(
    () => new Map(selectedCustomFieldFilters.map((filter) => [filter.fieldId, filter])),
    [selectedCustomFieldFilters],
  );

  const focusSection = useCallback(
    (sectionId: string) => {
      const emitFocus = () => {
        window.dispatchEvent(new CustomEvent('atlaspm:focus-section', { detail: { sectionId } }));
      };
      if (resolvedCurrentView !== 'list') {
        setProjectQueryParam('view', 'list');
        setTimeout(emitFocus, 220);
      } else {
        requestAnimationFrame(emitFocus);
      }
    },
    [resolvedCurrentView, setProjectQueryParam],
  );

  const openAddSectionFromHeader = useCallback(() => {
    const emitAdd = () => {
      window.dispatchEvent(new CustomEvent('atlaspm:add-section'));
    };
    if (resolvedCurrentView !== 'list') {
      setProjectQueryParam('view', 'list');
      setTimeout(emitAdd, 220);
    } else {
      requestAnimationFrame(emitAdd);
    }
  }, [resolvedCurrentView, setProjectQueryParam]);

  useEffect(() => {
    setProjectSearchInput(query);
  }, [query]);

  useEffect(() => {
    if (!projectId || !projectFilterStorageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(
      projectFilterStorageKey,
      JSON.stringify({
        statuses: selectedStatuses,
        assignees: selectedAssignees,
        customFieldFilters: selectedCustomFieldFilters,
      }),
    );
  }, [projectFilterStorageKey, projectId, selectedAssignees, selectedCustomFieldFilters, selectedStatuses]);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onToggleSidebarMode ? (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 rounded-full hover:bg-muted/50 md:inline-flex"
            onClick={onToggleSidebarMode}
            data-testid="sidebar-toggle-icon"
            aria-label={t('sidebar')}
          >
            <Menu className="h-4 w-4" />
          </Button>
        ) : null}
        <MobileNavSheet />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">AtlasPM</p>
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-sm font-medium">{title}</h1>
            {projectId ? (
              <div className="hidden items-center gap-1 md:flex" data-testid="project-header-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={tab.id === resolvedCurrentView ? 'border-b-2 border-primary px-1 py-1 text-xs font-medium' : 'px-1 py-1 text-xs text-muted-foreground'}
                    onClick={() => setProjectQueryParam('view', tab.id)}
                    data-testid={`project-view-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-3 w-full max-w-xl md:ml-auto md:max-w-md">
        {projectId ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={projectSearchInput}
              onChange={(event) => {
                const next = event.target.value;
                setProjectSearchInput(next);
                setProjectQueryParam('q', next.trim() ? next : null);
              }}
              placeholder={t('searchTasks')}
              className="h-10 rounded-full border-transparent bg-muted/25 pl-10 pr-4 shadow-none transition-colors focus-visible:border-border focus-visible:bg-background/90"
              data-testid="project-search-input"
            />
          </div>
        ) : (
          <GlobalSearch />
        )}
      </div>

      <div className="flex items-center gap-1">
        {projectId ? (
          <>
            <Popover open={sectionsOpen} onOpenChange={setSectionsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 rounded-full hover:bg-muted/50"
                  data-testid="project-sections-icon"
                  aria-label={t('sections')}
                >
                  <Layers3 className="h-4 w-4" />
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
                    {navigableSections.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0" data-testid="project-sections-popover">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-xs font-medium">{t('sections')}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    data-testid="project-sections-add"
                    onClick={() => {
                      setSectionsOpen(false);
                      openAddSectionFromHeader();
                    }}
                  >
                    {t('addSection')}
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto p-2">
                  {!navigableSections.length ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">{t('noSectionsYet')}</p>
                  ) : (
                    <div className="space-y-1">
                      {navigableSections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                          data-testid={`project-sections-jump-${section.id}`}
                          onClick={() => {
                            setSectionsOpen(false);
                            focusSection(section.id);
                          }}
                        >
                          <span className="truncate">{section.name}</span>
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {sectionTaskCounts.get(section.id) ?? 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 rounded-full hover:bg-muted/50"
                  data-testid="project-filter-trigger"
                  aria-label={t('filter')}
                >
                  <Filter className="h-4 w-4" />
                  {filterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                      {filterCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-xs font-medium">{t('filter')}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={clearAllFilters}
                    data-testid="project-filter-clear"
                  >
                    {t('clearFilters')}
                  </Button>
                </div>
                <div className="max-h-72 space-y-4 overflow-auto p-3">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('status')}</p>
                    <div className="space-y-1">
                      {FILTER_STATUSES.map((status) => {
                        const checked = selectedStatuses.includes(status);
                        return (
                          <label
                            key={status}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/30"
                            data-testid={`project-filter-status-${status}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStatusFilter(status)}
                              className="h-3.5 w-3.5 rounded border-border"
                            />
                            <span>{statusLabel(status, t)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('assignee')}</p>
                    <div className="space-y-1">
                      <label
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/30"
                        data-testid="project-filter-assignee-UNASSIGNED"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssignees.includes('UNASSIGNED')}
                          onChange={() => toggleAssigneeFilter('UNASSIGNED')}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span>{t('unassigned')}</span>
                      </label>
                      {(membersQuery.data ?? []).map((member) => {
                        const label = member.user.displayName || member.user.email || member.user.id;
                        const checked = selectedAssignees.includes(member.userId);
                        return (
                          <label
                            key={member.userId}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/30"
                            data-testid={`project-filter-assignee-${member.userId}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssigneeFilter(member.userId)}
                              className="h-3.5 w-3.5 rounded border-border"
                            />
                            <span className="truncate">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('customFields')}</p>
                    {!filterableCustomFields.length ? (
                      <p className="text-xs text-muted-foreground">{t('noFilterableCustomFields')}</p>
                    ) : (
                      <div className="space-y-3">
                        {filterableCustomFields.map((field) => {
                          const activeFilter = customFieldFilterById.get(field.id);
                          return (
                            <div
                              key={field.id}
                              className="space-y-1 rounded border border-border/60 p-2"
                              data-testid={`project-filter-custom-field-${field.id}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-medium">{field.name}</p>
                                {activeFilter ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => removeCustomFieldFilter(field.id)}
                                    data-testid={`project-filter-cf-${field.id}-clear`}
                                  >
                                    {t('clear')}
                                  </Button>
                                ) : null}
                              </div>

                              {field.type === 'SELECT' ? (
                                <div className="space-y-1">
                                  {field.options
                                    .filter((option) => !option.archivedAt)
                                    .map((option) => {
                                      const checked = Boolean(activeFilter?.optionIds?.includes(option.id));
                                      return (
                                        <label
                                          key={option.id}
                                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/30"
                                          data-testid={`project-filter-cf-${field.id}-option-${option.id}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                              const current = activeFilter?.optionIds ?? [];
                                              const nextOptionIds = checked
                                                ? current.filter((id) => id !== option.id)
                                                : [...current, option.id];
                                              if (!nextOptionIds.length) {
                                                removeCustomFieldFilter(field.id);
                                                return;
                                              }
                                              upsertCustomFieldFilter({
                                                fieldId: field.id,
                                                type: 'SELECT',
                                                optionIds: nextOptionIds,
                                              });
                                            }}
                                            className="h-3.5 w-3.5 rounded border-border"
                                          />
                                          <span className="truncate">{option.label}</span>
                                        </label>
                                      );
                                    })}
                                </div>
                              ) : null}

                              {field.type === 'BOOLEAN' ? (
                                <select
                                  className="h-8 w-full rounded border border-border/60 bg-background px-2 text-xs"
                                  value={
                                    typeof activeFilter?.booleanValue === 'boolean'
                                      ? activeFilter.booleanValue
                                        ? 'true'
                                        : 'false'
                                      : 'any'
                                  }
                                  data-testid={`project-filter-cf-${field.id}-boolean`}
                                  onChange={(event) => {
                                    const next = event.target.value;
                                    if (next === 'any') {
                                      removeCustomFieldFilter(field.id);
                                      return;
                                    }
                                    upsertCustomFieldFilter({
                                      fieldId: field.id,
                                      type: 'BOOLEAN',
                                      booleanValue: next === 'true',
                                    });
                                  }}
                                >
                                  <option value="any">{t('customFieldFilterAny')}</option>
                                  <option value="true">{t('customFieldFilterTrue')}</option>
                                  <option value="false">{t('customFieldFilterFalse')}</option>
                                </select>
                              ) : null}

                              {field.type === 'NUMBER' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    type="number"
                                    value={typeof activeFilter?.numberMin === 'number' ? String(activeFilter.numberMin) : ''}
                                    placeholder={t('customFieldFilterMin')}
                                    data-testid={`project-filter-cf-${field.id}-number-min`}
                                    className="h-8 text-xs"
                                    onChange={(event) => {
                                      const raw = event.target.value.trim();
                                      const nextMin = raw === '' ? null : Number(raw);
                                      if (raw !== '' && !Number.isFinite(nextMin)) return;
                                      const nextMax =
                                        typeof activeFilter?.numberMax === 'number' ? activeFilter.numberMax : null;
                                      if (nextMin === null && nextMax === null) {
                                        removeCustomFieldFilter(field.id);
                                        return;
                                      }
                                      upsertCustomFieldFilter({
                                        fieldId: field.id,
                                        type: 'NUMBER',
                                        numberMin: nextMin,
                                        numberMax: nextMax,
                                      });
                                    }}
                                  />
                                  <Input
                                    type="number"
                                    value={typeof activeFilter?.numberMax === 'number' ? String(activeFilter.numberMax) : ''}
                                    placeholder={t('customFieldFilterMax')}
                                    data-testid={`project-filter-cf-${field.id}-number-max`}
                                    className="h-8 text-xs"
                                    onChange={(event) => {
                                      const raw = event.target.value.trim();
                                      const nextMax = raw === '' ? null : Number(raw);
                                      if (raw !== '' && !Number.isFinite(nextMax)) return;
                                      const nextMin =
                                        typeof activeFilter?.numberMin === 'number' ? activeFilter.numberMin : null;
                                      if (nextMin === null && nextMax === null) {
                                        removeCustomFieldFilter(field.id);
                                        return;
                                      }
                                      upsertCustomFieldFilter({
                                        fieldId: field.id,
                                        type: 'NUMBER',
                                        numberMin: nextMin,
                                        numberMax: nextMax,
                                      });
                                    }}
                                  />
                                </div>
                              ) : null}

                              {field.type === 'DATE' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    type="date"
                                    value={activeFilter?.dateFrom ?? ''}
                                    placeholder={t('customFieldFilterFrom')}
                                    data-testid={`project-filter-cf-${field.id}-date-from`}
                                    className="h-8 text-xs"
                                    onChange={(event) => {
                                      const dateFrom = event.target.value || null;
                                      const dateTo = activeFilter?.dateTo ?? null;
                                      if (!dateFrom && !dateTo) {
                                        removeCustomFieldFilter(field.id);
                                        return;
                                      }
                                      upsertCustomFieldFilter({
                                        fieldId: field.id,
                                        type: 'DATE',
                                        dateFrom,
                                        dateTo,
                                      });
                                    }}
                                  />
                                  <Input
                                    type="date"
                                    value={activeFilter?.dateTo ?? ''}
                                    placeholder={t('customFieldFilterTo')}
                                    data-testid={`project-filter-cf-${field.id}-date-to`}
                                    className="h-8 text-xs"
                                    onChange={(event) => {
                                      const dateTo = event.target.value || null;
                                      const dateFrom = activeFilter?.dateFrom ?? null;
                                      if (!dateFrom && !dateTo) {
                                        removeCustomFieldFilter(field.id);
                                        return;
                                      }
                                      upsertCustomFieldFilter({
                                        fieldId: field.id,
                                        type: 'DATE',
                                        dateFrom,
                                        dateTo,
                                      });
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-muted/50"
                    data-testid="project-trash-open-icon"
                    onClick={() => setProjectQueryParam('trash', '1')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('trash')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted/50" data-testid="project-settings-menu-trigger">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${projectId}/members`} data-testid="project-members-page-link">
                    {t('members')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${projectId}/rules`} data-testid="rules-page-link">
                    {t('rules')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${projectId}/forms`} data-testid="forms-page-link">
                    {t('forms')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ThemeToggle />
              </div>
            </TooltipTrigger>
            <TooltipContent>{t('theme')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <NotificationCenter />
        <PersonalSettingsMenu />
      </div>
    </header>
  );
}
