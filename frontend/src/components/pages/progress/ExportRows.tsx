'use client';

import ListRow, { RowList } from '@/components/common/ListRow';
import { Button } from '@/components/ui/button';
import type { ExportFile } from '@/lib/api/progress/fetchers';
import { useDownloadExport } from '@/lib/api/progress/queries';
import { PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.export;

const FILES: { file: ExportFile; title: string }[] = [
  { file: 'members.csv', title: text.members },
  { file: 'memberships.csv', title: text.memberships },
  { file: 'measurements.csv', title: text.measurements },
];

// S18: three rows, each a "Download CSV" button and the line "Opens in Excel or Google Sheets". A tap makes
// one sign-in check and then the browser downloads the file by itself (BR-REC-119, P10); while that check runs
// the buttons wait, and a failure is a toast (hook).
export default function ExportRows() {
  const download = useDownloadExport();

  return (
    <RowList>
      {FILES.map(({ file, title }) => (
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
