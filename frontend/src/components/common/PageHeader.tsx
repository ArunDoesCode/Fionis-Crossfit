import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import ActionBar from '@/components/common/ActionBar';
import { buttonVariants } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface PageHeaderProps<T extends string> {
  title: string;
  subtitle?: string;
  /** Shows the back arrow (44 px) in front of the title. */
  backHref?: Route<T>;
  /** Small extra control that stays at the right on every width (for example "Edit"). */
  secondary?: React.ReactNode;
  /**
   * The screen's one main action (BR-REC-121): shown at the right of the header from 1024 px and in a
   * full-width bar above the tabs on phones (written once, drawn in both places).
   */
  action?: React.ReactNode;
  /** The screen is a form: the phone bar sits on the bottom edge and the tab bar steps aside. */
  form?: boolean;
  className?: string;
}

export default function PageHeader<T extends string>({
  title,
  subtitle,
  backHref,
  secondary,
  action,
  form,
  className,
}: PageHeaderProps<T>) {
  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-20 flex min-h-[var(--header-height)] items-center gap-2 bg-background pt-[env(safe-area-inset-top)]',
          className,
        )}
      >
        {backHref && (
          <Link
            href={backHref}
            aria-label={UI_TEXT.back}
            data-slot="button"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11 shrink-0')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-semibold lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {secondary}
        {action && <div className="hidden lg:block">{action}</div>}
      </header>
      {action && <ActionBar form={form}>{action}</ActionBar>}
    </>
  );
}
