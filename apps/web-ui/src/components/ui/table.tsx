import * as React from 'react';
import { cn } from '@/lib/utils';

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  onContainerScroll?: React.UIEventHandler<HTMLDivElement>;
};

export function Table({
  className,
  containerClassName,
  containerRef,
  onContainerScroll,
  ...props
}: TableProps) {
  return (
    <div
      ref={containerRef}
      onScroll={onContainerScroll}
      className={cn('relative w-full overflow-auto', containerClassName)}
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-11 px-3 align-middle', className)} {...props} />;
}
