'use client';

import { useState } from 'react';
import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import MembershipHistory from '@/components/pages/members/MembershipHistory';
import PeriodSheet, { preloadPeriodSheet } from '@/components/pages/members/PeriodSheetLazy';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMember } from '@/lib/api/members/queries';
import { formatDay } from '@/lib/format';
import { membershipStatusText, PLAN_LABELS } from '@/lib/members/membershipText';
import type { MemberPeriod } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by members (Stream B), S7: "Annual · Active · 241 days left", "Ends 31 May 2026" and [Renew]
// (BR-REC-59, 52, 54), then "Membership history", one row per membership, also when there is only one: the
// row is the way to Edit it (BR-REC-09, 55). The status words come from the dates, never typed. Renew and a
// history row open the S9 sheet, also for an archived member (BR-REC-58); the sheet's code loads on the
// first touch of either (BR-REC-146). Its own loading and error state (BR-REC-129, 131).
export default function MembershipBlock({ memberId }: MemberSlotProps) {
  const { data: member, isError, refetch } = useMember(memberId);
  const today = useToday();
  const [sheet, setSheet] = useState<{ open: boolean; period?: MemberPeriod }>({ open: false });
  const status = member ? membershipStatusText(member.membership, today) : null;

  return (
    <>
      <Section
        title={UI_TEXT.sections.membership}
        isLoading={!member && !isError}
        loadingFallback={<CardSkeleton className="h-28" />}
        isError={!member && isError}
        onRetry={() => void refetch()}
      >
        {member && status && (
          <>
            <Card size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-heading text-lg font-semibold">
                    {PLAN_LABELS[member.membership.plan]}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <span className="text-base text-muted-foreground">{status.detail}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base">
                    {`${member.membership.status === 'expired' ? 'Ended' : 'Ends'} ${formatDay(member.membership.endOn)}`}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onPointerDown={preloadPeriodSheet}
                    onFocus={preloadPeriodSheet}
                    onClick={() => setSheet({ open: true })}
                  >
                    Renew
                  </Button>
                </div>
              </CardContent>
            </Card>
            {member.periods.length > 0 && (
              <MembershipHistory
                periods={member.periods}
                onIntent={preloadPeriodSheet}
                onEdit={(period) => setSheet({ open: true, period })}
              />
            )}
          </>
        )}
      </Section>
      <PeriodSheet
        memberId={memberId}
        open={sheet.open}
        period={sheet.period}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
      />
    </>
  );
}
