'use client';

import { useWatch } from 'react-hook-form';
import type { PeriodFormControl } from '@/components/pages/members/memberFormControl';
import type { IsoDate } from '@/lib/domain/dates';
import { entryEnd, renewRestoresMember } from '@/lib/members/renew';

interface RestoreNoteProps {
  control: PeriodFormControl;
  fullName: string;
  today: IsoDate;
  /** "Renewing" on the Renew sheet, "Saving" on Edit membership. */
  verb: 'Renewing' | 'Saving';
}

// BR-REC-58 (Q7 = B): saving a membership that covers today brings an archived member back to the list.
// The sheet says so before the trainer taps Renew; an old binder entry (all in the past) or a later start
// never does, and then the line is not shown. It is only drawn for an archived member.
export default function RestoreNote({ control, fullName, today, verb }: RestoreNoteProps) {
  const [plan, startOn] = useWatch({ control, name: ['plan', 'startOn'] });
  const end = entryEnd(plan, startOn);
  const restores = end !== null && renewRestoresMember(true, { startOn, endOn: end }, today);

  return (
    <p aria-live="polite" className="min-h-6 text-base font-medium">
      {restores && `${verb} brings ${fullName} back to the list.`}
    </p>
  );
}
