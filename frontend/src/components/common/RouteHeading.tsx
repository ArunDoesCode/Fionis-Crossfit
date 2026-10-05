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
import { routeFor, trailFor } from '@/lib/routes';

// The parts of PageHeader that read the current path (BR-REC-179). The path is runtime data, so each
// one sits under a <Suspense> in PageHeader; the rest of the header is static and never waits for it.

export function HeadingText({ heading, subtitle }: { heading?: string; subtitle?: string }) {
  return (
    <>
      <h1 className="truncate font-heading text-xl font-semibold md:text-2xl">{heading}</h1>
      {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
}

/** Breadcrumbs from 768 px (none on a top-level screen), then the title; `title` overrides the table's. */
export function RouteHeading({ title, subtitle }: { title?: string; subtitle?: string }) {
  const pathname = usePathname();
  const route = routeFor(pathname);
  const heading = title ?? route.title;
  const crumbs = [...trailFor(pathname), { label: heading, href: '' }];

  return (
    <>
      {route.parent && (
        <Breadcrumb className="max-md:hidden">
          <BreadcrumbList className="flex-nowrap gap-1.5 text-xs sm:gap-1.5">
            {crumbs.map((crumb, i) => (
              <Fragment key={`${crumb.href}|${crumb.label}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className="min-w-0">
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href as Route} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <HeadingText heading={heading} subtitle={subtitle} />
    </>
  );
}

/** "‹ Members" under the top bar on phones: a real link, so the leave guard catches it. */
export function BackToParent() {
  const parent = routeFor(usePathname()).parent;
  if (!parent) return null;
  return (
    <Link
      href={parent.href as Route}
      className="-mt-2 flex min-h-tap items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground md:hidden"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" aria-hidden="true" />
      {parent.label}
    </Link>
  );
}
