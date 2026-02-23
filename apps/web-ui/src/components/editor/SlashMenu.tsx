'use client';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';

export type SlashItem = {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
};

export default function SlashMenu({
  open,
  items,
}: {
  open: boolean;
  items: SlashItem[];
}) {
  if (!open || !items.length) return null;

  return (
    <div className="absolute left-2 top-14 z-30 w-72 rounded-md border bg-popover shadow-md" data-testid="slash-menu">
      <Command>
        <CommandList>
          <CommandGroup>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                onSelect={() => item.action()}
                data-testid={`slash-item-${item.id}`}
                className="flex items-center justify-between"
              >
                <span>{item.label}</span>
                {item.hint ? <span className="text-[11px] text-muted-foreground">{item.hint}</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
