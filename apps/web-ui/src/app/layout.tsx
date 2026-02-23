import './globals.css';
import type { ReactNode } from 'react';
import Providers from './providers';
import AppShell from '@/components/app-shell';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
