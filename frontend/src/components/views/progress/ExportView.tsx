'use client';

import ListRow, { RowList } from '@/components/common/ListRow';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useDownloadExport } from '@/lib/api/progress/queries';
import { EXPORT_FILES } from '@/lib/progress/exportFiles';
import { PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.export;

// S18: three rows, each a "Download CSV" button and the line "Opens in Excel or Google Sheets". A tap makes
// one sign-in check and then the browser downloads the file by itself (BR-REC-119, P10); while that check runs
// the buttons wait, and a failure is a toast (hook).
function ExportRows() {
  const download = useDownloadExport();

  return (
    <RowList>
      {EXPORT_FILES.map(({ file, title }) => (
        <ListRow
          key={file}
          title={title}
          detail={text.hint}
          status={
            <Button
              type="button"
              variant="secondary"
              disabled={download.isPending}
              onClick={() => download.mutate(file)}
            >
              {download.isPending && download.variables === file ? text.starting : text.download}
              <span className="sr-only">{` ${title}`}</span>
            </Button>
          }
        />
      ))}
    </RowList>
  );
}

// S18 Export data (`/admin/settings/export`), 720 px wide. No main action: each row has its own download.
export default function ExportView() {
  return (
    <Page>
      <PageHeader />
      <ExportRows />
    </Page>
  );
}
