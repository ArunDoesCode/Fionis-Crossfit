import { andMore } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface ChipListProps {
  items: string[];
  /** Chips shown before "+N". Default 2 (a phone row shows "Weight  Body fat  +3"). */
  max?: number;
  className?: string;
}

// Read-only chips for a list row. Plain spans so it can sit inside a row's link or button.
// The "+N" chip is spoken as "and N more".
export default function ChipList({ items, max = 2, className }: ChipListProps) {
  const shown = items.slice(0, max);
  const hidden = items.length - shown.length;
  const chip = 'rounded-full bg-muted px-2.5 py-1 text-sm text-foreground';

  return (
    <span className={cn('flex flex-wrap gap-2', className)}>
      {shown.map((item) => (
        <span key={item} className={chip}>
          {item}
        </span>
      ))}
      {hidden > 0 && (
        <span className={chip}>
          <span aria-hidden="true">+{hidden}</span>
          <span className="sr-only">{andMore(hidden)}</span>
        </span>
      )}
    </span>
  );
}
