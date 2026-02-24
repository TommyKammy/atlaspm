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

type SidebarProps = {
  onNavigate?: () => void;
  compact?: boolean;
};

export function Sidebar({ onNavigate, compact = false }: SidebarProps) {
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
    { href: '/', label: 'Home', icon: Home, compact: 'H', active: pathname === '/' && !pathname.includes('view=') },
    { href: '/?view=my-tasks', label: 'My tasks', icon: CheckCircle2, compact: 'M', active: pathname === '/' && pathname.includes('view=my-tasks') },
    { href: '/?view=inbox', label: 'Inbox', icon: Inbox, compact: 'I', active: pathname === '/' && pathname.includes('view=inbox') },
  ];

  const insightLinks = [
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/workload` : '/',
      label: 'Workload',
      icon: Users,
      compact: 'W',
      active: pathname.includes('/workload'),
    },
    { href: '/dashboards', label: 'Dashboards', icon: BarChart3, compact: 'D', active: pathname === '/dashboards' },
    {
      href: activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/portfolios` : '/',
      label: 'Portfolios',
      icon: FolderKanban,
      compact: 'P',
      active: pathname.includes('/portfolios'),
    },
  ];

  return (
    <div className={cn('flex h-full flex-col bg-card', compact ? 'w-[72px]' : 'w-[240px]')}>
      <div className="px-3 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{compact ? 'Nav' : 'Workspace'}</p>
      </div>
      <Separator />
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
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  item.active && 'bg-muted text-foreground',
                )}
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

        <Separator className="my-3" />
        <p className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground">{compact ? 'In' : 'Insights'}</p>
        <nav className="mt-2 space-y-1">
          {insightLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={handleNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  item.active && 'bg-muted text-foreground',
                )}
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

        <Separator className="my-3" />
        <p className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground">{compact ? 'Pr' : 'Projects'}</p>
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
                  'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  active && 'bg-muted text-foreground',
                )}
                title={project.name}
              >
                {compact ? project.name.slice(0, 2).toUpperCase() : project.name}
              </Link>
            );
          })}
        </nav>
        {isWorkspaceAdmin ? (
          <>
            <Separator className="my-3" />
            <p className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground">{compact ? 'A' : 'Admin'}</p>
            <nav className="mt-2 space-y-1">
              <Link
                href="/admin/users"
                onClick={handleNavigate}
                data-testid="sidebar-admin-users"
                className={cn(
                  'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  pathname === '/admin/users' && 'bg-muted text-foreground',
                )}
                title="Users"
              >
                {compact ? 'U' : 'Users'}
              </Link>
            </nav>
          </>
        ) : null}
      </ScrollArea>
    </div>
  );
}
