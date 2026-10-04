import { UI_TEXT, WORDS } from '@/lib/messages/words';

// Due list's own plain words (BR-REC-126): section empty lines, row-sheet choices, toasts. Rules word ->
// screen word is in ux.md "Word list": Upcoming -> Due soon, Flag -> Assess soon, Snooze -> Remind me later.
// Shared `UI_TEXT` / `WORDS` are only read here; server codes go through `messageForCode`.
export const DUE_TEXT = {
  /** One sentence when a section or list has nobody (BR-REC-101, 130). */
  empty: {
    overdue: 'Nobody is overdue.',
    soon: 'Nobody is due soon.',
  },
  /** The member page when no assessment is turned on. */
  noAssessments: 'No assessments yet.',

  /** S3 filter chip that shows every assessment. */
  all: 'All',
  assessmentFilter: 'Assessment',

  /** The row's "⋯" button: spoken name (BR-REC-137). */
  moreFor: (name: string): string => `More for ${name}`,

  sheet: {
    record: UI_TEXT.screens.recordAssessment,
    assessSoon: WORDS.assessSoon,
    removeAssessSoon: `Remove ${WORDS.assessSoon}`,
    remindMeLater: WORDS.remindMeLater,
    removeReminder: 'Remove reminder',
    openMember: 'Open member',
  },

  /** Second step of the sheet: Remind me later. */
  remind: {
    title: WORDS.remindMeLater,
    week: '1 week',
    twoWeeks: '2 weeks',
    month: '1 month',
    pickDate: 'Pick a date',
    dateLabel: 'Remind me on',
    set: 'Set reminder',
    back: 'Back',
    pickIssue: 'Pick a date.',
    afterTodayIssue: 'Pick a date after today.',
  },

  toasts: {
    markedAssessSoon: 'Marked Assess soon.',
    reminderSet: (day: string): string => `Reminder set for ${day}.`,
    removed: 'Removed.',
    /** A failed save that has no server code (offline, timeout): the change is undone. */
    notSaved: "Couldn't save this. Try again.",
  },
} as const;
