'use client';

import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import DueRow from '@/components/pages/due/DueRow';
import { DUE_PREVIEW_SIZE, useDuePreview } from '@/lib/api/due/queries';
import { dueListHref, tabToStatus } from '@/lib/due/links';
import { emptyDueLine } from '@/lib/due/status';
import type { DueTarget } from '@/lib/due/target';
import type { DueTab } from '@/lib/due/types';
import { UI_TEXT } from '@/lib/messages/words';

interface DueSectionProps {
  tab: DueTab;
  onMore: (target: DueTarget) => void;
}

const TITLES = { overdue: UI_TEXT.sections.overdue, soon: UI_TEXT.sections.dueSoon } as const;

// One Home section (BR-REC-16, 101, 131): the title with its count (`meta.total`), the first 5 rows, "See
// all" to S3 on the same tab, and one sentence when nobody is on it. It loads and fails on its own: the other
// sections keep working. The grey shapes are as tall as 5 rows, so the sections below stay put when rows
// arrive (BR-REC-143).
export default function DueSection({ tab, onMore }: DueSectionProps) {
  const { data, isError, refetch } = useDuePreview(tabToStatus(tab));
  const total = data?.meta.total ?? 0;

  return (
    <Section
      title={TITLES[tab]}
      count={total > 0 ? total : undefined}
      seeAllHref={total > 0 ? dueListHref(tab) : undefined}
      isLoading={!data && !isError}
      loadingFallback={<RowSkeletons count={DUE_PREVIEW_SIZE} chips />}
      isError={!data && isError}
      onRetry={() => void refetch()}
    >
      {data &&
        (data.data.length === 0 ? (
          <EmptyState compact title={emptyDueLine(tab)} />
        ) : (
          <RowList>
            {data.data.map((item) => (
              <DueRow key={`${item.memberId}:${item.typeId}`} item={item} onMore={onMore} />
            ))}
          </RowList>
        ))}
    </Section>
  );
}
