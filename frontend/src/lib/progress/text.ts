import { formatDuration } from '@/lib/domain/duration';
import { formatDay, formatMonthYear, formatValue } from '@/lib/format';
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
    firstReading: 'First reading',
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
    improved: 'Improved',
    noChange: 'No change',
    worse: 'Worse',
    notEnough: 'Not enough results yet. A member needs two to be counted.',
    noMeasurements: 'No measurements are turned on yet.',
    leaderboard: 'Leaderboard',
    /** BR-REC-228: the title names the measurement. */
    leaderboardFor: (measurementName: string): string => `${measurementName} leaderboard`,
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

/** "12 Sep 2026" for a measured day; "≈ Dec 2025" when estimated (BR-REC-108, 127, 191). */
export const readingDateText = (on: string, isEstimated: boolean, _today?: string): string =>
  isEstimated ? `≈ ${formatMonthYear(on)}` : formatDay(on);

/** "03 Oct 2026": the printed date. */
export const fullDayText = (on: string): string => formatDay(on);

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

/**
 * BR-REC-113 / 228: "Based on 12 members (5 more have only one reading)"; with nobody left out just
 * "Based on 12 members" (the bracket is dropped, 1 left out reads "1 more has only one reading").
 */
export const notCountedText = (n: number, notCounted: number): string => {
  const base = `Based on ${n} ${n === 1 ? 'member' : 'members'}`;
  if (notCounted <= 0) return base;
  const left =
    notCounted === 1 ? '1 more has only one reading' : `${notCounted} more have only one reading`;
  return `${base} (${left})`;
};

/** BR-REC-228: the headline of Reports, "17 of 20 members improved Body fat since their first reading". */
export const improvedHeadline = (
  improved: number,
  total: number,
  measurementName: string,
): string =>
  `${improved} of ${total} members improved ${measurementName} since their first reading`;

/**
 * BR-REC-228: "Body fat down 2.0 % on average · better". The better / worse word follows the measurement's
 * direction and is left out when it has none; a change that shows as zero is "unchanged".
 */
export const averageChangeText = (
  measurementName: string,
  change: number,
  metric: ValueMetric,
): string => {
  if (showsAsZero(change, metric)) return `${measurementName} unchanged on average`;
  const up = change > 0;
  const base = `${measurementName} ${up ? 'up' : 'down'} ${valueText(Math.abs(change), metric)} on average`;
  if (metric.better === 'none') return base;
  const good = metric.better === 'higher' ? up : !up;
  return `${base} · ${good ? PROGRESS_TEXT.change.better : PROGRESS_TEXT.change.worse}`;
};

/** BR-REC-229: a measurement with one reading, "First reading · 81.7 kg" (never dashes). */
export const firstReadingText = (value: number, metric: ValueMetric): string =>
  `${PROGRESS_TEXT.report.firstReading} · ${valueText(value, metric)}`;
