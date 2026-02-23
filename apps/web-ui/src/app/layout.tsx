import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import Providers from './providers';
import AppShell from '@/components/layout/AppShell';

const inter = Inter({
  subsets: ['latin'],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
