import { Suspense } from 'react';
import ActionBar from '@/components/common/ActionBar';
import MenuButton from '@/components/common/MenuButton';
import {
  BackToParent,
  PatternBack,
  PatternHeading,
  RouteHeading,
} from '@/components/common/RouteHeading';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /**
   * A loading.tsx passes its route pattern (`/admin/members/[memberId]`) so the title, crumbs and back link are in
   * the first frame; a screen leaves it off and the same entry is found from the path.
   */
  pattern?: string;
  /** Only for a title the route table cannot know (a name from the data); otherwise it comes from `routeFor`. */
  title?: string;
  subtitle?: string;
  /** Small extra control that stays at the right on every width (for example "Edit"). */
  secondary?: React.ReactNode;
  /**
   * The screen's one main action (BR-REC-180): at the right of the header on desktop and in the top bar on
   * phones; on a form (`form`) the phone shows it in a bottom bar instead (written once, drawn in both places).
   */
  action?: React.ReactNode;
  /** The screen is a form: on phones the action sits in the bottom bar. */
  form?: boolean;
  className?: string;
}

// BR-REC-179, 180: the title, breadcrumbs (from 768 px) and "‹ Parent" (phones) all come from the route
// table (`RouteHeading`), so a loading.tsx and its screen agree. The header stays visible while the content
// scrolls; below 768 px it is the top bar with ☰ "Open menu". From 768 px the sidebar toggle sits at the left of
// the header, outside the sidebar (BR-REC-227, shadcn's own placement in the SidebarInset header).
export default function PageHeader({
  pattern,
  title,
  subtitle,
  secondary,
  action,
  form,
  className,
}: PageHeaderProps) {
  return (
    <>
      <header
        className={cn(
          'sticky top-[var(--offline-h,0px)] z-20 flex min-h-header items-center gap-2 bg-background pt-[env(safe-area-inset-top)] md:-mx-4 md:-mt-4 md:px-4 md:pt-4',
          className,
        )}
      >
        <SidebarTrigger className="-ml-2 size-11 shrink-0 max-md:hidden" />
        <MenuButton className="-ml-2 md:hidden" />
        <div className="min-w-0 flex-1">
          <Suspense
            fallback={<PatternHeading pattern={pattern} title={title} subtitle={subtitle} />}
          >
            <RouteHeading title={title} subtitle={subtitle} />
          </Suspense>
        </div>
        {secondary}
        {action && (
          <div
            className={
              form ? 'shrink-0 whitespace-nowrap max-md:hidden' : 'shrink-0 whitespace-nowrap'
            }
          >
            {action}
          </div>
        )}
      </header>
      <Suspense fallback={<PatternBack pattern={pattern} />}>
        <BackToParent />
      </Suspense>
      {/* BR-REC-180, 234: on a phone a form's one main action (Save) is a full-width bar fixed to the bottom edge
          (above the keyboard), drawn after the page content so Tab reaches it after the fields; the admin
          layout pads the content while a bar exists. Hidden from 768 px. */}
      {form && action && <ActionBar>{action}</ActionBar>}
    </>
  );
}
