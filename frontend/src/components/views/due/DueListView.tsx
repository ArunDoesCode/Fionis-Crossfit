import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import DueListPanel from '@/components/pages/due/DueListPanel';

// S3 Due list (`/admin/due`, 1080 px wide): the tabs, the assessment chips and the rows. No main action (a
// row opens Record assessment); the back arrow goes to Home, where the sections link here (BR-REC-101,
// 104, 121).
export default function DueListView() {
  return (
    <Page width="wide">
      <PageHeader />
      <DueListPanel />
    </Page>
  );
}
