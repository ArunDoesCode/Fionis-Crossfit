import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ExportRows from '@/components/pages/progress/ExportRows';

// S18 Export data (`/admin/settings/export`), 720 px wide. No main action: each row has its own download.
export default function ExportView() {
  return (
    <Page width="narrow">
      <PageHeader />
      <ExportRows />
    </Page>
  );
}
