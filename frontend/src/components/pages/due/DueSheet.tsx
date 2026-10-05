'use client';

import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useRef, useState } from 'react';
import DatePicker from '@/components/common/DatePicker';
import { FormControl, FormItem, FormMessage } from '@/components/common/form';
import LinkButton from '@/components/common/LinkButton';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { useClearDueAction, useSetDueAction } from '@/lib/api/due/queries';
import { addDays } from '@/lib/domain/dates';
import { memberHref, recordHref } from '@/lib/due/links';
import { REMIND_MAX_DAYS, remindChoices, remindDateIssue } from '@/lib/due/remind';
import type { DueTarget } from '@/lib/due/target';
import { DUE_TEXT } from '@/lib/due/text';
import { formatDay } from '@/lib/format';
import { useToday } from '@/lib/members/useToday';

export interface DueSheetProps {
  /** The row the sheet was opened from; it stays set while the sheet closes. */
  target: DueTarget | null;
  /** Counts the opens: every open starts on the first step. */
  session: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface View {
  session: number;
  step: 'menu' | 'remind';
  /** "Pick a date" is open (the date field and "Set reminder" show). */
  picking: boolean;
  until: string;
  /** "Set reminder" was tapped: an empty or wrong date now says why. */
  attempted: boolean;
}

const freshView = (session: number): View => ({
  session,
  step: 'menu',
  picking: false,
  until: '',
  attempted: false,
});

const CHOICE = 'w-full justify-start';
const DATE_ID = 'due-remind-date';

// The row sheet (BR-REC-100, 102, 138; C12): Record assessment · Assess soon (or Remove Assess soon) ·
// Remind me later › · Remove reminder (when one is on) · Open member. "Remind me later" is a second step of
// the SAME sheet (1 week, 2 weeks, 1 month, Pick a date): one sheet means one Back entry, and a second sheet
// on top would break Back (useBackToClose is not stack-aware, #18). No confirmation for any choice
// (BR-REC-133): a choice does its work, closes the sheet, and the list changes at once (perf tactic 8).
// "Record assessment" and "Open member" replace the sheet's own history entry, so Back from the next screen
// lands on this one and not on the sheet.
export default function DueSheet({ target, session, open, onOpenChange }: DueSheetProps) {
  const today = useToday();
  const setDue = useSetDueAction();
  const clearDue = useClearDueAction();
  const [stored, setStored] = useState<View>(() => freshView(session));
  const view = stored.session === session ? stored : freshView(session);
  if (stored.session !== session) setStored(view);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(view.step);

  // Moving between the two steps swaps the buttons under the finger: focus goes to the first choice of the
  // new step (Back lands on "Remind me later" again).
  useEffect(() => {
    if (previousStep.current === view.step) return;
    previousStep.current = view.step;
    bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [view.step]);

  if (!target) return null;
  const { memberId, typeId } = target;
  const update = (patch: Partial<View>) => setStored({ ...view, ...patch });
  const done = () => onOpenChange(false);

  const flag = () => {
    setDue.mutate({ memberId, typeId, action: 'flag' });
    done();
  };
  const remove = () => {
    clearDue.mutate({ memberId, typeId });
    done();
  };
  const remind = (until: string) => {
    setDue.mutate({ memberId, typeId, action: 'snooze', until });
    done();
  };

  const issue = remindDateIssue(view.until, today);
  const shownIssue = view.attempted || view.until !== '' ? (issue ?? undefined) : undefined;
  const setReminder = () => {
    if (issue) {
      update({ attempted: true });
      document.getElementById(DATE_ID)?.focus();
      return;
    }
    remind(view.until);
  };

  const footer =
    view.step === 'remind' ? (
      <>
        <Button
          type="button"
          variant="secondary"
          onClick={() => update({ step: 'menu', picking: false })}
        >
          {DUE_TEXT.remind.back}
        </Button>
        {view.picking && (
          <Button type="button" onClick={setReminder}>
            {DUE_TEXT.remind.set}
          </Button>
        )}
      </>
    ) : undefined;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={target.title}
      description={view.step === 'remind' ? DUE_TEXT.remind.title : target.detail}
      footer={footer}
    >
      <div ref={bodyRef} className="flex flex-col gap-2">
        {view.step === 'menu' ? (
          <>
            <LinkButton
              replace
              variant="secondary"
              className={CHOICE}
              href={recordHref(memberId, typeId)}
            >
              {DUE_TEXT.sheet.record}
            </LinkButton>
            {target.flagged ? (
              <Button type="button" variant="secondary" className={CHOICE} onClick={remove}>
                {DUE_TEXT.sheet.removeAssessSoon}
              </Button>
            ) : (
              <Button type="button" variant="secondary" className={CHOICE} onClick={flag}>
                {DUE_TEXT.sheet.assessSoon}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className={CHOICE}
              data-autofocus
              onClick={() => update({ step: 'remind' })}
            >
              {DUE_TEXT.sheet.remindMeLater}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                aria-hidden="true"
                className="ml-auto"
              />
            </Button>
            {target.snoozedUntil && (
              <Button type="button" variant="secondary" className={CHOICE} onClick={remove}>
                {DUE_TEXT.sheet.removeReminder}
              </Button>
            )}
            {target.openMember && (
              <LinkButton
                replace
                variant="secondary"
                className={CHOICE}
                href={memberHref(memberId)}
              >
                {DUE_TEXT.sheet.openMember}
              </LinkButton>
            )}
          </>
        ) : (
          <>
            {remindChoices(today).map((choice, index) => (
              <Button
                key={choice.label}
                type="button"
                variant="secondary"
                className={CHOICE}
                data-autofocus={index === 0 ? true : undefined}
                onClick={() => remind(choice.until)}
              >
                {choice.label}
                <span className="ml-auto font-normal text-muted-foreground">
                  {formatDay(choice.until)}
                </span>
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              className={CHOICE}
              aria-expanded={view.picking}
              onClick={() => update({ picking: !view.picking })}
            >
              {DUE_TEXT.remind.pickDate}
            </Button>
            {view.picking && (
              <FormItem error={shownIssue || undefined}>
                <FormControl>
                  <DatePicker
                    id={DATE_ID}
                    variant="inline"
                    label={DUE_TEXT.remind.dateLabel}
                    value={view.until}
                    today={today}
                    min={addDays(today, 1)}
                    max={addDays(today, REMIND_MAX_DAYS)}
                    onChange={(until) => update({ until })}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          </>
        )}
      </div>
    </ResponsiveSheet>
  );
}
