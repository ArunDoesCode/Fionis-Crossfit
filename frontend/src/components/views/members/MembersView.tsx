import { Add01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import MemberListPanel from '@/components/pages/members/MemberListPanel';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

// S5 Members (`/admin/members`, 1080 px wide): search, the chips, the rows. The one main action is
// "+ Add member" (header on desktop, bar above the tabs on phones: BR-REC-121).
export default function MembersView() {
  return (
    <Page>
      <PageHeader
        action={
          <Button size="lg" nativeButton={false} render={<Link href="/admin/members/new" />}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
            {UI_TEXT.screens.addMember}
          </Button>
        }
      />
      <MemberListPanel />
    </Page>
  );
}
