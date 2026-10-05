import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import EndingTabs from '@/components/pages/members/EndingTabs';

// S4 Memberships ending (`/admin/memberships`, 1080 px wide): the tabs and their rows. No main action
// (Renew is on each row); the back arrow goes to Home, where the sections link here (BR-REC-53, 121).
export default function MembershipsEndingView() {
  return (
    <Page width="wide">
      <PageHeader />
      <EndingTabs />
    </Page>
  );
}
