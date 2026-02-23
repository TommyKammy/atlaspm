'use client';

import { Menu, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" data-testid="theme-toggle">
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const handleNavigate = () => {
    onNavigate?.();
  };

  return (
    <div className="flex h-full w-[240px] flex-col bg-card">
      <div className="px-3 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Projects</p>
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
            All projects
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
              >
                {project.name}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

function HeaderBar() {
  const pathname = usePathname();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const title = useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)/);
    if (!match) return 'Projects';
    return projects.find((project) => project.id === match[1])?.name ?? 'Project';
  }, [pathname, projects]);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex items-center gap-2">
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open sidebar">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">AtlasPM</p>
          <h1 className="text-sm font-medium">{title}</h1>
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ThemeToggle />
            </div>
          </TooltipTrigger>
          <TooltipContent>Theme</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </header>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[240px] border-r md:block">
        <SidebarContent />
      </aside>
      <main className="min-w-0 flex-1">
        <HeaderBar />
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
