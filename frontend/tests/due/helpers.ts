// Shared fixtures for the due-list admin tests (docs/specs/member-records/due-list.md v2).
// Shapes are the spec's: docs/specs/member-records/due-list.md (E31 `DueListItem`,
// E32 `MemberDueItem`, `DueChange`). They are written out here so the tests do not
// depend on where the app keeps its own copies of the types.

/** The spec's worked-example day: "today 2026-10-03" (due-list.md, Due examples). */
export const TODAY = '2026-10-03';

export type IsoDate = string;
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type DueTab = 'overdue' | 'soon';
export type DueListStatus = 'overdue' | 'upcoming';

export interface DueItem {
  metricId: string;
  name: string;
}

/** E31 `data[]`. */
export interface DueListItem {
  memberId: string;
  fullName: string;
  typeId: string;
  typeName: string;
  dueOn: IsoDate;
  daysOverdue: number;
  flagged: boolean;
  items: DueItem[];
}

/** E32 `data[]`. */
export interface MemberDueItem {
  typeId: string;
  typeName: string;
  state: 'overdue' | 'upcoming' | 'ok';
  neverRecorded: boolean;
  nextDueOn: IsoDate;
  daysOverdue: number;
  flagged: boolean;
  snoozedUntil: IsoDate | null;
  items: DueItem[];
}

/** docs/specs/member-records/due-list.md -> `lib/due/optimistic.ts`. */
export interface DueChange {
  memberId: string;
  typeId: string;
  action: 'flag' | 'snooze' | 'clear';
  until?: IsoDate;
}

export interface Status {
  text: string;
  tone: StatusTone;
}

/** A valid-looking v4 uuid per number, so every id in a test is distinct and readable. */
export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const MEMBER_SURYA = uuid(1);
export const MEMBER_ANITA = uuid(2);
export const MEMBER_RAVI = uuid(3);
export const MEMBER_ZED = uuid(4);

export const TYPE_BODY = uuid(101);
export const TYPE_FITNESS = uuid(102);

export const item = (n: number, name: string): DueItem => ({ metricId: uuid(1000 + n), name });

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `from` to `to` (independent of the app's own date helpers). */
export const daysFromTo = (from: IsoDate, to: IsoDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/**
 * One E31 row. `daysOverdue` follows `dueOn` and the spec's "today" (BR-REC-105: calendar days from the due
 * date to today) unless a test sets it.
 */
export function dueRow(over: Partial<DueListItem> = {}): DueListItem {
  const dueOn = over.dueOn ?? '2026-09-30';
  return {
    memberId: MEMBER_SURYA,
    fullName: 'Surya Pratap',
    typeId: TYPE_BODY,
    typeName: 'Body composition',
    dueOn,
    daysOverdue: daysFromTo(dueOn, TODAY),
    flagged: false,
    items: [item(1, 'Weight'), item(2, 'Body fat')],
    ...over,
  };
}

/** One E32 line. */
export function memberLine(over: Partial<MemberDueItem> = {}): MemberDueItem {
  const nextDueOn = over.nextDueOn ?? '2026-12-12';
  return {
    typeId: TYPE_BODY,
    typeName: 'Body composition',
    state: 'ok',
    neverRecorded: false,
    nextDueOn,
    daysOverdue: daysFromTo(nextDueOn, TODAY),
    flagged: false,
    snoozedUntil: null,
    items: [],
    ...over,
  };
}

/** Freezes a value and everything inside it, so any write to it throws (ES modules run in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** A deep copy that is safe to compare against later (no shared references). */
export const clone = <T>(value: T): T => structuredClone(value);

/**
 * The words BR-REC-126 keeps off screen (same list the setup tests use, plus the due-list words
 * "flag" and "snooze" and "upcoming"): no technical words, no codes, no field names.
 */
export const FORBIDDEN_WORDS: Array<[string, RegExp]> = [
  ['"metric"', /\bmetrics?\b/i],
  ['"datatype" / "data type"', /\bdata ?types?\b/i],
  ['"interval"', /\bintervals?\b/i],
  ['"snooze"', /\bsnooze[sd]?\b/i],
  ['"flag"', /\bflag(s|ged)?\b/i],
  ['"payload"', /\bpayload\b/i],
  ['"deactivate" (say "Turn off")', /\bdeactivat\w*/i],
  ['"assessment type" (say "Assessment")', /\bassessment types?\b/i],
  ['"upcoming" (say "Due soon")', /\bupcoming\b/i],
  ['"expiring" / "expired" (say "Ends soon" / "Ended")', /\bexpir(ing|ed)\b/i],
];

/** A server code (`SNOOZE_TOO_FAR`) or a field name (`upcomingLeadDays`, `typeId`) must never reach the screen. */
export const TECHNICAL_TEXT =
  /\b[A-Z]{2,}(?:_[A-Z]{2,})+\b|\b[a-z]+[A-Z][A-Za-z]*(?:Days|Count|Unit|Id|Ids|On)\b/;

export function forbiddenIn(texts: string[]): string[] {
  return texts.filter(
    (text) =>
      FORBIDDEN_WORDS.some(([, pattern]) => pattern.test(text)) || TECHNICAL_TEXT.test(text),
  );
}
