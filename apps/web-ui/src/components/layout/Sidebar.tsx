'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, FolderKanban, Home, Inbox, Users } from 'lucide-react';
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
};

export function Sidebar({ onNavigate, compact = false }: SidebarProps) {
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
    { href: '/', label: t('home'), icon: Home, compact: 'H', active: pathname === '/' },
    { href: '/my-tasks', label: t('myTasks'), icon: CheckCircle2, compact: 'M', active: pathname === '/my-tasks' },
    { href: '/inbox', label: t('inbox'), icon: Inbox, compact: 'I', active: pathname === '/inbox' },
  ];

  const insightLinks = [
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/workload` : '/',
      label: t('workload'),
      icon: Users,
      compact: 'W',
      active: pathname.includes('/workload'),
    },
    { href: '/dashboards', label: t('dashboards'), icon: BarChart3, compact: 'D', active: pathname === '/dashboards' },
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/portfolios` : '/',
      label: t('portfolios'),
      icon: FolderKanban,
      compact: 'P',
      active: pathname.includes('/portfolios'),
    },
  ];

  return (
    <div
      className={cn('flex h-full flex-col', compact ? 'w-[72px]' : 'w-[240px]')}
      style={{
        backgroundColor: 'hsl(var(--sidebar-background))',
        color: 'hsl(var(--sidebar-foreground))',
      }}
    >
      <div className="px-3 py-3">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
          {compact ? t('nav') : t('workspace')}
        </p>
      </div>
      <Separator style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="space-y-1">
          {topLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={handleNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                )}
                style={{
                  color: item.active ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--sidebar-muted-foreground))',
                  backgroundColor: item.active ? 'hsl(var(--sidebar-active))' : 'transparent',
                }}
                onMouseEnter={(event) => {
                  if (!item.active) event.currentTarget.style.backgroundColor = 'hsl(var(--sidebar-hover))';
                }}
                onMouseLeave={(event) => {
                  if (!item.active) event.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={item.label}
              >
                {compact ? (
                  item.compact
                ) : (
                  <>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
        <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
          {compact ? t('insights').slice(0, 2) : t('insights')}
        </p>
        <nav className="mt-2 space-y-1">
          {insightLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={handleNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                )}
                style={{
                  color: item.active ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--sidebar-muted-foreground))',
                  backgroundColor: item.active ? 'hsl(var(--sidebar-active))' : 'transparent',
                }}
                onMouseEnter={(event) => {
                  if (!item.active) event.currentTarget.style.backgroundColor = 'hsl(var(--sidebar-hover))';
                }}
                onMouseLeave={(event) => {
                  if (!item.active) event.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={item.label}
              >
                {compact ? (
                  item.compact
                ) : (
                  <>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
        <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
          {compact ? t('projects').slice(0, 2) : t('projects')}
        </p>
        <nav className="mt-2 space-y-1">
          {projects.map((project) => {
            const active = pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                onClick={handleNavigate}
                data-testid={`sidebar-project-${project.id}`}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                )}
                style={{
                  color: active ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--sidebar-muted-foreground))',
                  backgroundColor: active ? 'hsl(var(--sidebar-active))' : 'transparent',
                }}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.backgroundColor = 'hsl(var(--sidebar-hover))';
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={project.name}
              >
                {compact ? project.name.slice(0, 2).toUpperCase() : project.name}
              </Link>
            );
          })}
        </nav>
        {isWorkspaceAdmin ? (
          <>
            <Separator className="my-3" style={{ backgroundColor: 'hsl(var(--sidebar-border))' }} />
            <p className="px-2 text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>
              {compact ? t('admin').slice(0, 1) : t('admin')}
            </p>
            <nav className="mt-2 space-y-1">
              <Link
                href="/admin/users"
                onClick={handleNavigate}
                data-testid="sidebar-admin-users"
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                )}
                style={{
                  color:
                    pathname === '/admin/users'
                      ? 'hsl(var(--sidebar-foreground))'
                      : 'hsl(var(--sidebar-muted-foreground))',
                  backgroundColor:
                    pathname === '/admin/users' ? 'hsl(var(--sidebar-active))' : 'transparent',
                }}
                onMouseEnter={(event) => {
                  if (pathname !== '/admin/users') event.currentTarget.style.backgroundColor = 'hsl(var(--sidebar-hover))';
                }}
                onMouseLeave={(event) => {
                  if (pathname !== '/admin/users') event.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Users"
              >
                {compact ? 'U' : t('users')}
              </Link>
            </nav>
          </>
        ) : null}
      </ScrollArea>
    </div>
  );
}
