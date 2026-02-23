'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';
import type { ReactNode } from 'react';

function Sidebar() {
  const pathname = usePathname();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-200 bg-white/90 px-4 py-4">
      <div className="mb-5 border-b border-slate-200 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
        <p className="text-sm font-medium text-slate-800">Default Workspace</p>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</p>
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">Home</Link>
      </div>

      <nav className="space-y-1 overflow-y-auto pr-1">
        {projects.map((project) => {
          const active = pathname === `/projects/${project.id}` || pathname?.startsWith(`/projects/${project.id}/`);
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              data-testid={`sidebar-project-${project.id}`}
              className={`block rounded-md px-3 py-2 text-sm transition ${
                active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {project.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') {
    return <main className="mx-auto min-h-screen max-w-7xl p-6">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-slate-100/60">
      <Sidebar />
      <main className="min-h-screen flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
