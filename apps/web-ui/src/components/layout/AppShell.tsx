'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { HeaderBar } from '@/components/layout/HeaderBar';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  CONTENT_LAYOUT_COOKIE,
  SIDEBAR_MODE_COOKIE,
  THEME_PRESET_COOKIE,
  type ContentLayout,
  type SidebarMode,
  type ThemePreset,
} from '@/lib/layout-preferences';
import { cn } from '@/lib/utils';

type AppShellProps = {
  children: ReactNode;
  initialSidebarMode?: SidebarMode;
  initialContentLayout?: ContentLayout;
  initialThemePreset?: ThemePreset;
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function AppShell({
  children,
  initialSidebarMode = 'full',
  initialContentLayout = 'full',
  initialThemePreset = 'default',
}: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(initialSidebarMode);
  const [contentLayout, setContentLayout] = useState<ContentLayout>(initialContentLayout);
  const [themePreset, setThemePreset] = useState<ThemePreset>(initialThemePreset);

  useEffect(() => {
    document.documentElement.dataset.sidebarMode = sidebarMode;
    setCookie(SIDEBAR_MODE_COOKIE, sidebarMode);
  }, [sidebarMode]);

  useEffect(() => {
    document.documentElement.dataset.contentLayout = contentLayout;
    setCookie(CONTENT_LAYOUT_COOKIE, contentLayout);
  }, [contentLayout]);

  useEffect(() => {
    document.documentElement.dataset.themePreset = themePreset;
    setCookie(THEME_PRESET_COOKIE, themePreset);
  }, [themePreset]);

  if (isLogin) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn('hidden border-r transition-all duration-150 md:block', sidebarMode === 'icon' ? 'w-[72px]' : 'w-[240px]')}>
        <Sidebar compact={sidebarMode === 'icon'} />
      </aside>
      <main className="min-w-0 flex-1">
        <HeaderBar
          contentLayout={contentLayout}
          onToggleContentLayout={() => setContentLayout((prev) => (prev === 'full' ? 'centered' : 'full'))}
          onToggleSidebarMode={() => setSidebarMode((prev) => (prev === 'full' ? 'icon' : 'full'))}
          themePreset={themePreset}
          onThemePresetChange={setThemePreset}
        />
        <div className={cn('p-4 md:p-6', contentLayout === 'centered' ? 'mx-auto w-full max-w-6xl' : 'w-full')}>{children}</div>
      </main>
    </div>
  );
}
