'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
  const handleNavigate = () => onNavigate?.();

  return (
    <div className={cn('flex h-full flex-col bg-card', compact ? 'w-[72px]' : 'w-[240px]')}>
      <div className="px-3 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {compact ? 'Nav' : 'Projects'}
        </p>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="space-y-1">
          <Link
            href="/"
            onClick={handleNavigate}
            className={cn(
              'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              pathname === '/' && 'bg-muted text-foreground',
            )}
          >
            {compact ? 'All' : 'All projects'}
          </Link>
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
          <Link
            href="/workspaces"
            onClick={handleNavigate}
            className={cn(
              'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              pathname === '/workspaces' && 'bg-muted text-foreground',
            )}
          >
            {compact ? 'P' : 'Portfolios'}
          </Link>
          <Link
            href="/workspaces"
            onClick={handleNavigate}
            className={cn(
              'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              pathname === '/workspaces' && 'bg-muted text-foreground',
            )}
          >
            {compact ? 'W' : 'Workload'}
          </Link>
          <Link
            href="/dashboards"
            onClick={handleNavigate}
            className={cn(
              'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              pathname === '/dashboards' && 'bg-muted text-foreground',
            )}
          >
            {compact ? 'D' : 'Dashboards'}
          </Link>
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
