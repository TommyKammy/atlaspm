'use client';

import { Moon, Sun } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { GlobalSearch } from '@/components/global-search';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ThemePreset } from '@/lib/layout-preferences';
import type { Locale } from '@/lib/layout-preferences';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotificationCenter } from '@/components/notification-center';

type Me = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

function initialsFromUser(user?: Me) {
  const label = user?.displayName ?? user?.email ?? 'U';
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('') || 'U';
}

function ThemeToggle() {
  const { t } = useI18n();
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" data-testid="theme-toggle">
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
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
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
  const { t } = useI18n();
  const pathname = usePathname();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const title = useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)/);
    if (!match) return t('projects');
    return projects.find((project) => project.id === match[1])?.name ?? t('project');
  }, [pathname, projects, t]);

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
            {t('sidebar')}
          </Button>
        ) : null}
        {onToggleContentLayout ? (
          <Button variant="outline" size="sm" onClick={onToggleContentLayout} data-testid="content-layout-toggle">
            {contentLayout === 'centered' ? t('fullWidth') : t('centered')}
          </Button>
        ) : null}
        {onThemePresetChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="theme-preset-toggle">
                {t('preset')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onThemePresetChange('default')}>
                {t('defaultPreset')}{themePreset === 'default' ? ' ✓' : ''}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onThemePresetChange('tangerine')}>
                {t('tangerinePreset')}{themePreset === 'tangerine' ? ' ✓' : ''}
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
            <TooltipContent>{t('theme')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <NotificationCenter />
        <PersonalSettingsMenu />
      </div>
    </header>
  );
}
