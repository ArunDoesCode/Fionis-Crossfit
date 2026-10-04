// Spec: docs/specs/member-records/progress.md (v2) and docs/specs/member-records/ux.md (word list)
//   BR-REC-114 age bands: Under 20, 20-29, 30-39, 40-49, 50-59, 60+ (en dash).
//   BR-REC-112 the three outcomes read "Improved", "No change", "Worse".
//   BR-REC-115 "Show more" under the leaderboard (Q3).
//   S12 / S13 / S18 sketches: "Report card", "Print", "Average change", "Leaderboard", "Active members by plan",
//   "Export data", "Download CSV", "Opens in Excel or Google Sheets".
//   BR-REC-126 screens use only the word list; no ids, codes or technical words ("metric", "datatype",
//              "interval", "snooze", "flag", "payload"); "Turn off" never "Deactivate"; Ends soon / Ended.
// Interface: .pipeline/member-records-progress/contract.md "Admin app interfaces" — `@/lib/progress/text`:
//   `PROGRESS_TEXT` (the screens' own plain words) and `AGE_BAND_LABELS`. The key names of PROGRESS_TEXT are not
//   fixed, so the tests read every text value of the dictionary and look for the words.
import { beforeAll, describe, expect, test } from 'bun:test';

type AgeBand = 'under20' | '20to29' | '30to39' | '40to49' | '50to59' | '60plus';

interface Text {
  PROGRESS_TEXT: unknown;
  AGE_BAND_LABELS: Record<AgeBand, string>;
}

let text: Text;
let strings: string[];

/** Every text value of a (nested) dictionary; functions and non-text values are skipped. */
function collectStrings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectStrings);
  if (typeof node === 'object' && node !== null) return Object.values(node).flatMap(collectStrings);
  return [];
}

const has = (needle: string) =>
  strings.some((value) => value.toLowerCase().includes(needle.toLowerCase()));

beforeAll(async () => {
  text = (await import('@/lib/progress/text')) as unknown as Text;
  strings = collectStrings(text.PROGRESS_TEXT);
});

describe('BR-REC-114 AGE_BAND_LABELS', () => {
  test.each([
    ['under20', 'Under 20'],
    ['20to29', '20–29'],
    ['30to39', '30–39'],
    ['40to49', '40–49'],
    ['50to59', '50–59'],
    ['60plus', '60+'],
  ] as [AgeBand, string][])('BR-REC-114 the band %s is labelled "%s"', (band, label) => {
    expect(text.AGE_BAND_LABELS[band]).toBe(label);
  });

  test('BR-REC-114 the ranges use an en dash (U+2013), not a hyphen', () => {
    for (const band of ['20to29', '30to39', '40to49', '50to59'] as const) {
      expect(text.AGE_BAND_LABELS[band]).toContain('–');
      expect(text.AGE_BAND_LABELS[band]).not.toContain('-');
    }
  });

  test('BR-REC-114 there are exactly the six bands, in no other codes', () => {
    expect(Object.keys(text.AGE_BAND_LABELS).sort()).toEqual(
      ['20to29', '30to39', '40to49', '50to59', '60plus', 'under20'].sort(),
    );
  });
});

describe('PROGRESS_TEXT is a dictionary of plain words', () => {
  test('PROGRESS_TEXT holds text (not an empty object)', () => {
    expect(strings.length).toBeGreaterThan(8);
  });

  test('PROGRESS_TEXT has no empty text', () => {
    expect(strings.filter((value) => value.trim() === '')).toEqual([]);
  });
});

describe('BR-REC-112 / 115 / S12 / S13 / S18 the words the screens show', () => {
  for (const word of [
    'Report card',
    'Print',
    'Average change',
    'Improved',
    'No change',
    'Worse',
    'Leaderboard',
    'Show more',
    'Active members by plan',
    'Export data',
    'Download CSV',
    'Opens in Excel or Google Sheets',
  ]) {
    test(`PROGRESS_TEXT has a text with "${word}"`, () => {
      expect(has(word)).toBe(true);
    });
  }
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
    ['"upcoming" (say "Due soon")', /\bupcoming\b/i],
    ['"expiring" / "expired" (say "Ends soon" / "Ended")', /\bexpir(ing|ed)\b/i],
  ];
  for (const [label, pattern] of forbidden) {
    test(`BR-REC-126 no text uses the word ${label}`, () => {
      expect(strings.filter((value) => pattern.test(value))).toEqual([]);
    });
  }

  test('BR-REC-126 no text shows a server code or a field name (NO_DIRECTION, notCounted, ageBand)', () => {
    const technical =
      /\b[A-Z]{2,}(?:_[A-Z]{2,})+\b|\b[a-z]+[A-Z][A-Za-z]*(?:Days|Count|Unit|Id|Ids|Band|Counted)\b/;
    expect(strings.filter((value) => technical.test(value))).toEqual([]);
  });
});
