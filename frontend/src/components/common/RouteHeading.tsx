'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  isResolved,
  type ResolvedRoute,
  routeFor,
  routeForPattern,
  trailFor,
  trailForPattern,
} from '@/lib/routes';

// The parts of PageHeader that show the route table (BR-REC-179). Two sources, one markup: a loading.tsx
// passes its `pattern` (known at build, so the first frame is complete), a screen reads the path at runtime
// under <Suspense>. A parent whose link needs a param shows as plain text until the path is known; its
// size does not change, so nothing moves (CLS 0).

type Crumb = { label: string; href: string };
interface Source {
  route: ResolvedRoute;
  trail: Crumb[];
}

const heading = (title: string | undefined, route: ResolvedRoute) => title ?? route.title;

function Heading({ text, subtitle }: { text?: string; subtitle?: string }) {
  return (
    <>
      <h1 className="font-heading text-xl font-semibold max-md:line-clamp-2 md:truncate md:text-2xl">
        {text}
      </h1>
      {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
}

function Crumbs({ source, title }: { source: Source; title: string }) {
  if (!source.route.parent) return null;
  const crumbs = [...source.trail, { label: title, href: '' }];
  return (
    <Breadcrumb className="max-md:hidden">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-xs sm:gap-1.5">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${crumb.href}|${crumb.label}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              ) : isResolved(crumb.href) ? (
                <BreadcrumbLink render={<Link href={crumb.href as Route} />}>
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <span>{crumb.label}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function ParentLink({ route }: { route: ResolvedRoute }) {
  const parent = route.parent;
  if (!parent) return null;
  const className =
    '-mt-2 flex min-h-tap items-center gap-1 self-start text-sm text-muted-foreground md:hidden';
  const content = (
    <>
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" aria-hidden="true" />
      {parent.label}
    </>
  );
  return isResolved(parent.href) ? (
    <Link href={parent.href as Route} className={`${className} hover:text-foreground`}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}

interface TextProps {
  /** Only for a title the route table cannot know (a name from the data). */
  title?: string;
  subtitle?: string;
}

/** Breadcrumbs from 768 px (none on a top-level screen), then the title. Reads the path at runtime. */
export function RouteHeading({ title, subtitle }: TextProps) {
  const pathname = usePathname();
  const route = routeFor(pathname);
  const text = heading(title, route);
  return (
    <>
      <Crumbs source={{ route, trail: trailFor(pathname) }} title={text} />
      <Heading text={text} subtitle={subtitle} />
    </>
  );
}

/** The same from the pattern: the Suspense fallback and every loading.tsx. */
export function PatternHeading({ pattern, title, subtitle }: TextProps & { pattern?: string }) {
  const route = pattern ? routeForPattern(pattern) : { title: '' };
  const text = heading(title, route);
  return (
    <>
      {pattern && <Crumbs source={{ route, trail: trailForPattern(pattern) }} title={text} />}
      <Heading text={text} subtitle={subtitle} />
    </>
  );
}

/** "‹ Members" under the top bar on phones: a real link, so the leave guard catches it. */
export function BackToParent() {
  return <ParentLink route={routeFor(usePathname())} />;
}

export function PatternBack({ pattern }: { pattern?: string }) {
  return pattern ? <ParentLink route={routeForPattern(pattern)} /> : null;
}
