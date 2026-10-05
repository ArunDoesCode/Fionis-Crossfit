'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import ErrorState from '@/components/common/ErrorState';
import { CardSkeleton } from '@/components/common/Skeletons';
import { isApiError } from '@/lib/api/errors';
import type { ProgressStats } from '@/lib/api/progress/fetchers';
import { messageForCode } from '@/lib/messages/errors';
import { notCountedText, outcomeShares, PROGRESS_TEXT, signedValueText } from '@/lib/progress/text';

const text = PROGRESS_TEXT.progress;

interface ProgressResultsProps {
  stats: UseQueryResult<ProgressStats>;
}

const OUTCOMES = [
  { key: 'improved', label: text.improved, color: 'bg-success' },
  { key: 'noChange', label: text.noChange, color: 'bg-neutral' },
  { key: 'worse', label: text.worse, color: 'bg-danger' },
] as const;

// S13 results (BR-REC-111, 112, 113): the average change since each member's first reading, n and how many
// were left out, Improved / No change / Worse as counts with one bar. For "No direction" only the average
// and n (nothing can be better or worse). Its own loading and error state (BR-REC-131); while a filter
// changes the old numbers stay, dimmed.
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
    <div
      aria-busy={stats.isPlaceholderData}
      className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-opacity ${stats.isPlaceholderData ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{text.averageChange}</p>
        <p className="font-mono text-3xl font-semibold">
          {data.avgChange === null ? '–' : signedValueText(data.avgChange, metric)}
        </p>
        <p className="text-sm text-muted-foreground">{`${metric.name} · ${text.sinceFirst}`}</p>
      </div>
      <p className="text-base">{notCountedText(data.n, data.notCounted)}</p>
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
                  <span className="font-mono">{data[key]}</span>
                </li>
              ))}
            </ul>
            <div
              aria-hidden="true"
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            >
              {OUTCOMES.filter(({ key }) => shares[key] > 0).map(({ key, color }) => (
                <div key={key} className={`h-full ${color}`} style={{ width: `${shares[key]}%` }} />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
