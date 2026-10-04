// Plain words of the assessment screens (BR-REC-126): the word list of ux.md, no ids, codes or technical
// terms. Fixed lines other code and tests rely on: `numberError`, `noValues`, `notSaved`.

export const ASSESSMENT_TEXT = {
  // Fixed lines
  numberError: 'Enter a number like 95.5', // BR-REC-76
  noValues: 'Enter at least one value', // BR-REC-78
  notSaved: 'Not saved — check the connection and tap Save again', // BR-REC-86

  // Header and date
  recordFor: (name: string) => `Record for ${name}`,
  date: 'Date',
  about: 'About',
  paperColumn: 'Paper column',
  datePick: 'Pick a date',
  editing: (day: string) => `Edit · ${day}`,

  // Choose assessment
  choosePrompt: 'Pick an assessment to record.',
  chooseButton: 'Choose assessment',
  chooseEmpty: 'No assessments are turned on. Turn one on in Settings.',
  noMeasurements: 'This assessment has no measurements turned on.',

  // Fields
  due: 'due',
  last: (value: string, day: string) => `Last ${value} · ${day}`,
  willBeRemoved: 'Will be removed',
  pleaseCheck: 'Please check',
  lastTime: (value: string) => `last time ${value}`,
  usuallyBetween: (low: string, high: string) => `usually between ${low} and ${high}`,
  usuallyAtLeast: (low: string) => `usually at least ${low}`,
  usuallyAtMost: (high: string) => `usually at most ${high}`,
  down: 'Down',
  up: 'Up',

  // Buttons
  save: 'Save',
  saveNextDate: 'Save & next date',

  // Check these values
  checkValuesTitle: 'Check these values',
  checkValuesBody: 'These look unusual. Go back to change them, or save them as typed.',
  goBack: 'Go back',
  saveAnyway: 'Save anyway',

  // Draft (BR-REC-85) and a saved assessment on the picked date (BR-REC-74)
  restoreQuestion: (time: string) => `Restore unsaved results from ${time}?`,
  restore: 'Restore',
  discard: 'Discard',
  savedQuestion: (day: string) => `Results are already saved for ${day}. Open the saved one?`,
  open: 'Open',
  keepMine: 'Keep mine',

  // Leave question (BR-REC-90)
  leaveTitle: 'Leave without saving?',
  leaveBody: 'Your entries stay as a draft.',
  stay: 'Stay',
  leave: 'Leave',
} as const;
