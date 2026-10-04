// Spec: docs/specs/member-records/due-list.md (v2) and docs/specs/member-records/ux.md (word list)
//   BR-REC-100 / 102 / C12 the row menu: Record assessment, Assess soon (when set: "Remove Assess soon"),
//              Remind me later > (1 week, 2 weeks, 1 month, Pick a date), Open member; the member page also
//              offers "Remove reminder".
//   C13 / perf tactic 8 toasts: "Marked Assess soon." / "Reminder set for 3 Nov." / "Removed.", and on a failed save
//              the change is undone with "Couldn't save this. Try again."
//   BR-REC-126 screens use only the word list; no ids, codes or technical words ("metric", "interval", "snooze",
//              "flag", "payload"); Upcoming -> Due soon.
//   BR-REC-137 an icon-only button has a spoken name: the row "..." is "More for <name>" (contract "Row").
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/due/text`: `DUE_TEXT`,
//   due-list's own plain-word strings (section empty lines, sheet choices, toasts). The key names are not fixed, so
//   the tests read every text value of the dictionary. A value that is a function (a text with a name or a date in
//   it) is called with sample words and its answer is read.
import { beforeAll, describe, expect, test } from 'bun:test';
import { forbiddenIn } from './helpers';

let strings: string[];

/** Every text of a (nested) dictionary; functions are called with sample words (a name, a date) and their text kept. */
function collectStrings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'function') {
    const samples: unknown[][] = [
      ['Surya Pratap'],
      ['3 Nov'],
      ['Fitness test'],
      ['3 Nov', 'Surya Pratap'],
      [5],
      [1],
    ];
    const out: string[] = [];
    for (const args of samples) {
      try {
        const answer = (node as (...a: unknown[]) => unknown)(...args);
        if (typeof answer === 'string') out.push(answer);
      } catch {
        // a function that needs other arguments is skipped
      }
    }
    return out;
  }
  if (Array.isArray(node)) return node.flatMap(collectStrings);
  if (typeof node === 'object' && node !== null) return Object.values(node).flatMap(collectStrings);
  return [];
}

const has = (needle: string) =>
  strings.some((text) => text.toLowerCase().includes(needle.toLowerCase()));

beforeAll(async () => {
  const text = (await import('@/lib/due/text')) as unknown as { DUE_TEXT: unknown };
  strings = collectStrings(text.DUE_TEXT);
});

describe('DUE_TEXT is a dictionary of plain words', () => {
  test('DUE_TEXT holds text (not an empty object)', () => {
    expect(strings.length).toBeGreaterThan(8);
  });

  test('DUE_TEXT has no empty text', () => {
    expect(strings.filter((text) => text.trim() === '')).toEqual([]);
  });
});

describe('BR-REC-126 the word list: no technical words on screen', () => {
  test('no text uses a technical word, a server code or a field name', () => {
    expect(forbiddenIn(strings)).toEqual([]);
  });

  for (const [label, pattern] of [
    ['"metric"', /\bmetrics?\b/i],
    ['"interval"', /\bintervals?\b/i],
    ['"snooze"', /\bsnooze[sd]?\b/i],
    ['"flag"', /\bflag(s|ged)?\b/i],
    ['"upcoming" (say "Due soon")', /\bupcoming\b/i],
    ['"payload"', /\bpayload\b/i],
  ] as const) {
    test(`no text uses the word ${label}`, () => {
      expect(strings.filter((text) => pattern.test(text))).toEqual([]);
    });
  }
});

describe('BR-REC-100 / 102 / C12 the choices of the row menu and the member page', () => {
  for (const word of [
    'Record assessment',
    'Assess soon',
    'Remove Assess soon',
    'Remind me later',
    '1 week',
    '2 weeks',
    '1 month',
    'Pick a date',
    'Open member',
    'Remove reminder',
  ]) {
    test(`DUE_TEXT has a text with "${word}"`, () => {
      expect(has(word)).toBe(true);
    });
  }
});

describe('C13 the toasts', () => {
  test('Assess soon saved: "Marked Assess soon."', () => {
    expect(strings).toContain('Marked Assess soon.');
  });

  test('a reminder saved: "Reminder set for 3 Nov." (the date comes in)', () => {
    expect(has('Reminder set for')).toBe(true);
    expect(strings.some((text) => /^Reminder set for\b.*\.$/.test(text))).toBe(true);
  });

  test('either one removed: "Removed."', () => {
    expect(strings).toContain('Removed.');
  });

  test('BR-REC-128 a failed save says what happened and what to do: "Couldn\'t save this. Try again."', () => {
    expect(strings).toContain("Couldn't save this. Try again.");
  });
});

describe('BR-REC-137 spoken names', () => {
  test('the row "..." button is named "More for <name>"', () => {
    expect(strings).toContain('More for Surya Pratap');
  });
});
