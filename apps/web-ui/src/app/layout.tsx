import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import Providers from './providers';
import AppShell from '@/components/layout/AppShell';
import {
  CONTENT_LAYOUT_COOKIE,
  SIDEBAR_MODE_COOKIE,
  THEME_PRESET_COOKIE,
  parseContentLayout,
  parseSidebarMode,
  parseThemePreset,
} from '@/lib/layout-preferences';

const inter = Inter({
  subsets: ['latin'],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialSidebarMode = parseSidebarMode(cookieStore.get(SIDEBAR_MODE_COOKIE)?.value);
  const initialContentLayout = parseContentLayout(cookieStore.get(CONTENT_LAYOUT_COOKIE)?.value);
  const initialThemePreset = parseThemePreset(cookieStore.get(THEME_PRESET_COOKIE)?.value);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-sidebar-mode={initialSidebarMode}
      data-content-layout={initialContentLayout}
      data-theme-preset={initialThemePreset}
    >
      <body className={inter.className}>
        <Providers>
          <AppShell
            initialSidebarMode={initialSidebarMode}
            initialContentLayout={initialContentLayout}
            initialThemePreset={initialThemePreset}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
