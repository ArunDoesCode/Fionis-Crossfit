// Word list (ux.md "Word list", BR-REC-126): screens use only these words, never ids, codes or
// technical terms ("metric", "datatype", "interval", "snooze", "flag", "payload"). English only (Q3).
// Server error codes are mapped in `errors.ts`; this file holds the words and the fixed lines.

/** Rules word → screen word. Keys are what the code calls it; values are what the screen says. */
export const WORDS = {
  assessment: 'Assessment', // assessment type
  measurement: 'Measurement', // metric
  number: 'Number', // datatype number
  time: 'Time (min:sec)', // datatype duration
  higherIsBetter: 'Higher is better',
  lowerIsBetter: 'Lower is better',
  noDirection: 'No direction',
  repeatEvery: 'Repeat every', // interval
  dueSoon: 'Due soon', // Upcoming
  assessSoon: 'Assess soon', // Flag
  remindMeLater: 'Remind me later', // Snooze
  endsSoon: 'Ends soon', // Expiring
  ended: 'Ended', // Expired
  membership: 'Membership', // period
  pleaseCheck: 'Please check', // plausibility warning
  turnOff: 'Turn off', // deactivate
  archive: 'Archive (hide)',
} as const;

export const DEFAULT_GYM_NAME = 'Fionis CrossFit';

/** Plain strings the shared shell and components show (BR-REC-126, 129, 131, 132). */
export const UI_TEXT = {
  nav: { home: 'Home', members: 'Members', reports: 'Reports', settings: 'Settings' },
  signIn: 'Sign in',
  signOut: 'Sign out',
  back: 'Back',
  close: 'Close',
  cancel: 'Cancel',
  tryAgain: 'Try again',
  loadError: "Couldn't load this.",
  loading: 'Loading…',
  saving: 'Saving…',
  approximateDate: 'Approximate date', // Record assessment tick: the date is estimated (BR-REC-79, 216)
  needOneValue: 'Enter at least one value', // Record assessment, Save with nothing entered (BR-REC-78, 190)
  seeAll: 'See all',
  search: 'Search',
  searchMembers: 'Search members',
  clearSearch: 'Clear search',
  minutes: 'min',
  minutesBox: 'Minutes', // screen-reader name of the minutes box of a Time field
  secondsBox: 'Seconds',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  clear: 'Clear',
  anyMonth: 'Any month',
  searchTimeZones: 'Search time zones',
  noTimeZone: 'No time zone found.',
  seconds: 'sec',
  makeNegative: 'Make negative', // NumberField ± button, text has no minus
  makePositive: 'Make positive', // NumberField ± button, text starts with a minus
  minutesRange: 'Enter minutes from 0 to 599', // DurationField, minutes box out of range (BR-REC-75)
  secondsRange: 'Enter seconds from 0 to 59', // DurationField, seconds box out of range (BR-REC-75)
  offline: "You're offline — changes can't be saved right now",
  placeholderScreen: 'This screen is not built yet.',
  sections: {
    overdue: 'Overdue',
    dueSoon: WORDS.dueSoon,
    membershipsEnding: 'Memberships ending',
    recentlyEnded: 'Recently ended',
    membership: WORDS.membership,
    assessments: 'Assessments',
    recent: 'Recent',
  },
  screens: {
    member: 'Member',
    members: 'Members',
    addMember: 'Add member',
    editMember: 'Edit member',
    dueList: 'Due list',
    membershipsEnding: 'Memberships ending',
    recordAssessment: 'Record assessment',
    allAssessments: 'All assessments',
    reportCard: 'Report card',
    gymProgress: 'Gym progress',
    settings: 'Settings',
    assessmentSetup: 'Assessment setup',
    remindersAndGym: 'Reminders & gym',
    account: 'Account',
    exportData: 'Export data',
    edit: 'Edit',
  },
} as const;

/** The two fixed lines of the word list; inputs are already-formatted days (BR-REC-127). */
export const FIXED_LINES = {
  /** Sign-in locked (auth BR-REC-29); never says which part was wrong. */
  signInLocked: (minutes: number): string =>
    `Too many wrong tries, so sign-in is paused. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,

  /**
   * Banner at the top of an archived member or one whose membership ended (members BR-REC-172):
   * "Archived 2 Jun 2026 · Membership ended 31 May 2026"; the archived part only when archived,
   * "ends" instead of "ended" while the membership still runs.
   */
  archivedEndedBanner: (input: {
    archivedOn: string | null;
    membershipEndOn: string;
    membershipEnded: boolean;
  }): string => {
    const membership = `${WORDS.membership} ${input.membershipEnded ? 'ended' : 'ends'} ${input.membershipEndOn}`;
    return input.archivedOn ? `Archived ${input.archivedOn} · ${membership}` : membership;
  },
} as const;
