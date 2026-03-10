'use client';

import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FollowerToggleProps = {
  count: number;
  isFollowed: boolean;
  isPending?: boolean;
  onToggle: () => void;
  buttonTestId: string;
  countTestId: string;
  className?: string;
  compact?: boolean;
  followLabel: string;
  followingLabel: string;
  followerLabel: string;
  followersLabel: string;
};

export function FollowerToggle({
  count,
  isFollowed,
  isPending = false,
  onToggle,
  buttonTestId,
  countTestId,
  className,
  compact = false,
  followLabel,
  followingLabel,
  followerLabel,
  followersLabel,
}: FollowerToggleProps) {
  const label = isFollowed ? followingLabel : followLabel;
  const countLabel = `${count} ${count === 1 ? followerLabel : followersLabel}`;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        size={compact ? 'sm' : 'default'}
        variant={isFollowed ? 'default' : 'outline'}
        onClick={onToggle}
        disabled={isPending}
        data-testid={buttonTestId}
        className="min-w-[104px]"
      >
        {isFollowed ? <BellOff className="mr-1.5 h-4 w-4" /> : <Bell className="mr-1.5 h-4 w-4" />}
        {label}
      </Button>
      <span className="text-sm text-muted-foreground" data-testid={countTestId}>
        {countLabel}
      </span>
    </div>
  );
}
