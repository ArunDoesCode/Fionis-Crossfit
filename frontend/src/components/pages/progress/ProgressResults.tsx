'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import ErrorState from '@/components/common/ErrorState';
import { CardSkeleton } from '@/components/common/Skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { isApiError } from '@/lib/api/errors';
import type { ProgressStats } from '@/lib/api/progress/fetchers';
import { messageForCode } from '@/lib/messages/errors';
import {
  averageChangeText,
  improvedHeadline,
  notCountedText,
  outcomeShares,
  PROGRESS_TEXT,
  signedValueText,
} from '@/lib/progress/text';

const text = PROGRESS_TEXT.progress;

interface ProgressResultsProps {
  stats: UseQueryResult<ProgressStats>;
}

const OUTCOMES = [
  { key: 'improved', label: text.improved, color: 'bg-success' },
  { key: 'noChange', label: text.noChange, color: 'bg-neutral' },
  { key: 'worse', label: text.worse, color: 'bg-danger' },
] as const;

// S13 results (BR-REC-111, 112, 113, 228): one plain sentence first ("17 of 20 members improved Body fat since
// their first reading"), then the average change as the KPI number (brand colour) and in words ("Body fat down
// 2.0 % on average · better"), the count line ("Based on 12 members (5 more have only one reading)"), and
// Improved / No change / Worse as counts with one bar. For "No direction" no sentence and no better / worse
// (nothing can be better or worse). Its own loading and error state (BR-REC-131); while a filter changes the
// old numbers stay, dimmed.
export default function ProgressResults({ stats }: ProgressResultsProps) {
  if (stats.isError) {
    const missing = isApiError(stats.error) && stats.error.status === 404;
    return (
      <ErrorState
        message={missing ? messageForCode('NOT_FOUND') : undefined}
        onRetry={missing ? undefined : () => void stats.refetch()}
      />
    );
  }
  const data = stats.data;
  if (!data) return <CardSkeleton className="h-48" />;

  const { metric } = data;
  const shares = outcomeShares(data);
  const hasDirection = metric.better !== 'none';

  return (
    <Card
      size="sm"
      aria-busy={stats.isPlaceholderData}
      className={`transition-opacity ${stats.isPlaceholderData ? 'opacity-60' : ''}`}
    >
      <CardContent className="flex flex-col gap-3">
        {hasDirection && data.n > 0 && (
          <p className="font-heading text-lg font-semibold">
            {improvedHeadline(data.improved, data.n, metric.name)}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {text.averageChange}
          </p>
          <p className="tabular-nums text-3xl font-semibold text-brand">
            {data.avgChange === null ? '–' : signedValueText(data.avgChange, metric)}
          </p>
          {data.avgChange !== null && (
            <p className="text-base">{averageChangeText(metric.name, data.avgChange, metric)}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{notCountedText(data.n, data.notCounted)}</p>
        {data.n === 0 ? (
          <p className="text-sm text-muted-foreground">{text.notEnough}</p>
        ) : (
          hasDirection && (
            <>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-base">
                {OUTCOMES.map(({ key, label, color }) => (
                  <li key={key} className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-3 rounded-sm ${color}`} />
                    {`${label} `}
                    <span className="tabular-nums">{data[key]}</span>
                  </li>
                ))}
              </ul>
              <div
                aria-hidden="true"
                className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
              >
                {OUTCOMES.filter(({ key }) => shares[key] > 0).map(({ key, color }) => (
                  <div
                    key={key}
                    className={`h-full ${color}`}
                    style={{ width: `${shares[key]}%` }}
                  />
                ))}
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
