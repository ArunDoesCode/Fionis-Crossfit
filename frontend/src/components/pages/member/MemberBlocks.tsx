'use client';

import {
  Alert02Icon,
  ArrowRight01Icon,
  Call02Icon,
  InformationCircleIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import ListRow, { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import { CardSkeleton, RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import AssessmentRow from '@/components/pages/assessments/AssessmentRow';
import ChipList from '@/components/pages/due/ChipList';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { DueSheet, PeriodSheet, preloadPeriodSheet } from '@/components/pages/lazySheets';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentAssessments } from '@/lib/api/assessments/listQueries';
import { useMemberDue } from '@/lib/api/due/queries';
import { isApiError } from '@/lib/api/errors';
import { useArchiveMember, useMember, useRestoreMember } from '@/lib/api/members/queries';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { IsoDate } from '@/lib/domain/dates';
import { memberDueStatus } from '@/lib/due/status';
import { type DueTarget, lineTarget } from '@/lib/due/target';
import { DUE_TEXT } from '@/lib/due/text';
import type { MemberDueItem } from '@/lib/due/types';
import { useDueSheet } from '@/lib/due/useDueSheet';
import { formatDay, formatPhone } from '@/lib/format';
import { memberBannerText } from '@/lib/members/banner';
import { SEX_LABELS } from '@/lib/members/labels';
import { membershipStatusText, PLAN_LABELS } from '@/lib/members/membershipText';
import type { MemberPeriod } from '@/lib/members/types';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';
import { messageForCode } from '@/lib/messages/errors';
import { UI_TEXT, WORDS } from '@/lib/messages/words';

interface MemberBlockProps {
  memberId: string;
}

// The confirm sheet (drawer, dialog) only shows after a tap, so it loads on demand and not with the member
// page (BR-REC-146, performance tactic 4). The button starts the load on pointer-down and focus; the sheet
// is mounted when the first tap has loaded it and then stays mounted for its exit animation (see
// `useLazySheet`: opens after the mount so the first open animates; a failed load toasts and the next tap
// loads again). This is the only `import()` of the sheet here.
const loadConfirmSheet = sheetLoader(() => import('@/components/common/ConfirmSheet'));

function preloadConfirmSheet() {
  // A failed preload is not an error: the tap loads it again (and says so if that fails too).
  loadConfirmSheet().catch(() => undefined);
}

// BR-REC-06, 58, 133: archiving is the one thing on the member page that asks first. They are hidden from
// search and Home, nothing is deleted, and Restore brings them back.
function ArchiveMemberButton({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [open, setOpen] = useState(false);
  const { Sheet, open: sheetOpen } = useLazySheet(loadConfirmSheet, open, setOpen);
  const { mutate, isPending } = useArchiveMember(memberId);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-fit"
        onPointerDown={preloadConfirmSheet}
        onFocus={preloadConfirmSheet}
        onClick={() => setOpen(true)}
      >
        {WORDS.archive}
      </Button>
      {Sheet && (
        <Sheet
          open={sheetOpen}
          onOpenChange={setOpen}
          title={`Archive ${fullName}?`}
          description="They'll be hidden from search and Home. You can restore them later."
          confirmLabel="Archive"
          destructive
          pending={isPending}
          onConfirm={() => mutate(undefined, { onSuccess: () => setOpen(false) })}
        />
      )}
    </>
  );
}

// BR-REC-58: the Restore button always works, whatever the membership says. No confirmation (BR-REC-133).
function RestoreMemberButton({ memberId }: { memberId: string }) {
  const { mutate, isPending } = useRestoreMember(memberId);

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      disabled={isPending}
      onClick={() => mutate()}
    >
      {isPending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {isPending ? UI_TEXT.saving : 'Restore'}
    </Button>
  );
}

// BR-REC-172: the first thing on the page of an archived member or one whose membership ended: when,
// in words, with an icon (never colour alone, BR-REC-125), and Restore while archived. `text` is the
// BR-REC-172 line ("Archived 2 Jun 2026 · Membership ended 31 May 2026").
function MemberBanner({
  memberId,
  text,
  archived,
}: {
  memberId: string;
  text: string;
  archived: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col gap-3 rounded-2xl p-4 text-base ${archived ? 'bg-neutral-soft text-neutral' : 'bg-danger-soft text-danger'}`}
    >
      <p className="flex items-start gap-2">
        <HugeiconsIcon
          icon={archived ? InformationCircleIcon : Alert02Icon}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{text}</span>
      </p>
      {archived && <RestoreMemberButton memberId={memberId} />}
    </div>
  );
}

// S7: the archived/ended banner (BR-REC-172), then name, "44 y · Male · Joined 1 Jun 2025", the phone to
// tap and call, and Archive (BR-REC-06, 58, 59). Edit is in the page header (the frame's). Grey shapes
// while loading, "Couldn't load this." in its own place when it fails (BR-REC-129, 131): the other blocks
// keep working.
export function MemberHeader({ memberId }: MemberBlockProps) {
  const { data: member, error, isError, refetch } = useMember(memberId);
  const today = useToday();

  if (!member) {
    if (!isError) {
      return (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-5 w-40 max-w-full" />
        </div>
      );
    }
    const missing = isApiError(error) && error.status === 404;
    return (
      <ErrorState
        message={missing ? messageForCode('NOT_FOUND') : undefined}
        onRetry={missing ? undefined : () => void refetch()}
      />
    );
  }

  const banner = memberBannerText(member, today, deviceTimeZone());
  const archived = member.archivedAt !== null;

  return (
    <div className="flex flex-col gap-4">
      {banner && <MemberBanner memberId={member.id} text={banner} archived={archived} />}
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold lg:text-3xl">{member.fullName}</h2>
        <p className="text-base text-muted-foreground">
          {`${member.age} y · ${SEX_LABELS[member.sex]} · Joined ${formatDay(member.joinedOn)}`}
        </p>
        <a
          href={`tel:${member.phone}`}
          className="inline-flex min-h-11 w-fit items-center gap-2 text-base font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <HugeiconsIcon icon={Call02Icon} strokeWidth={2} aria-hidden="true" className="size-5" />
          {formatPhone(member.phone)}
          <span className="sr-only"> (call)</span>
        </a>
      </div>
      {!archived && <ArchiveMemberButton memberId={member.id} fullName={member.fullName} />}
    </div>
  );
}

// "Membership history" under the membership card, one row per membership, also when there is only one: the
// row is the only way to Edit a membership (BR-REC-09, 55: periods are edited, never deleted). Each row is
// the plan and its dates, with the year; tap to edit. `periods` are newest first (the order E18 answers);
// `onIntent` (pointer-down, focus on a row) lets the caller start loading the edit sheet.
function MembershipHistory({
  periods,
  onEdit,
  onIntent,
}: {
  periods: readonly MemberPeriod[];
  onEdit: (period: MemberPeriod) => void;
  onIntent?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  // The rows are buttons inside <ListRow>, so their touch and focus are caught here as they bubble up
  // (native listeners: a plain div has no business with JSX event handlers).
  useEffect(() => {
    const el = root.current;
    if (!el || !onIntent) return;
    el.addEventListener('pointerdown', onIntent, { passive: true });
    el.addEventListener('focusin', onIntent);
    return () => {
      el.removeEventListener('pointerdown', onIntent);
      el.removeEventListener('focusin', onIntent);
    };
  }, [onIntent]);

  return (
    <div ref={root} className="flex flex-col gap-2">
      <h3 className="text-base font-medium">Membership history</h3>
      <RowList>
        {periods.map((period) => (
          <ListRow
            key={period.id}
            title={PLAN_LABELS[period.plan]}
            detail={`${formatDay(period.startOn)} – ${formatDay(period.endOn)}`}
            onClick={() => onEdit(period)}
            status={
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            }
          />
        ))}
      </RowList>
    </div>
  );
}

// S7: "Annual · Active · 241 days left", "Ends 31 May 2026" and [Renew] (BR-REC-59, 52, 54), then
// "Membership history", one row per membership, also when there is only one: the row is the way to Edit it
// (BR-REC-09, 55). The status words come from the dates, never typed. Renew and a history row open the S9
// sheet, also for an archived member (BR-REC-58); the sheet's code loads on the first touch of either
// (BR-REC-146). Its own loading and error state (BR-REC-129, 131).
export function MembershipBlock({ memberId }: MemberBlockProps) {
  const { data: member, isError, refetch } = useMember(memberId);
  const today = useToday();
  const [sheet, setSheet] = useState<{ open: boolean; period?: MemberPeriod }>({ open: false });
  const status = member ? membershipStatusText(member.membership, today) : null;

  return (
    <>
      <Section
        title={UI_TEXT.sections.membership}
        isLoading={!member && !isError}
        loadingFallback={<CardSkeleton className="h-28" />}
        isError={!member && isError}
        onRetry={() => void refetch()}
      >
        {member && status && (
          <>
            <Card size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-heading text-lg font-semibold">
                    {PLAN_LABELS[member.membership.plan]}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <span className="text-base text-muted-foreground">{status.detail}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base">
                    {`${member.membership.status === 'expired' ? 'Ended' : 'Ends'} ${formatDay(member.membership.endOn)}`}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onPointerDown={preloadPeriodSheet}
                    onFocus={preloadPeriodSheet}
                    onClick={() => setSheet({ open: true })}
                  >
                    Renew
                  </Button>
                </div>
              </CardContent>
            </Card>
            {member.periods.length > 0 && (
              <MembershipHistory
                periods={member.periods}
                onIntent={preloadPeriodSheet}
                onEdit={(period) => setSheet({ open: true, period })}
              />
            )}
          </>
        )}
      </Section>
      <PeriodSheet
        memberId={memberId}
        open={sheet.open}
        period={sheet.period}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
      />
    </>
  );
}

// One assessment on the member page (BR-REC-103, 125; C10): its name, ONE status in words (Assess soon,
// Reminder on 20 Oct, Never recorded, Overdue 34 days, Due in 5 days, Next due 12 Dec), the due measurements
// as chips when there are some, and a "⋯" for the same choices as the lists (plus Remove reminder).
function MemberDueRow({
  memberId,
  line,
  today,
  onMore,
}: {
  memberId: string;
  line: MemberDueItem;
  today: IsoDate;
  onMore: (target: DueTarget) => void;
}) {
  const status = memberDueStatus(line, today);
  return (
    <ListRow
      title={line.typeName}
      status={<StatusBadge tone={status.tone}>{status.text}</StatusBadge>}
      trailing={
        <DueMoreButton name={line.typeName} onOpen={() => onMore(lineTarget(memberId, line))} />
      }
    >
      {line.items.length > 0 && <ChipList items={line.items.map((chip) => chip.name)} />}
    </ListRow>
  );
}

// S7: "Assessments" — one line per turned-on assessment with its status and the due measurements, and a
// "⋯" with Assess soon / Remind me later / remove (BR-REC-100, 103; C10). Archived members show it too
// (C3). No main action here: "Record assessment" belongs to the frame. Its own loading and error state
// (BR-REC-129, 131).
export function DueBlock({ memberId }: MemberBlockProps) {
  const { data, isError, refetch } = useMemberDue(memberId);
  const today = useToday();
  const sheet = useDueSheet();

  return (
    <>
      <Section
        title={UI_TEXT.sections.assessments}
        isLoading={!data && !isError}
        loadingFallback={<RowSkeletons count={3} />}
        isError={!data && isError}
        onRetry={() => void refetch()}
      >
        {data &&
          (data.length === 0 ? (
            <EmptyState compact title={DUE_TEXT.noAssessments} />
          ) : (
            <RowList>
              {data.map((line) => (
                <MemberDueRow
                  key={line.typeId}
                  memberId={memberId}
                  line={line}
                  today={today}
                  onMore={sheet.show}
                />
              ))}
            </RowList>
          ))}
      </Section>
      <DueSheet
        target={sheet.target}
        session={sheet.session}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </>
  );
}

// S7: the latest 3 assessments, one row each ("12 Sep 2026" · "Body composition" · "15 results"; "≈ Dec
// 2025" when estimated), newest first (BR-REC-80, 89; D18). A row opens that assessment on S11. Its own
// loading and error state with "Try again": the rest of the member page never waits for it or breaks with
// it (BR-REC-129, 131). The full list is the page's own "All assessments" button.
export function RecentBlock({ memberId }: MemberBlockProps) {
  const recent = useRecentAssessments(memberId);
  const today = useToday();
  const items = recent.data?.data ?? [];
  // "Try again" on a failed read shows the grey rows until the answer is in (else nothing would happen).
  const retrying = recent.isError && recent.isFetching;

  return (
    <Section
      title={UI_TEXT.sections.recent}
      isLoading={recent.isPending || retrying}
      isError={recent.isError && !retrying}
      onRetry={() => void recent.refetch()}
    >
      {items.length === 0 ? (
        <EmptyState compact title={ASSESSMENT_TEXT.noAssessments} />
      ) : (
        <RowList>
          {items.map((item) => (
            <AssessmentRow
              key={item.id}
              item={item}
              today={today}
              href={`/admin/members/${memberId}/assessments?open=${item.id}` as Route}
            />
          ))}
        </RowList>
      )}
    </Section>
  );
}
