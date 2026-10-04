'use client';

import type { Route } from 'next';
import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import AssessmentRow from '@/components/pages/assessments/AssessmentRow';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { useRecentAssessments } from '@/lib/api/assessments/listQueries';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by assessments (Stream D), S7: the latest 3 assessments, one row each ("12 Sep 2026" ·
// "Body composition" · "15 results"; "≈ Dec 2025" when estimated), newest first (BR-REC-80, 89; D18). A row
// opens that assessment on S11. Its own loading and error state with "Try again": the rest of the member
// page never waits for it or breaks with it (BR-REC-129, 131). The full list is the page's own
// "All assessments" button.
export default function RecentBlock({ memberId }: MemberSlotProps) {
  const recent = useRecentAssessments(memberId);
  const today = useToday();
  const items = recent.data?.data ?? [];
  // "Try again" on a failed read shows the grey rows until the answer is in (else nothing would happen).
  const retrying = recent.isError && recent.isFetching;

  return (
    <Section
      title={UI_TEXT.sections.recent}
      isLoading={recent.isPending || retrying}
      isError={recent.isError && !retrying}
      onRetry={() => void recent.refetch()}
    >
      {items.length === 0 ? (
        <EmptyState compact title={ASSESSMENT_TEXT.noAssessments} />
      ) : (
        <RowList>
          {items.map((item) => (
            <AssessmentRow
              key={item.id}
              item={item}
              today={today}
              href={`/admin/members/${memberId}/assessments?open=${item.id}` as Route}
            />
          ))}
        </RowList>
      )}
    </Section>
  );
}
