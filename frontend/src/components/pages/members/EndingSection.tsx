'use client';

import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import EndingRow from '@/components/pages/members/EndingRow';
import { useEndingPreview } from '@/lib/api/members/queries';
import { ENDING_EMPTY } from '@/lib/members/endingParams';
import type { EndingStatus } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';

interface EndingSectionProps {
  status: EndingStatus;
  onRenew: (memberId: string) => void;
}

const SECTION = {
  expiring: { title: UI_TEXT.sections.membershipsEnding, seeAll: '/admin/memberships?tab=ending' },
  expired: { title: UI_TEXT.sections.recentlyEnded, seeAll: '/admin/memberships?tab=ended' },
} as const;

// One Home section (BR-REC-53, 101, 131): the title with its count, the first 5 rows, "See all" to the
// full list, and one sentence when nobody is on it. It loads and fails on its own: the other sections
// keep working.
export default function EndingSection({ status, onRenew }: EndingSectionProps) {
  const { data, isError, refetch } = useEndingPreview(status);
  const today = useToday();
  const { title, seeAll } = SECTION[status];
  const total = data?.meta.total ?? 0;

  return (
    <Section
      title={title}
      count={total > 0 ? total : undefined}
      seeAllHref={total > 0 ? seeAll : undefined}
      isLoading={!data && !isError}
      loadingFallback={<RowSkeletons count={3} chips />}
      isError={!data && isError}
      onRetry={() => void refetch()}
    >
      {data &&
        (data.data.length === 0 ? (
          <EmptyState compact title={ENDING_EMPTY[status]} />
        ) : (
          <RowList>
            {data.data.map((item) => (
              <EndingRow
                key={item.memberId}
                item={item}
                status={status}
                today={today}
                onRenew={onRenew}
              />
            ))}
          </RowList>
        ))}
    </Section>
  );
}
