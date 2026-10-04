// Spec: docs/specs/member-records/setup.md (v2) and docs/specs/member-records/ux.md (word list)
//   BR-REC-70  changing a repeat shows "This changes due dates for all members" before saving.
//   BR-REC-71  changing "better" on a measurement that has values asks for confirmation.
//              (Wording: contract.md "Admin app" -> Confirmations: "Best results and leaderboards will change
//              for past results"; the spec itself only says "confirm sheet".)
//   BR-REC-126 screens use only the word list; no ids, codes or technical words ("metric", "datatype",
//              "interval", "snooze", "flag", "payload"); "Turn off" on screen, never "Deactivate".
//              Word list: Assessment type -> Assessment, metric -> Measurement, interval -> Repeat every,
//              Upcoming -> Due soon, Expiring / Expired -> Ends soon / Ended, plausibility warning ->
//              Please check, deactivate -> Turn off.
//   BR-REC-67  "Move up / Move down".
//   S14 / S16  hub row and screen "Reminders & gym" with the "Due soon" and "Ends soon" days.
// Interface: .pipeline/member-records-setup/contract.md "Admin app interfaces" — `@/lib/setup/text`:
//   `SETUP_TEXT`, setup's own plain-word strings (screen titles, row words, sheet labels, confirm texts).
//   The key names are not fixed, so the tests read every text value of the dictionary and look for the words.
import { beforeAll, describe, expect, test } from 'bun:test';

type Text = typeof import('@/lib/setup/text');

let setupText: Text['SETUP_TEXT'];
let strings: string[];

/** Every text value of a (nested) dictionary; functions and non-text values are skipped. */
function collectStrings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectStrings);
  if (typeof node === 'object' && node !== null) return Object.values(node).flatMap(collectStrings);
  return [];
}

const has = (needle: string) =>
  strings.some((text) => text.toLowerCase().includes(needle.toLowerCase()));

beforeAll(async () => {
  setupText = (await import('@/lib/setup/text')).SETUP_TEXT;
  strings = collectStrings(setupText);
});

describe('SETUP_TEXT is a dictionary of plain words', () => {
  test('SETUP_TEXT holds text (not an empty object)', () => {
    expect(strings.length).toBeGreaterThan(10);
  });

  test('SETUP_TEXT has no empty text', () => {
    expect(strings.filter((text) => text.trim() === '')).toEqual([]);
  });
});

describe('BR-REC-70 / 71 the two confirm texts', () => {
  test('BR-REC-70 a repeat change says "This changes due dates for all members"', () => {
    expect(has('This changes due dates for all members')).toBe(true);
  });

  test('BR-REC-71 a "better" change says "Best results and leaderboards will change for past results"', () => {
    expect(has('Best results and leaderboards will change for past results')).toBe(true);
  });
});

describe('BR-REC-126 the word list: no technical words on screen', () => {
  const forbidden: Array<[string, RegExp]> = [
    ['"metric"', /\bmetrics?\b/i],
    ['"datatype" / "data type"', /\bdata ?types?\b/i],
    ['"interval"', /\bintervals?\b/i],
    ['"snooze"', /\bsnooze[sd]?\b/i],
    ['"flag"', /\bflag(s|ged)?\b/i],
    ['"payload"', /\bpayload\b/i],
    ['"deactivate" (say "Turn off")', /\bdeactivat\w*/i],
    ['"assessment type" (say "Assessment")', /\bassessment types?\b/i],
    ['"plausibility" (say "Please check")', /\bplausib\w*/i],
    ['"upcoming" (say "Due soon")', /\bupcoming\b/i],
    ['"expiring" / "expired" (say "Ends soon" / "Ended")', /\bexpir(ing|ed)\b/i],
  ];
  for (const [label, pattern] of forbidden) {
    test(`BR-REC-126 no text uses the word ${label}`, () => {
      expect(strings.filter((text) => pattern.test(text))).toEqual([]);
    });
  }

  test('BR-REC-126 no text shows a server code or a field name (NAME_TAKEN, METRIC_LOCKED, upcomingLeadDays)', () => {
    const technical =
      /\b[A-Z]{2,}(?:_[A-Z]{2,})+\b|\b[a-z]+[A-Z][A-Za-z]*(?:Days|Count|Unit|Id|Ids)\b/;
    expect(strings.filter((text) => technical.test(text))).toEqual([]);
  });
});

describe('BR-REC-67 / 62 / 60 the words the screens show', () => {
  for (const word of [
    'Move up',
    'Move down',
    'Add assessment',
    'Add measurement',
    'Repeat every',
    'Please check',
    'Reminders & gym',
    'Due soon',
    'Ends soon',
  ]) {
    test(`SETUP_TEXT has a text with "${word}"`, () => {
      expect(has(word)).toBe(true);
    });
  }
});
