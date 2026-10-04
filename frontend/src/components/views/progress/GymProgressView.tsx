'use client';

import { type ReadonlyURLSearchParams, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { CardSkeleton } from '@/components/common/Skeletons';
import ActivePlans from '@/components/pages/progress/ActivePlans';
import Leaderboard from '@/components/pages/progress/Leaderboard';
import ProgressFilterBar from '@/components/pages/progress/ProgressFilterBar';
import ProgressResults from '@/components/pages/progress/ProgressResults';
import { FiltersSkeleton } from '@/components/pages/progress/ProgressSkeleton';
import { useProgressStats } from '@/lib/api/progress/queries';
import { useAssessmentTypes } from '@/lib/api/setup/queries';
import {
  type ProgressFilters,
  parseProgressFilters,
  pickDefaultMetricId,
  progressFiltersSearch,
  toProgressQuery,
} from '@/lib/progress/filters';
import { PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.progress;

// A repeated key keeps all its entries; `parseProgressFilters` takes the first.
function paramsRecord(params: ReadonlyURLSearchParams): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const key of new Set(params.keys())) record[key] = params.getAll(key);
  return record;
}

// P11: the address is the state. A filter change replaces the address with the History API (Next keeps
// `useSearchParams` in step), so there is no page request and Back leaves the screen.
function writeFilters(filters: ProgressFilters) {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${progressFiltersSearch(filters)}`,
  );
}

// S13 Gym progress (`/admin/reports?metric=&joinedFrom=&joinedTo=&plan=&sex=&age=`), 1080 px wide on desktop:
// filters in one row, results and leaderboard side by side. No main action. With `metric` in the address the
// four reads (E09 catalog, E36, E37, E38) start together; without it E09 and E38 start first and the others
// follow once the default measurement is known (P11), which is then written to the address so the view can
// be bookmarked. Every part has its own loading and error state (BR-REC-131) and reads again on every open.
export default function GymProgressView() {
  const searchParams = useSearchParams();
  const filters = parseProgressFilters(paramsRecord(searchParams));
  const catalog = useAssessmentTypes(true);

  const defaultMetricId = catalog.data ? pickDefaultMetricId(catalog.data) : null;
  const metricId = filters.metricId ?? defaultMetricId;
  const stats = useProgressStats(metricId ? toProgressQuery(metricId, filters) : null);
  const chosen = catalog.data?.flatMap((type) => type.metrics).find((m) => m.id === metricId);
  const metric = chosen ?? stats.data?.metric;

  useEffect(() => {
    if (filters.metricId === undefined && defaultMetricId !== null) {
      writeFilters({ ...filters, metricId: defaultMetricId });
    }
  }, [filters, defaultMetricId]);

  // Nothing to report on: the catalog came back without a measurement that is on, or did not come back.
  const nothingToPick = metricId === null && !catalog.isPending;

  return (
    <Page width="wide">
      <PageHeader title={text.title} />
      {catalog.data ? (
        <ProgressFilterBar
          catalog={catalog.data}
          metricId={metricId}
          filters={filters}
          onChange={(patch) =>
            writeFilters({ ...filters, metricId: metricId ?? undefined, ...patch })
          }
        />
      ) : catalog.isError ? (
        <ErrorState onRetry={() => void catalog.refetch()} />
      ) : (
        <FiltersSkeleton />
      )}
      {nothingToPick ? (
        <>
          {!catalog.isError && <EmptyState title={text.noMeasurements} />}
          <ActivePlans />
        </>
      ) : (
        <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
          {metricId ? <ProgressResults stats={stats} /> : <CardSkeleton className="h-48" />}
          <Leaderboard
            metricId={metricId}
            metric={metric}
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          />
          <ActivePlans />
        </div>
      )}
    </Page>
  );
}
