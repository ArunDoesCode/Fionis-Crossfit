import { SETUP_TEXT } from '@/lib/setup/text';
import type { Better, Datatype, IntervalUnit, TablePart } from '@/lib/validators/setup';

// Pure words and rules for the setup screens (no DOM, no clock). Screen words follow the word list of
// ux.md (BR-REC-126): Higher is better / Lower is better / No direction, Number / Time (min:sec).

/** An own repeat (measurement) or the assessment's repeat; both parts are empty when there is none. */
export interface Repeat {
  intervalCount: number | null;
  intervalUnit: IntervalUnit | null;
}

const unitWord = (count: number, unit: IntervalUnit): string => (count === 1 ? unit : `${unit}s`);

/** "Every 1 month", "Every 2 months", "Every 3 weeks" (BR-REC-13). */
export const intervalLabel = (count: number, unit: IntervalUnit): string =>
  `Every ${count} ${unitWord(count, unit)}`;

/** "Repeat every 3 months": the line on the detail screen and under a measurement with its own repeat. */
export const repeatLine = (count: number, unit: IntervalUnit): string =>
  `Repeat every ${count} ${unitWord(count, unit)}`;

const BETTER_LABELS: Record<Better, string> = {
  higher: 'Higher is better',
  lower: 'Lower is better',
  none: 'No direction',
};

export const betterLabel = (better: Better): string => BETTER_LABELS[better];

const DATATYPE_LABELS: Record<Datatype, string> = {
  number: 'Number',
  duration: 'Time (min:sec)',
};

export const datatypeLabel = (datatype: Datatype): string => DATATYPE_LABELS[datatype];

const TABLE_PART_LABELS: Record<TablePart, string> = {
  whole_body: 'Whole body',
  arms: 'Arms',
  trunk: 'Trunk',
  legs: 'Legs',
};

export const tablePartLabel = (part: TablePart): string => TABLE_PART_LABELS[part];

/** The detail line of a measurement row: "kg · Lower is better" (a blank unit, like BMI's, is left out). */
export const measurementDetail = (metric: { unit: string; better: Better }): string =>
  [metric.unit, betterLabel(metric.better)].filter((part) => part !== '').join(' · ');

/** BR-REC-70: a changed repeat (number or unit, an own repeat set or cleared) asks first. */
export const intervalChangeNeedsConfirm = (before: Repeat, after: Repeat): boolean =>
  before.intervalCount !== after.intervalCount || before.intervalUnit !== after.intervalUnit;

/** BR-REC-71: only a changed "better" on a measurement that already has results asks first. */
export const betterChangeNeedsConfirm = (
  current: { better: Better; hasValues: boolean },
  newBetter: Better,
): boolean => current.hasValues && newBetter !== current.better;

/**
 * BR-REC-67: "Move up / Move down" swaps an item with its neighbour. Returns a new list; at the first or
 * last place (or an index outside the list) the copy is equal to the input.
 */
export function moveItem<T>(ids: readonly T[], index: number, direction: 'up' | 'down'): T[] {
  const copy = [...ids];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (!Number.isInteger(index) || index < 0 || index >= copy.length) return copy;
  if (target < 0 || target >= copy.length) return copy;
  const moved = copy[index] as T;
  copy[index] = copy[target] as T;
  copy[target] = moved;
  return copy;
}

/**
 * The words of the one confirmation before saving (BR-REC-133): a changed repeat, a changed "better" on a
 * measurement with results, or both (one question, both sentences).
 */
export function confirmCopy(changes: { repeat: boolean; better: boolean }): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  const text = SETUP_TEXT.confirm;
  if (changes.repeat && changes.better) {
    return {
      title: text.bothTitle,
      description: `${text.repeatText} ${text.betterText}`,
      confirmLabel: text.bothConfirm,
    };
  }
  if (changes.better) {
    return {
      title: text.betterTitle,
      description: text.betterText,
      confirmLabel: text.betterConfirm,
    };
  }
  return {
    title: text.repeatTitle,
    description: text.repeatText,
    confirmLabel: text.repeatConfirm,
  };
}
