'use client';

import {
  Alert02Icon,
  Archive02Icon,
  ArrowRight01Icon,
  Call02Icon,
  InformationCircleIcon,
  Loading03Icon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ListRow, { RowList } from '@/components/common/ListRow';
import Section from '@/components/common/Section';
import { CardSkeleton, RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import AssessmentRow from '@/components/pages/assessments/AssessmentRow';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { DueSheet, PeriodSheet, preloadPeriodSheet } from '@/components/pages/lazySheets';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentAssessments } from '@/lib/api/assessments/listQueries';
import { useMemberDue } from '@/lib/api/due/queries';
import { useArchiveMember, useMember, useRestoreMember } from '@/lib/api/members/queries';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { IsoDate } from '@/lib/domain/dates';
import { recordHref } from '@/lib/due/links';
import { memberDueStatus } from '@/lib/due/status';
import { type DueTarget, isSheetOpenFor, lineTarget } from '@/lib/due/target';
import { DUE_TEXT, dueItemsText } from '@/lib/due/text';
import type { MemberDueItem } from '@/lib/due/types';
import { useDueSheet } from '@/lib/due/useDueSheet';
import { useTurnedOnCounts } from '@/lib/due/useTurnedOnCounts';
import { formatDay, formatPhone } from '@/lib/format';
import { memberBannerText } from '@/lib/members/banner';
import { SEX_LABELS } from '@/lib/members/labels';
import { membershipStatusText, PLAN_LABELS } from '@/lib/members/membershipText';
import { mostOverdue, NEXT_STEP_TEXT, nextStepFor } from '@/lib/members/nextStep';
import type { MemberPeriod } from '@/lib/members/types';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';
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

// BR-REC-06, 58, 133, 224: Archive (hide) is the one thing on the member page that asks first; it sits in the
// "⋯" menu beside Edit, not on the page. They are hidden from search and Home, nothing is deleted, and
// Restore brings them back. The "⋯" announces the popup and whether it is open (BR-REC-234).
export function MemberMoreMenu({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { Sheet, open: sheetOpen } = useLazySheet(loadConfirmSheet, confirmOpen, setConfirmOpen);
  const { mutate, isPending } = useArchiveMember(memberId);

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`More for ${fullName}`}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onPointerDown={preloadConfirmSheet}
              onFocus={preloadConfirmSheet}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto min-w-48 gap-1 p-1">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="justify-start"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
          >
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} aria-hidden="true" />
            {WORDS.archive}
          </Button>
        </PopoverContent>
      </Popover>
      {Sheet && (
        <Sheet
          open={sheetOpen}
          onOpenChange={setConfirmOpen}
          title={`Archive ${fullName}?`}
          description="They'll be hidden from search and Home. You can restore them later."
          confirmLabel="Archive"
          destructive
          pending={isPending}
          onConfirm={() => mutate(undefined, { onSuccess: () => setConfirmOpen(false) })}
        />
      )}
    </>
  );
}

// BR-REC-58: the Restore button always works, whatever the membership says. No confirmation (BR-REC-133).
function RestoreMemberButton({ memberId }: { memberId: string }) {
  const { mutate, isPending } = useRestoreMember(memberId);

  return (
    <Button type="button" variant="outline" size="lg" disabled={isPending} onClick={() => mutate()}>
      {isPending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {isPending ? UI_TEXT.saving : 'Restore'}
    </Button>
  );
}

// BR-REC-224: under the name, "18 y · Male · [Active] Annual · 98450 22171 · Joined 05 Oct 2026": the membership
// status in words (badge), the plan, the phone to tap and call, the join date. Grey shapes while loading.
export function MemberMeta({ memberId }: MemberBlockProps) {
  const { data: member, isError } = useMember(memberId);
  const today = useToday();

  // A failed read shows nothing here (the page's own blocks carry the retry), never a skeleton that never ends.
  if (!member && isError) return null;
  if (!member) {
    return <Skeleton aria-hidden="true" className="mt-1 h-5 w-72 max-w-full" />;
  }
  const status = membershipStatusText(member.membership, today);
  const parts = [
    `${member.age} y · ${SEX_LABELS[member.sex]}`,
    PLAN_LABELS[member.membership.plan],
  ];

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-base text-muted-foreground max-md:text-sm">
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      <span>{parts.join(' · ')}</span>
      <span aria-hidden="true">·</span>
      <a
        href={`tel:${member.phone}`}
        className="inline-flex min-h-tap items-center gap-1 font-medium text-foreground underline underline-offset-4"
      >
        <HugeiconsIcon icon={Call02Icon} strokeWidth={2} aria-hidden="true" className="size-4" />
        {formatPhone(member.phone)}
        <span className="sr-only"> (call)</span>
      </a>
      <span aria-hidden="true">·</span>
      <span>{`Joined ${formatDay(member.joinedOn)}`}</span>
    </p>
  );
}

const BANNER_TONE = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-neutral-soft text-neutral',
} as const;

// BR-REC-172: the first thing on the page of an archived member, with its words (when, and that the
// membership ended), an icon (never colour alone, BR-REC-125) and Restore.
function ArchivedBanner({ memberId, text }: { memberId: string; text: string }) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-base ${BANNER_TONE.neutral}`}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <HugeiconsIcon
          icon={InformationCircleIcon}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{text}</span>
      </p>
      <RestoreMemberButton memberId={memberId} />
    </div>
  );
}

// BR-REC-224: at most ONE banner under the name. An archived member: the archived line with Restore (BR-REC-172).
// Anyone else: the next step (`nextStepFor`): the most overdue assessment with [Record now] wins over a
// membership that ended or ends soon with [Renew]. Nothing is drawn until both reads have answered, so the
// banner never switches from one step to the other.
export function MemberBanner({ memberId }: MemberBlockProps) {
  const { data: member } = useMember(memberId);
  const due = useMemberDue(memberId);
  const today = useToday();
  const [renewOpen, setRenewOpen] = useState(false);

  if (!member) return null;
  if (member.archivedAt) {
    const text = memberBannerText(member, today, deviceTimeZone());
    return text ? <ArchivedBanner memberId={member.id} text={text} /> : null;
  }
  if (!due.data && !due.isError) return null;

  const overdue = mostOverdue(due.data ?? []);
  const step = nextStepFor({
    overdue,
    membershipStatus: member.membership.status,
    endOn: formatDay(member.membership.endOn),
  });
  if (!step) return null;

  const tone =
    step.kind === 'record' || member.membership.status === 'expired' ? 'danger' : 'warning';
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-base ${BANNER_TONE[tone]}`}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 font-medium">
        <HugeiconsIcon
          icon={Alert02Icon}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{step.text}</span>
      </p>
      {step.kind === 'record' && overdue ? (
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<Link href={recordHref(member.id, overdue.typeId)} />}
        >
          {NEXT_STEP_TEXT.record}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onPointerDown={preloadPeriodSheet}
            onFocus={preloadPeriodSheet}
            onClick={() => setRenewOpen(true)}
          >
            {NEXT_STEP_TEXT.renew}
          </Button>
          <PeriodSheet memberId={member.id} open={renewOpen} onOpenChange={setRenewOpen} />
        </>
      )}
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
// as one line of quiet text when there are some (BR-REC-225), and a "⋯" for the same choices as the lists (plus Remove reminder).
function MemberDueRow({
  memberId,
  line,
  today,
  onMore,
  openTarget,
}: {
  memberId: string;
  line: MemberDueItem;
  today: IsoDate;
  onMore: (target: DueTarget) => void;
  openTarget: DueTarget | null;
}) {
  const status = memberDueStatus(line, today);
  const turnedOn = useTurnedOnCounts();
  return (
    <ListRow
      title={line.typeName}
      status={<StatusBadge tone={status.tone}>{status.text}</StatusBadge>}
      trailing={
        <DueMoreButton
          name={line.typeName}
          onOpen={() => onMore(lineTarget(memberId, line))}
          expanded={isSheetOpenFor(openTarget, memberId, line.typeId)}
        />
      }
    >
      {line.items.length > 0 && (
        <span className="block text-sm text-muted-foreground">
          {dueItemsText(
            line.items.map((chip) => chip.name),
            turnedOn.get(line.typeId) ?? Number.POSITIVE_INFINITY,
          )}
        </span>
      )}
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
                  openTarget={sheet.openTarget}
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
