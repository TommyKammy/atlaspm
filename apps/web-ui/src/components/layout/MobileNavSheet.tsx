'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from '@/components/layout/Sidebar';

export function MobileNavSheet() {
  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open sidebar">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>
    </div>
  );
}
