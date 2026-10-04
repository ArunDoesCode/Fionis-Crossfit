'use client';

import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { Card, CardContent } from '@/components/ui/card';
import { useMember } from '@/lib/api/members/queries';
import { formatDayWithYear } from '@/lib/members/dayText';
import { membershipStatusText, PLAN_LABELS } from '@/lib/members/membershipText';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by members (Stream B), S7: "Annual · Active · 241 days left" and "Ends 31 May 2026" (BR-REC-59,
// 52). The status words come from the dates, never typed. Renew comes with the next round (S9). Its own
// loading and error state (BR-REC-129, 131).
export default function MembershipBlock({ memberId }: MemberSlotProps) {
  const { data: member, isError, refetch } = useMember(memberId);
  const today = useToday();
  const status = member ? membershipStatusText(member.membership, today) : null;

  return (
    <Section
      title={UI_TEXT.sections.membership}
      isLoading={!member && !isError}
      loadingFallback={<CardSkeleton className="h-28" />}
      isError={!member && isError}
      onRetry={() => void refetch()}
    >
      {member && status && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-heading text-lg font-semibold">
                {PLAN_LABELS[member.membership.plan]}
              </span>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span className="text-base text-muted-foreground">{status.detail}</span>
            </div>
            <p className="text-base">
              {`${member.membership.status === 'expired' ? 'Ended' : 'Ends'} ${formatDayWithYear(member.membership.endOn)}`}
            </p>
          </CardContent>
        </Card>
      )}
    </Section>
  );
}
