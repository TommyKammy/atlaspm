import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        variant === 'default' && 'text-muted-foreground',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground border-destructive',
        className,
      )}
      {...props}
    />
  );
}
