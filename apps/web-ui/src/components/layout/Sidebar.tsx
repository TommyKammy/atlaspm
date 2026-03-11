'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { BarChart3, CheckCircle2, FolderKanban, FolderOpen, GitBranch, Home, Inbox, Menu, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Workspace } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

type SidebarProps = {
  onNavigate?: () => void;
  compact?: boolean;
  onToggleMode?: () => void;
};

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  testId?: string;
};

function SidebarItem({
  item,
  compact,
  onNavigate,
}: {
  item: NavItem;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const linkProps = onNavigate ? { onClick: onNavigate } : {};
  const testIdProps = item.testId ? { 'data-testid': item.testId } : {};
  return (
    <Link
      href={item.href}
      {...linkProps}
      {...testIdProps}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200 ease-in-out',
        compact ? 'justify-center' : '',
      )}
      style={{
        color: item.active ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--sidebar-muted-foreground))',
      }}
      onMouseEnter={(event) => {
        if (!item.active) {
          event.currentTarget.style.backgroundColor = 'hsl(var(--sidebar-hover) / 0.5)';
        }
      }}
      onMouseLeave={(event) => {
        if (!item.active) {
          event.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      title={item.label}
    >
      <span
        className={cn(
          'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity',
          item.active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon className="h-[15px] w-[15px] shrink-0" />
      {!compact ? <span className="overflow-hidden whitespace-nowrap text-[13px]">{item.label}</span> : null}
    </Link>
  );
}

export function Sidebar({ onNavigate, compact = false, onToggleMode }: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces,
    queryFn: () => api('/workspaces'),
  });
  const isWorkspaceAdmin = workspaces.some((workspace) => workspace.role === 'WS_ADMIN');
  const activeWorkspaceId = workspaces[0]?.id;
  const handleNavigate = () => onNavigate?.();

  const topLinks = [
    { href: '/', label: t('home'), icon: Home, active: pathname === '/' },
    { href: '/my-tasks', label: t('myTasks'), icon: CheckCircle2, active: pathname === '/my-tasks' },
    { href: '/inbox', label: t('inbox'), icon: Inbox, active: pathname === '/inbox' },
  ];

  const insightLinks = [
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/workload` : '/',
      label: t('workload'),
      icon: Users,
      active: pathname.includes('/workload'),
    },
    { href: '/dashboards', label: t('dashboards'), icon: BarChart3, active: pathname === '/dashboards' },
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/goals` : '/',
      label: t('goals'),
      icon: Target,
      active: pathname.includes('/goals'),
    },
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/portfolios` : '/',
      label: t('portfolios'),
      icon: FolderKanban,
      active: pathname.includes('/portfolios'),
    },
  ];

  return (
    <div
      className={cn('flex h-full flex-col transition-all duration-200 ease-in-out', compact ? 'w-[68px]' : 'w-[228px]')}
      style={{
        backgroundColor: 'hsl(var(--sidebar-background))',
        color: 'hsl(var(--sidebar-foreground))',
      }}
    >
      <div className="px-3 py-3">
        <div className={cn('flex items-center', compact ? 'justify-center' : 'justify-between')}>
          {!compact ? (
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
              {t('workspace')}
            </p>
          ) : null}
          {onToggleMode ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[hsl(var(--sidebar-muted-foreground))] hover:bg-[hsl(var(--sidebar-hover)/0.5)] hover:text-[hsl(var(--sidebar-foreground))]"
              onClick={onToggleMode}
              aria-label={t('sidebar')}
              data-testid="sidebar-toggle-sidepanel"
            >
              <Menu className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <Separator style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="space-y-1">
          {topLinks.map((item) => {
            return (
              <SidebarItem key={item.label} item={item} compact={compact} onNavigate={handleNavigate} />
            );
          })}
        </nav>

        <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
        {!compact ? (
          <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
            {t('insights')}
          </p>
        ) : null}
        <nav className="mt-2 space-y-1">
          {insightLinks.map((item) => {
            return (
              <SidebarItem key={item.label} item={item} compact={compact} onNavigate={handleNavigate} />
            );
          })}
        </nav>

        <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
        {!compact ? (
          <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
            {t('projects')}
          </p>
        ) : null}
        <nav className="mt-2 space-y-1">
          {projects.map((project) => {
            const active = pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`);
            const item: NavItem = {
              href: `/projects/${project.id}`,
              label: project.name,
              icon: FolderOpen,
              active,
              testId: `sidebar-project-${project.id}`,
            };
            return (
              <SidebarItem key={project.id} item={item} compact={compact} onNavigate={handleNavigate} />
            );
          })}
        </nav>
        {isWorkspaceAdmin ? (
          <>
            <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
            {!compact ? (
              <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
                {t('admin')}
              </p>
            ) : null}
            <nav className="mt-2 space-y-1">
              <SidebarItem
                compact={compact}
                onNavigate={handleNavigate}
                item={{
                  href: '/admin/users',
                  label: t('users'),
                  icon: Users,
                  active: pathname === '/admin/users',
                  testId: 'sidebar-admin-users',
                }}
              />
              <SidebarItem
                compact={compact}
                onNavigate={handleNavigate}
                item={{
                  href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/integrations` : '/',
                  label: t('integrations'),
                  icon: GitBranch,
                  active: pathname.includes('/integrations'),
                  testId: 'sidebar-admin-integrations',
                }}
              />
            </nav>
          </>
        ) : null}
      </ScrollArea>
    </div>
  );
}
