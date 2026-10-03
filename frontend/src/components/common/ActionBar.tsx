import { cn } from '@/lib/utils';

interface ActionBarProps {
  /**
   * The screen is a form: the bottom tab bar is hidden and the bar sits on the bottom edge
   * (BR-REC-120). Leave off for a normal screen: the bar then sits above the tabs.
   */
  form?: boolean;
  className?: string;
  children: React.ReactNode;
}

// BR-REC-121: a screen has one main action. On phones it lives here, full width and 48 px tall, fixed
// above the tab bar; from 1024 px this bar is hidden and PageHeader shows the action at the right.
// AppShell pads the page bottom while a bar exists, so the last content row is never hidden under it.
export default function ActionBar({ form = false, className, children }: ActionBarProps) {
  return (
    <div
      data-slot="action-bar"
      data-hide-tabs={form ? '' : undefined}
      className={cn(
        'page-px fixed inset-x-0 z-30 flex h-[var(--actionbar-h)] items-center border-t bg-background lg:hidden',
        'bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col *:h-12 *:w-full">{children}</div>
    </div>
  );
}
