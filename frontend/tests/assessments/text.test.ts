// Spec: docs/specs/member-records/assessments.md (v2) and docs/specs/member-records/ux.md (word list)
//   BR-REC-76  anything that is not a number shows "Enter a number like 95.5".
//   BR-REC-78  saving with nothing filled is refused: "Enter at least one value".
//   BR-REC-86  a failed Save keeps the form: "Not saved — check the connection and tap Save again".
//   BR-REC-82  the "Check these values" sheet: [Go back] [Save anyway]; the line under a field says
//              "Please check" (word list: plausibility warning -> Please check).
//   BR-REC-77  an emptied saved field says "will be removed" until Save.
//   BR-REC-85  "Restore unsaved results from 10:42?" [Restore] [Discard].
//   BR-REC-126 screens use only the word list; no ids, codes or technical words ("metric", "datatype",
//              "interval", "snooze", "flag", "payload"); "Turn off", never "Deactivate"; Assessment, not
//              "assessment type"; Measurement, not "metric".
// Interface: docs/specs/member-records/assessments.md — `@/lib/assessments/text`:
//   `ASSESSMENT_TEXT`, own plain-word strings. Fixed lines: `numberError`, `noValues`, `notSaved`.
//   The other key names are not fixed, so the word checks read every text value of the dictionary.
import { beforeAll, describe, expect, test } from 'bun:test';

let assessmentText: Record<string, unknown>;
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
  assessmentText = (await import('@/lib/assessments/text')).ASSESSMENT_TEXT as unknown as Record<
    string,
    unknown
  >;
  strings = collectStrings(assessmentText);
});

describe('ASSESSMENT_TEXT is a dictionary of plain words', () => {
  test('ASSESSMENT_TEXT holds text (not an empty object)', () => {
    expect(strings.length).toBeGreaterThan(10);
  });

  test('ASSESSMENT_TEXT has no empty text', () => {
    expect(strings.filter((text) => text.trim() === '')).toEqual([]);
  });
});

describe('the three fixed lines of the form', () => {
  test('BR-REC-76 numberError is "Enter a number like 95.5"', () => {
    expect(assessmentText.numberError).toBe('Enter a number like 95.5');
  });

  test('BR-REC-78 noValues is "Enter at least one value"', () => {
    expect(assessmentText.noValues).toBe('Enter at least one value');
  });

  test('BR-REC-86 notSaved is "Not saved — check the connection and tap Save again"', () => {
    expect(assessmentText.notSaved).toBe('Not saved — check the connection and tap Save again');
  });
});

describe('BR-REC-82 / 77 / 85 the words the form shows', () => {
  for (const word of [
    'Please check', // under a flagged field (BR-REC-21, 82, D14)
    'Check these values', // the sheet title (BR-REC-82)
    'Go back', // sheet button (BR-REC-82)
    'Save anyway', // sheet button (BR-REC-82)
    'will be removed', // an emptied saved field (BR-REC-77)
    'Restore', // draft question button (BR-REC-85)
    'Discard', // draft question button (BR-REC-85)
  ]) {
    test(`ASSESSMENT_TEXT has a text with "${word}"`, () => {
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
    ['"plausibility" (say "Please check")', /\bplausib\w*/i],
    ['"upcoming" (say "Due soon")', /\bupcoming\b/i],
    ['"expiring" / "expired" (say "Ends soon" / "Ended")', /\bexpir(ing|ed)\b/i],
  ];
  for (const [label, pattern] of forbidden) {
    test(`BR-REC-126 no text uses the word ${label}`, () => {
      expect(strings.filter((text) => pattern.test(text))).toEqual([]);
    });
  }

  test('BR-REC-126 no text shows a server code or a field name (NO_VALUES, DATE_IN_FUTURE, isEstimated)', () => {
    const technical =
      /\b[A-Z]{2,}(?:_[A-Z]{2,})+\b|\b[a-z]+(?:[A-Z][a-z]+)*(?:Days|Count|Unit|Ids?|Estimated)\b/;
    expect(strings.filter((text) => technical.test(text))).toEqual([]);
  });
});
