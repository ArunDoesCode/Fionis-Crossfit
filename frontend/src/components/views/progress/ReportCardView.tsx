'use client';

import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import MeasurementCard from '@/components/pages/progress/MeasurementCard';
import MeasurementTable from '@/components/pages/progress/MeasurementTable';
import ReportSkeleton from '@/components/pages/progress/ReportSkeleton';
import SegmentalSection from '@/components/pages/progress/SegmentalSection';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import type { ReportCard, ReportType } from '@/lib/api/progress/fetchers';
import { useReportCard } from '@/lib/api/progress/queries';
import { formatDay } from '@/lib/format';
import { SEX_LABELS } from '@/lib/members/labels';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { fullDayText, PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

// BR-REC-109: "Print" gives one A4 portrait page in black on white, without the shell. The shell files and
// globals.css stay as they are: these rules ship with the report card only (a `<style>` that exists while
// the screen is open and goes with it), and they find the shell through its own `data-slot` marks.
// The print width is about 700 px, so the `lg:` look never applies on paper: the table is shown with the
// `print:` variant (MeasurementTable), and the cards and the page header are hidden the same way.
// `color-scheme: light !important`: the theme puts an inline `color-scheme: dark` on `<html>`, which would
// otherwise paint the page margin dark when the browser prints background graphics.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  :root, :root.dark {
    color-scheme: light !important;
    --background: white;
    --foreground: black;
    --card: white;
    --card-foreground: black;
    --muted: white;
    --muted-foreground: black;
    --border: black;
    --section-gap: 3mm;
  }
  html, body { background: white; color: black; }
  [data-slot="sidebar"],
  [data-slot="action-bar"],
  [data-sonner-toaster],
  [data-slot="app-main"] > [role="status"] { display: none; }
  [data-slot="sidebar-wrapper"] { min-height: 0; }
  [data-slot="app-main"] { padding: 0; }
}
`;

interface ReportHeaderProps {
  card: ReportCard;
}

// The top of the card (BR-REC-106): name, age, sex, plan (status) and join date. From 1024 px and on paper
// the gym name and the printed date sit above it and the details run on one line.
function ReportHeader({ card }: ReportHeaderProps) {
  const { member } = card;
  const plan = `${PLAN_LABELS[member.plan]} (${text.status[member.membershipStatus]})`;
  const joined = `${text.joined} ${formatDay(member.joinedOn)}`;

  return (
    <header className="flex flex-col gap-1">
      <div className="hidden items-baseline justify-between gap-4 border-b pb-2 lg:flex print:flex">
        <p className="font-heading text-lg font-semibold print:text-[12pt]">{card.gymName}</p>
        <p className="text-sm text-muted-foreground">{`${text.printed} ${fullDayText(card.printedOn)}`}</p>
      </div>
      <h2 className="font-heading text-2xl font-semibold print:text-[14pt]">{member.fullName}</h2>
      <p className="text-base text-muted-foreground">
        <span className="block lg:inline print:inline">{`${member.age} ${text.age} · ${SEX_LABELS[member.sex]}`}</span>
        <span className="hidden lg:inline print:inline"> · </span>
        <span className="block lg:inline print:inline">{`${plan} · ${joined}`}</span>
      </p>
    </header>
  );
}

interface ReportSectionProps {
  type: ReportType;
  today: string;
}

// One assessment of the report card, in setup order (BR-REC-106): cards on a phone, the table on desktop
// and paper. Never-recorded measurements are already left out by the API.
function ReportSection({ type, today }: ReportSectionProps) {
  return (
    <section aria-label={type.name} className="flex flex-col gap-3 print:gap-1">
      <h2 className="font-heading text-lg font-semibold print:text-[11pt]">{type.name}</h2>
      <ul className="flex flex-col gap-3 lg:hidden print:hidden">
        {type.metrics.map((metric) => (
          <MeasurementCard key={metric.id} metric={metric} today={today} />
        ))}
      </ul>
      <MeasurementTable type={type} today={today} />
    </section>
  );
}

interface ReportCardViewProps {
  memberId: string;
}

// S12 Report card (`/admin/members/[memberId]/report`), 1080 px wide on desktop. Main action: Print (bar on
// phones, header from 1024 px). Phone: one card per measurement; desktop and paper: a table (BR-REC-135).
// The card is read again on every open (staleTime 0, BR-REC-110). On paper (BR-REC-109): A4 portrait, black
// on white, no shell and no page header: `PRINT_CSS` hides the shell, `print:hidden` the header.
export default function ReportCardView({ memberId }: ReportCardViewProps) {
  const report = useReportCard(memberId);
  const card = report.data;
  const hasResults = card !== undefined && (card.types.length > 0 || card.segmental !== null);

  // A malformed id is the same as an unknown member: nothing to show.
  const missing =
    isApiError(report.error) && (report.error.status === 404 || report.error.status === 400);

  return (
    <Page width="wide" className="print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="contents print:hidden">
        <PageHeader
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
