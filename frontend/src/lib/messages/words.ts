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
  about: 'About', // estimated (shown with ≈)
  pleaseCheck: 'Please check', // plausibility warning
  turnOff: 'Turn off', // deactivate
  archive: 'Archive (hide)',
} as const;

export const DEFAULT_GYM_NAME = 'Fionis CrossFit';

/** Plain strings the shared shell and components show (BR-REC-126, 129, 131, 132). */
export const UI_TEXT = {
  nav: { home: 'Home', members: 'Members', reports: 'Reports', settings: 'Settings' },
  signOut: 'Sign out',
  back: 'Back',
  close: 'Close',
  cancel: 'Cancel',
  tryAgain: 'Try again',
  loadError: "Couldn't load this.",
  loading: 'Loading…',
  saving: 'Saving…',
  seeAll: 'See all',
  search: 'Search',
  clearSearch: 'Clear search',
  minutes: 'min',
  seconds: 'sec',
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

/** What a screen reader says after the visible "+3" chip. */
export const andMore = (count: number): string => `and ${count} more`;

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
