import { Add01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import LinkButton from '@/components/common/LinkButton';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import MemberListPanel from '@/components/pages/members/MemberListPanel';
import { UI_TEXT } from '@/lib/messages/words';

// S5 Members (`/admin/members`, 1080 px wide): search, the chips, the rows. The one main action is
// "+ Add member" (header on desktop, bar above the tabs on phones: BR-REC-121).
export default function MembersView() {
  return (
    <Page width="wide">
      <PageHeader
        title={UI_TEXT.screens.members}
        action={
          <LinkButton href="/admin/members/new">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
            {UI_TEXT.screens.addMember}
          </LinkButton>
        }
      />
      <MemberListPanel />
    </Page>
  );
}
