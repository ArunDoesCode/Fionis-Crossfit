'use client';

import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ReportHeader from '@/components/pages/progress/ReportHeader';
import ReportPrintStyles from '@/components/pages/progress/ReportPrintStyles';
import ReportSection from '@/components/pages/progress/ReportSection';
import ReportSkeleton from '@/components/pages/progress/ReportSkeleton';
import SegmentalSection from '@/components/pages/progress/SegmentalSection';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { useReportCard } from '@/lib/api/progress/queries';
import { PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface ReportCardViewProps {
  memberId: string;
}

// S12 Report card (`/admin/members/[memberId]/report`), 1080 px wide on desktop. Main action: Print (bar on
// phones, header from 1024 px). Phone: one card per measurement; desktop and paper: a table (BR-REC-135).
// The card is read again on every open (staleTime 0, BR-REC-110). On paper (BR-REC-109): A4 portrait, black
// on white, no shell and no page header: `ReportPrintStyles` hides the shell, `print:hidden` the header.
export default function ReportCardView({ memberId }: ReportCardViewProps) {
  const report = useReportCard(memberId);
  const card = report.data;
  const hasResults = card !== undefined && (card.types.length > 0 || card.segmental !== null);

  // A malformed id is the same as an unknown member: nothing to show.
  const missing =
    isApiError(report.error) && (report.error.status === 404 || report.error.status === 400);

  return (
    <Page width="wide" className="print:max-w-none print:pb-0">
      <ReportPrintStyles />
      <div className="contents print:hidden">
        <PageHeader
          title={text.title}
          backHref={`/admin/members/${memberId}`}
          action={
            hasResults ? (
              <Button type="button" onClick={() => window.print()}>
                {text.print}
              </Button>
            ) : undefined
          }
        />
      </div>
      {card ? (
        <article aria-label={text.title} className="flex flex-col gap-6 print:gap-3">
          <ReportHeader card={card} />
          {hasResults ? (
            <>
              {card.types.map((type) => (
                <ReportSection key={type.id} type={type} today={card.printedOn} />
              ))}
              {card.segmental && (
                <SegmentalSection segmental={card.segmental} today={card.printedOn} />
              )}
            </>
          ) : (
            <EmptyState title={text.empty} />
          )}
        </article>
      ) : missing ? (
        <EmptyState title={text.notFound} />
      ) : report.isError ? (
        <ErrorState onRetry={() => void report.refetch()} />
      ) : (
        <ReportSkeleton />
      )}
    </Page>
  );
}
