'use client';

import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import DueSheet from '@/components/pages/due/DueSheetLazy';
import MemberDueRow from '@/components/pages/due/MemberDueRow';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { useMemberDue } from '@/lib/api/due/queries';
import { DUE_TEXT } from '@/lib/due/text';
import { useDueSheet } from '@/lib/due/useDueSheet';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by due-list (Stream E), S7: "Assessments" — one line per turned-on assessment with its status
// and the due measurements, and a "⋯" with Assess soon / Remind me later / remove (BR-REC-100, 103; C10).
// Archived members show it too (C3). No main action here: "Record assessment" belongs to the frame. Its own
// loading and error state (BR-REC-129, 131).
export default function DueBlock({ memberId }: MemberSlotProps) {
  const { data, isError, refetch } = useMemberDue(memberId);
  const today = useToday();
  const sheet = useDueSheet();

  return (
    <>
      <Section
        title={UI_TEXT.sections.assessments}
        isLoading={!data && !isError}
        loadingFallback={<RowSkeletons count={3} />}
        isError={!data && isError}
        onRetry={() => void refetch()}
      >
        {data &&
          (data.length === 0 ? (
            <EmptyState compact title={DUE_TEXT.noAssessments} />
          ) : (
            <RowList>
              {data.map((line) => (
                <MemberDueRow
                  key={line.typeId}
                  memberId={memberId}
                  line={line}
                  today={today}
                  onMore={sheet.show}
                />
              ))}
            </RowList>
          ))}
      </Section>
      <DueSheet
        target={sheet.target}
        session={sheet.session}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </>
  );
}
