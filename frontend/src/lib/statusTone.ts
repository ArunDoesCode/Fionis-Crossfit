// BR-REC-185: the one map from a status to its badge tone. Screens and lib code pick a key; only
// `StatusBadge` turns a tone into colour and icon.
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_BY_KEY = {
  overdue: 'danger',
  soon: 'warning',
  ending: 'warning',
  active: 'success',
  done: 'success',
  reminder: 'info',
  estimated: 'info',
  neverRecorded: 'neutral',
  ended: 'neutral',
  archived: 'neutral',
} as const satisfies Record<string, StatusTone>;

export type StatusKey = keyof typeof TONE_BY_KEY;

export const toneFor = (key: StatusKey): StatusTone => TONE_BY_KEY[key];
