'use client';

import { Moon, Sun } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { GlobalSearch } from '@/components/global-search';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ThemePreset } from '@/lib/layout-preferences';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';

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

export function HeaderBar({
  contentLayout,
  onToggleContentLayout,
  onToggleSidebarMode,
  themePreset,
  onThemePresetChange,
}: {
  contentLayout?: 'full' | 'centered';
  onToggleContentLayout?: () => void;
  onToggleSidebarMode?: () => void;
  themePreset?: ThemePreset;
  onThemePresetChange?: (value: ThemePreset) => void;
}) {
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
        <MobileNavSheet />
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">AtlasPM</p>
          <h1 className="text-sm font-medium">{title}</h1>
        </div>
      </div>
      
      <div className="flex-1 max-w-md mx-4">
        <GlobalSearch />
      </div>
      
      <div className="flex items-center gap-2">
        {onToggleSidebarMode ? (
          <Button variant="outline" size="sm" onClick={onToggleSidebarMode} data-testid="sidebar-mode-toggle">
            Sidebar
          </Button>
        ) : null}
        {onToggleContentLayout ? (
          <Button variant="outline" size="sm" onClick={onToggleContentLayout} data-testid="content-layout-toggle">
            {contentLayout === 'centered' ? 'Full width' : 'Centered'}
          </Button>
        ) : null}
        {onThemePresetChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="theme-preset-toggle">
                Preset
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onThemePresetChange('default')}>
                Default{themePreset === 'default' ? ' ✓' : ''}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onThemePresetChange('tangerine')}>
                Tangerine{themePreset === 'tangerine' ? ' ✓' : ''}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
      </div>
    </header>
  );
}
