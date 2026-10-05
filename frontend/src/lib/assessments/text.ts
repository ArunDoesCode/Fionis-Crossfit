// Plain words of the assessment screens (BR-REC-126): the word list of ux.md, no ids, codes or technical
// terms. Fixed lines other code and tests rely on: `numberError`, `noValues`, `notSaved`.

import { UI_TEXT } from '@/lib/messages/words';

export const ASSESSMENT_TEXT = {
  // Fixed lines
  numberError: 'Enter a number like 95.5', // BR-REC-76
  noValues: UI_TEXT.needOneValue, // BR-REC-78
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

  // All assessments (S11) and the member page's Recent block (BR-REC-80, 87, 88, 89; D18)
  noAssessments: 'No assessments yet.',
  nothingFor: (name: string) => `Nothing recorded for ${name} yet.`,
  nothingForThis: 'Nothing recorded for this assessment yet.',
  filterLegend: 'Assessment',
  filterAll: 'All',
  noSavedResults: 'No results are saved on this assessment.',
  deleteButton: 'Delete',
  deleteConfirm: 'Delete assessment',
  deleteQuestion: (name: string, day: string) => `Delete ${name} from ${day}?`,
  deleteBody: (results: string) => `${results} will be removed.`,
  deleting: 'Deleting…',
  notDeleted: 'Not deleted — check the connection and try again.',

  // Toasts, counts and status lines built in code (R-8): every word of the screens lives here
  saved: 'Saved.',
  deleted: 'Deleted.',
  savedResults: (results: string, name: string) => `Saved ${results} for ${name}`,
  resultCount: (count: number) => `${count} ${count === 1 ? 'result' : 'results'}`,
  noChange: 'No change',
  beforeJoin: (name: string, day: string) => `This is before ${name} joined (${day})`,
  dayCount: (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`,
  overdue: (days: string) => `Overdue ${days}`,
  dueToday: 'Due today',
  dueTomorrow: 'Due tomorrow',
  dueIn: (days: string) => `Due in ${days}`,
  nextDue: (day: string) => `Next due ${day}`,
  neverRecorded: 'Never recorded',
  reminderOn: (day: string) => `Reminder on ${day}`,
} as const;
