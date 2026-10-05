import { cn } from '@/lib/utils';

interface ActionBarProps {
  className?: string;
  children: React.ReactNode;
}

// BR-REC-180: on a phone a form's one main action (Save) lives here, full width, fixed to the bottom edge
// (above the keyboard). From 768 px this bar is hidden and PageHeader shows the action at the right.
// AppShell pads the content bottom while a bar exists, so the last row is never hidden under it.
export default function ActionBar({ className, children }: ActionBarProps) {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        'page-px fixed inset-x-0 bottom-0 z-30 flex min-h-[var(--actionbar-h)] items-center border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-(--page-max-narrow) flex-col *:h-(--control-height) *:w-full">
        {children}
      </div>
    </div>
  );
}
