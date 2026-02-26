'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { HeaderBar } from '@/components/layout/HeaderBar';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  CONTENT_LAYOUT_COOKIE,
  SIDEBAR_MODE_COOKIE,
  type ContentLayout,
  type SidebarMode,
} from '@/lib/layout-preferences';
import { cn } from '@/lib/utils';

type AppShellProps = {
  children: ReactNode;
  initialSidebarMode?: SidebarMode;
  initialContentLayout?: ContentLayout;
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function AppShell({
  children,
  initialSidebarMode = 'icon',
  initialContentLayout = 'full',
}: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(initialSidebarMode);
  const [contentLayout] = useState<ContentLayout>(initialContentLayout);

  useEffect(() => {
    const storedMode = typeof window !== 'undefined' ? window.localStorage.getItem(SIDEBAR_MODE_COOKIE) : null;
    if (storedMode === 'full' || storedMode === 'icon') {
      setSidebarMode(storedMode);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sidebarMode = sidebarMode;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_MODE_COOKIE, sidebarMode);
    }
    setCookie(SIDEBAR_MODE_COOKIE, sidebarMode);
  }, [sidebarMode]);

  useEffect(() => {
    document.documentElement.dataset.contentLayout = contentLayout;
    setCookie(CONTENT_LAYOUT_COOKIE, contentLayout);
  }, [contentLayout]);

  if (isLogin) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  const showCompact = sidebarMode === 'icon';
  const sidebarWidthClass = showCompact ? 'w-[68px]' : 'w-[228px]';

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn('hidden border-r transition-all duration-200 ease-in-out md:block', sidebarWidthClass)}
        style={{ borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <Sidebar
          compact={showCompact}
          onToggleMode={() => setSidebarMode((prev) => (prev === 'full' ? 'icon' : 'full'))}
        />
      </aside>
      <main className="min-w-0 flex-1">
        <HeaderBar
          onToggleSidebarMode={() => setSidebarMode((prev) => (prev === 'full' ? 'icon' : 'full'))}
        />
        <div className={cn('p-4 md:p-6', contentLayout === 'centered' ? 'mx-auto w-full max-w-6xl' : 'w-full')}>{children}</div>
      </main>
    </div>
  );
}
