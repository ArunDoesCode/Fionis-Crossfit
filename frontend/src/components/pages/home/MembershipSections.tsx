'use client';

import EndingSection from '@/components/pages/members/EndingSection';
import PeriodSheet from '@/components/pages/members/PeriodSheetLazy';
import { useRenewTarget } from '@/lib/members/useRenewTarget';

// SLOT owned by members (Stream B): "Memberships ending" then "Recently ended" (BR-REC-101, 53). Each shows
// its count, the first 5 rows and "See all"; Renew on a row opens the S9 sheet, so Renew from Home is two
// taps (Renew, Renew; BR-REC-140). The frame (HomeView) only places this; one sheet serves both sections.
export default function MembershipSections() {
  const renew = useRenewTarget();

  return (
    <>
      <EndingSection status="expiring" onRenew={renew.renew} />
      <EndingSection status="expired" onRenew={renew.renew} />
      <PeriodSheet memberId={renew.memberId} open={renew.open} onOpenChange={renew.onOpenChange} />
    </>
  );
}
