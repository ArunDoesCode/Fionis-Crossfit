import { UI_TEXT } from '@/lib/messages/words';

// Setup's own plain words (BR-REC-126): screen titles, row words, sheet labels, confirm texts and toasts.
// Rules word -> screen word is in ux.md "Word list": Assessment, Measurement, Number / Time, Higher is
// better / Lower is better / No direction, Repeat every, Due soon, Ends soon, Warn if lower than / Warn if higher than, Show in a group on the report card, Turn off.
// Shared `UI_TEXT` is only read here; server codes go through `messageForCode`.
export const SETUP_TEXT = {
  hub: {
    title: UI_TEXT.screens.settings,
    assessments: { title: 'Assessments', detail: 'What you measure and how often' },
    general: {
      title: UI_TEXT.screens.remindersAndGym,
      detail: 'Gym name, time zone and reminder days',
    },
    account: { title: UI_TEXT.screens.account, detail: 'Password and sign out' },
    export: { title: UI_TEXT.screens.exportData, detail: 'Download your records' },
    theme: {
      legend: 'Theme',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
  },

  general: {
    title: UI_TEXT.screens.remindersAndGym,
    gymSection: 'Gym',
    remindersSection: 'Reminders',
    gymName: 'Gym name',
    gymNameHint: 'Printed on report cards.',
    timezone: 'Time zone',
    timezoneHint: 'Decides what "today" means.',
    dueSoonDays: 'Due soon',
    endsSoonDays: 'Ends soon',
    dueSoonHint: 'An assessment shows as Due soon this many days before its date.',
    endsSoonHint: 'A membership shows as Ends soon this many days before it ends.',
    daysUnit: 'days',
    save: 'Save',
  },

  assessments: {
    title: UI_TEXT.screens.assessmentSetup,
    add: 'Add assessment',
    empty: 'No assessments yet.',
    edit: 'Edit',
    off: 'Off',
    moveUp: 'Move up',
    moveDown: 'Move down',
    notFound: 'This assessment was not found.',
    backToList: 'Back to assessments',
    addMeasurement: 'Add measurement',
    noMeasurements: 'No measurements yet.',
    offNote: 'This assessment is off. It is hidden from new entries and Home; results stay.',
  },

  assessmentSheet: {
    addTitle: 'Add assessment',
    editTitle: 'Edit assessment',
    name: 'Name',
    repeatEvery: 'Repeat every',
    weeksOrMonths: 'Weeks or months',
    weeks: 'Weeks',
    months: 'Months',
    on: 'On',
    onHint: 'Turn off to hide this assessment and its measurements. Results stay.',
  },

  measurementSheet: {
    addTitle: 'Add measurement',
    editTitle: 'Edit measurement',
    name: 'Name',
    kind: 'Kind',
    kindNumber: 'Number',
    kindTime: 'Time',
    kindLocked: 'Kind and unit are locked because this measurement already has results.',
    unit: 'Unit',
    timeUnit: 'Time is always shown as min:sec.',
    decimals: 'Decimals',
    better: 'Better',
    higher: 'Higher',
    lower: 'Lower',
    none: 'No direction',
    warnBelow: 'Warn if lower than',
    warnAbove: 'Warn if higher than',
    warnHint: 'A result outside this range shows "Please check" when it is recorded.',
    warnHintTime:
      'A result outside this range shows "Please check" when it is recorded. Use minutes and seconds.',
    repeatEvery: 'Repeat every',
    sameAsAssessment: 'Same as assessment',
    ownRepeat: 'Own repeat',
    ownRepeatNumber: 'Own repeat number',
    weeksOrMonths: 'Weeks or months',
    weeks: 'Weeks',
    months: 'Months',
    reportGroup: 'Show in a group on the report card',
    reportNone: 'None',
    reportPlace: 'In a group',
    group: 'Group',
    groupHint: 'For example Skeletal muscle %.',
    part: 'Part',
    on: 'On',
    onHint: 'Turn off to hide this measurement from new entries. Results stay.',
  },

  sheet: {
    save: 'Save',
  },

  confirm: {
    repeatTitle: 'Change the repeat?',
    repeatText: 'This changes due dates for all members.',
    repeatConfirm: 'Change repeat',
    betterTitle: 'Change which is better?',
    betterText: 'Best results and leaderboards will change for past results.',
    betterConfirm: 'Change it',
    bothTitle: 'Save these changes?',
    bothConfirm: 'Save changes',
  },

  toasts: {
    settingsSaved: 'Settings saved.',
    assessmentAdded: 'Assessment added.',
    measurementAdded: 'Measurement added.',
    changesSaved: 'Changes saved.',
    notSaved: "Couldn't save. Check your connection and try again.",
    notMoved: "Couldn't change the order. Check your connection and try again.",
  },
} as const;
