import { formatDuration } from '@/lib/domain/duration';
import { formatDay, formatValue } from '@/lib/format';
import { UI_TEXT, WORDS } from '@/lib/messages/words';
import type { AgeBand } from './filters';

// The progress screens' own plain words (BR-REC-126) and the pure number and date texts (BR-REC-22, 106,
// 111, 113, 127). Shared `UI_TEXT` and `WORDS` are only read here; server codes go through `messageForCode`.
export const PROGRESS_TEXT = {
  report: {
    title: UI_TEXT.screens.reportCard,
    print: 'Print',
    printed: 'Printed',
    joined: 'Joined',
    notFound: 'This member was not found.',
    empty: 'No results recorded yet.',
    measurement: 'Measurement',
    first: 'First',
    latest: 'Latest',
    best: 'Best',
    change: 'Change',
    trend: 'Trend',
    firstShort: 'first',
    bestShort: 'best',
    oneReading: '(1 reading)',
    segmental: 'Segmental',
    bodyPart: 'Body part',
    /** Shown in a table cell with no value (BR-REC-108). */
    noValue: '–',
    parts: { whole_body: 'Whole body', arms: 'Arms', trunk: 'Trunk', legs: 'Legs' },
    status: { active: 'Active', expiring: WORDS.endsSoon, expired: WORDS.ended },
    age: 'y',
    trendLabel: (count: number, from: string, to: string): string =>
      `Trend of the last ${count} readings, from ${from} to ${to}`,
  },
  /** The words after a change ("↓ 4.0 kg better") and for a change that shows as zero. */
  change: { better: 'better', worse: 'worse', none: 'No change' },
  progress: {
    title: UI_TEXT.screens.gymProgress,
    measurement: 'Measurement',
    pickMeasurement: 'Pick a measurement',
    turnedOff: 'turned off',
    joinedFrom: 'Joined from',
    joinedTo: 'Joined to',
    plan: 'Plan',
    sex: 'Sex',
    age: 'Age',
    anyPlan: 'Any plan',
    anySex: 'Any sex',
    anyAge: 'Any age',
    averageChange: 'Average change',
    sinceFirst: 'since the first reading',
    improved: 'Improved',
    noChange: 'No change',
    worse: 'Worse',
    notEnough: 'Not enough results yet. A member needs two to be counted.',
    noMeasurements: 'No measurements are turned on yet.',
    leaderboard: 'Leaderboard',
    male: 'Male',
    female: 'Female',
    showMore: 'Show more',
    nobodyRanked: 'Nobody has a result yet.',
    activeByPlan: 'Active members by plan',
    total: 'Total',
  },
  export: {
    title: UI_TEXT.screens.exportData,
    download: 'Download CSV',
    starting: 'Starting…',
    hint: 'Opens in Excel or Google Sheets',
    members: 'Members',
    memberships: 'Memberships',
    measurements: 'Measurements',
  },
} as const;

/** BR-REC-114: the age bands on screen (en dash in the ranges). */
export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under20: 'Under 20',
  '20to29': '20–29',
  '30to39': '30–39',
  '40to49': '40–49',
  '50to59': '50–59',
  '60plus': '60+',
};

/** What the number texts need to know about a measurement. */
export interface ValueMetric {
  datatype: 'number' | 'duration';
  decimals: number;
  unit: string;
  better: 'higher' | 'lower' | 'none';
}

const MINUS = '−'; // U+2212

const decimalsOf = (decimals: number): 0 | 1 | 2 => (decimals >= 2 ? 2 : decimals >= 1 ? 1 : 0);

/** "94.0 kg", "24.0 %"; a time is "4:10" to the nearest second, and never gets its unit. */
export const valueText = (value: number, metric: ValueMetric): string =>
  metric.datatype === 'duration'
    ? formatDuration(Math.round(value))
    : formatValue(value, decimalsOf(metric.decimals), metric.unit);

/** A value that is written as zero at the measurement's precision shows no sign ("−0.0 kg" never appears). */
const showsAsZero = (value: number, metric: ValueMetric): boolean => {
  const size = Math.abs(value);
  return metric.datatype === 'duration'
    ? Math.round(size) === 0
    : Number(formatValue(size, decimalsOf(metric.decimals), '')) === 0;
};

/** "+0.5 cm", "−4.0 kg", "+1:10"; zero at the precision shown is plain `valueText(0)`. */
export const signedValueText = (value: number, metric: ValueMetric): string => {
  if (showsAsZero(value, metric)) return valueText(0, metric);
  return `${value > 0 ? '+' : MINUS}${valueText(Math.abs(value), metric)}`;
};

/**
 * The change line of a measurement (BR-REC-22, 106, 107): nothing under two readings, "No change" when it
 * shows as zero, the signed change for "No direction", else an arrow, the size and better / worse.
 */
export const changeText = (change: number | null, metric: ValueMetric): string | null => {
  if (change === null) return null;
  if (showsAsZero(change, metric)) return PROGRESS_TEXT.change.none;
  if (metric.better === 'none') return signedValueText(change, metric);
  const up = change > 0;
  const good = metric.better === 'higher' ? up : !up;
  const word = good ? PROGRESS_TEXT.change.better : PROGRESS_TEXT.change.worse;
  return `${up ? '↑' : '↓'} ${valueText(Math.abs(change), metric)} ${word}`;
};

/** "12 Sep" / "12 Dec 2025" for a measured day; "≈ Dec 2025" when estimated (BR-REC-108, 127). */
export const readingDateText = (on: string, isEstimated: boolean, today: string): string => {
  if (!isEstimated) return formatDay(on, today);
  const month = formatDay(on, on).split(' ')[1]; // same year as itself: "12 Dec"
  return month ? `≈ ${month} ${on.slice(0, 4)}` : on;
};

/** "3 Oct 2026": always with the year (the printed date). */
export const fullDayText = (on: string): string => `${formatDay(on, on)} ${on.slice(0, 4)}`;

interface Outcomes {
  improved: number;
  noChange: number;
  worse: number;
}

/** Whole percents of the three outcomes that add up to 100 (largest remainder; ties: improved, noChange, worse). */
export const outcomeShares = (counts: Outcomes): Outcomes => {
  const total = counts.improved + counts.noChange + counts.worse;
  if (total === 0) return { improved: 0, noChange: 0, worse: 0 };
  const keys = ['improved', 'noChange', 'worse'] as const;
  const parts = keys.map((key) => ({
    key,
    whole: Math.floor((counts[key] * 100) / total),
    rest: (counts[key] * 100) % total,
  }));
  const spare = 100 - parts.reduce((sum, part) => sum + part.whole, 0);
  const byRest = [...parts].sort((a, b) => b.rest - a.rest); // stable: ties keep the order above
  const shares: Outcomes = { improved: 0, noChange: 0, worse: 0 };
  for (const part of parts) {
    shares[part.key] = part.whole + (byRest.indexOf(part) < spare ? 1 : 0);
  }
  return shares;
};

/** BR-REC-113: "n = 12 · 5 with one reading not counted"; "n = 12" when nobody was left out. */
export const notCountedText = (n: number, notCounted: number): string =>
  notCounted > 0 ? `n = ${n} · ${notCounted} with one reading not counted` : `n = ${n}`;
