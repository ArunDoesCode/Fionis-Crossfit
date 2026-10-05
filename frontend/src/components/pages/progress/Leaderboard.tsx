'use client';

import { Medal01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import MemberAvatar from '@/components/common/MemberAvatar';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isApiError } from '@/lib/api/errors';
import { useLeaderboard } from '@/lib/api/progress/queries';
import { formatDay } from '@/lib/format';
import { messageForCode } from '@/lib/messages/errors';
import type { Sex } from '@/lib/progress/filters';
import { PROGRESS_TEXT, type ValueMetric, valueText } from '@/lib/progress/text';

const text = PROGRESS_TEXT.progress;

interface LeaderboardProps {
  /** `null` until a measurement is known. */
  metricId: string | null;
  /** How to write a value and what to call it; `undefined` until the measurement has loaded. */
  metric: (ValueMetric & { name: string }) | undefined;
  className?: string;
}

const TABS: { value: Sex; label: string }[] = [
  { value: 'male', label: text.male },
  { value: 'female', label: text.female },
];

const ROW = 'grid min-h-14 grid-cols-[3rem_minmax(0,1fr)_auto_5rem] items-center gap-3 px-4 py-2';

// BR-REC-228: ranks 1 to 3 get a medal badge (icon + number, never colour alone); equal values share a rank.
const MEDALS: Record<number, string> = {
  1: 'bg-warning-soft text-warning',
  2: 'bg-neutral-soft text-neutral',
  3: 'bg-info-soft text-info',
};

function Rank({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (!medal) return <span className="tabular-nums text-base text-muted-foreground">{rank}</span>;
  return (
    <span
      className={`inline-flex h-7 w-fit items-center gap-1 rounded-full px-2 text-sm font-semibold tabular-nums ${medal}`}
    >
      <HugeiconsIcon icon={Medal01Icon} strokeWidth={2} aria-hidden="true" className="size-4" />
      {rank}
      <span className="sr-only"> (medal)</span>
    </span>
  );
}

function Rows({
  metricId,
  metric,
  sex,
}: {
  metricId: string | null;
  metric: ValueMetric | undefined;
  sex: Sex;
}) {
  const board = useLeaderboard(metricId, sex, true);
  const items = board.data?.pages.flatMap((page) => page.data) ?? [];

  if (board.isError && !board.data) {
    const code = isApiError(board.error) ? board.error.code : undefined;
    return code === 'NO_DIRECTION' ? (
      <p className="text-base text-muted-foreground">{messageForCode(code)}</p>
    ) : (
      <ErrorState onRetry={() => void board.refetch()} />
    );
  }
  if (!board.data || !metric) return <RowSkeletons count={5} />;
  if (items.length === 0) return <EmptyState compact title={text.nobodyRanked} />;

  return (
    <div className="flex flex-col gap-3">
      <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((item) => (
          <li key={item.memberId}>
            <div className={ROW}>
              <Rank rank={item.rank} />
              <span className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={item.fullName} size="sm" />
                <span className="truncate text-base font-semibold">{item.fullName}</span>
              </span>
              <span className="tabular-nums text-base">{valueText(item.value, metric)}</span>
              <span className="text-right text-sm text-muted-foreground">{formatDay(item.on)}</span>
            </div>
          </li>
        ))}
      </ol>
      {board.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          disabled={board.isFetchingNextPage}
          onClick={() => void board.fetchNextPage()}
        >
          {text.showMore}
        </Button>
      )}
    </div>
  );
}

// S13 leaderboard (BR-REC-115): each member's latest value of the measurement, best first, Male and
// Female tabs (Male first), the top 10 and "Show more" for the next 10. Equal values share a rank. A
// measurement with "No direction" has no leaderboard, only a short line. Its own loading and error state.
export default function Leaderboard({ metricId, metric, className }: LeaderboardProps) {
  const [sex, setSex] = useState<Sex>('male');

  return (
    <Section
      title={metric ? text.leaderboardFor(metric.name) : text.leaderboard}
      className={className}
    >
      {metric?.better === 'none' ? (
        <p className="text-base text-muted-foreground">{messageForCode('NO_DIRECTION')}</p>
      ) : (
        <Tabs value={sex} onValueChange={(next) => setSex(next as Sex)}>
          <TabsList className="w-full">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-base">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="pt-3">
              <Rows metricId={metricId} metric={metric} sex={tab.value} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Section>
  );
}
