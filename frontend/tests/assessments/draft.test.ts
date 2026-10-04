// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-85 — unsaved values are kept on this device per member + assessment + date (values only, never
//               tokens) and offered back ("Restore unsaved results from 10:42?" [Restore] [Discard]); cleared
//               on Save or Discard, dropped after 7 days (Q5).
//   D13       — draft key = member + assessment + date, in `localStorage` as
//               `assess-draft:v1:<memberId>:<typeId>:<date>` with the save moment; values only (the typed text
//               of Number fields, seconds of Time fields) and the About flag. A draft with every value empty is
//               not kept. Drafts older than 7 days are dropped whenever a form opens.
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/draft`: `DRAFT_PREFIX` = "assess-draft:v1:", `DRAFT_MAX_AGE_MS` = 7 days,
//   `draftKey(memberId, typeId, date)`, type `Draft` = `{ savedAt (ms), isEstimated, values:
//   Record<string, string | number | null> }`, `DraftStorage` = `Pick<Storage, getItem | setItem | removeItem |
//   key | length>`.
//   `saveDraft(storage, key, draft)` -> boolean: stores JSON; when every value is '' / null it removes the key
//     and returns false; a storage error returns false (never throws).
//   `loadDraft(storage, key, now)` -> `Draft | null`: missing, malformed, wrong shape, or `now - savedAt`
//     strictly over the max age -> null and the bad or expired item is removed (exactly 7 days is kept);
//     storage errors -> null.
//   `clearDraft(storage, key)` never throws; `dropExpiredDrafts(storage, now)` removes expired or malformed
//     items under `DRAFT_PREFIX` only, returns how many, leaves other keys alone.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Draft {
  savedAt: number;
  isEstimated: boolean;
  values: Record<string, string | number | null>;
}
interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}
interface DraftModule {
  DRAFT_PREFIX: string;
  DRAFT_MAX_AGE_MS: number;
  draftKey(memberId: string, typeId: string, date: string): string;
  saveDraft(storage: DraftStorage, key: string, draft: Draft): boolean;
  loadDraft(storage: DraftStorage, key: string, now: number): Draft | null;
  clearDraft(storage: DraftStorage, key: string): void;
  dropExpiredDrafts(storage: DraftStorage, now: number): number;
}

let drafts: DraftModule;

beforeAll(async () => {
  drafts = (await import('@/lib/assessments/draft')) as unknown as DraftModule;
});

/** A Map-backed stand-in for `localStorage` (same method names and `key(index)` / `length` behaviour). */
class FakeStorage implements DraftStorage {
  readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  keys(): string[] {
    return [...this.items.keys()].sort();
  }
}

/** A storage whose chosen methods throw, like private mode, a blocked site or a full quota. */
const brokenStorage = (
  broken: ReadonlyArray<'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>,
  inner = new FakeStorage(),
): DraftStorage => ({
  getItem: (key) => {
    if (broken.includes('getItem')) throw new Error('storage blocked');
    return inner.getItem(key);
  },
  setItem: (key, value) => {
    if (broken.includes('setItem')) throw new DOMException('quota', 'QuotaExceededError');
    inner.setItem(key, value);
  },
  removeItem: (key) => {
    if (broken.includes('removeItem')) throw new Error('storage blocked');
    inner.removeItem(key);
  },
  key: (index) => {
    if (broken.includes('key')) throw new Error('storage blocked');
    return inner.key(index);
  },
  get length(): number {
    if (broken.includes('length')) throw new Error('storage blocked');
    return inner.length;
  },
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 10, 42, 0);

const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TYPE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WEIGHT = '11111111-1111-4111-8111-111111111111';
const PLANK = '33333333-3333-4333-8333-333333333333';
const FAT = '22222222-2222-4222-8222-222222222222';

const draftOf = (savedAt: number, extra: Partial<Draft> = {}): Draft => ({
  savedAt,
  isEstimated: false,
  values: { [WEIGHT]: '94', [PLANK]: 122 },
  ...extra,
});

const KEY = (date = '2026-10-03') => `assess-draft:v1:${MEMBER}:${TYPE}:${date}`;

describe('BR-REC-85 / D13 constants and the draft key', () => {
  test('D13 the key prefix is "assess-draft:v1:"', () => {
    expect(drafts.DRAFT_PREFIX).toBe('assess-draft:v1:');
  });

  test('BR-REC-85 drafts are dropped after 7 days', () => {
    expect(drafts.DRAFT_MAX_AGE_MS).toBe(7 * DAY);
  });

  test('D13 draftKey is the prefix + member : assessment : date', () => {
    expect(drafts.draftKey(MEMBER, TYPE, '2026-10-03')).toBe(
      'assess-draft:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:2026-10-03',
    );
  });

  test('BR-REC-85 the key starts with DRAFT_PREFIX', () => {
    expect(drafts.draftKey(MEMBER, TYPE, '2026-10-03').startsWith(drafts.DRAFT_PREFIX)).toBe(true);
  });

  test('BR-REC-85 member, assessment and date each make a different key', () => {
    const base = drafts.draftKey(MEMBER, TYPE, '2026-10-03');
    expect(drafts.draftKey('cccccccc-cccc-4ccc-8ccc-cccccccccccc', TYPE, '2026-10-03')).not.toBe(
      base,
    );
    expect(drafts.draftKey(MEMBER, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '2026-10-03')).not.toBe(
      base,
    );
    expect(drafts.draftKey(MEMBER, TYPE, '2026-10-02')).not.toBe(base);
  });

  test('BR-REC-85 the same member, assessment and date always give the same key', () => {
    expect(drafts.draftKey(MEMBER, TYPE, '2025-12-30')).toBe(
      drafts.draftKey(MEMBER, TYPE, '2025-12-30'),
    );
  });
});

describe('BR-REC-85 saveDraft stores the typed values and loadDraft offers them back', () => {
  test('BR-REC-85 a draft with a value is stored and saveDraft answers true', () => {
    const storage = new FakeStorage();
    expect(drafts.saveDraft(storage, KEY(), draftOf(NOW))).toBe(true);
    expect(storage.getItem(KEY())).not.toBeNull();
  });

  test('D13 the stored text is JSON holding the draft', () => {
    const storage = new FakeStorage();
    const draft = draftOf(NOW - 60_000, { isEstimated: true });
    drafts.saveDraft(storage, KEY(), draft);
    expect(JSON.parse(storage.getItem(KEY()) as string)).toEqual(draft);
  });

  test('BR-REC-85 loadDraft gives the saved draft back (restore)', () => {
    const storage = new FakeStorage();
    const draft = draftOf(NOW - 5 * 60_000);
    drafts.saveDraft(storage, KEY(), draft);
    expect(drafts.loadDraft(storage, KEY(), NOW)).toEqual(draft);
  });

  test('D13 the save moment and the About flag come back', () => {
    const storage = new FakeStorage();
    const draft = draftOf(NOW - 12_345, { isEstimated: true });
    drafts.saveDraft(storage, KEY(), draft);
    const loaded = drafts.loadDraft(storage, KEY(), NOW);
    expect(loaded?.savedAt).toBe(NOW - 12_345);
    expect(loaded?.isEstimated).toBe(true);
  });

  test('D13 Number fields keep their typed text, Time fields their seconds', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW, { values: { [WEIGHT]: '95,', [PLANK]: 122 } }));
    const loaded = drafts.loadDraft(storage, KEY(), NOW);
    expect(loaded?.values[WEIGHT]).toBe('95,'); // as typed, not parsed
    expect(loaded?.values[PLANK]).toBe(122);
  });

  test('BR-REC-85 a draft with some empty boxes and one value is kept', () => {
    const storage = new FakeStorage();
    const draft = draftOf(NOW, { values: { [WEIGHT]: '', [PLANK]: null, [FAT]: '17.5' } });
    expect(drafts.saveDraft(storage, KEY(), draft)).toBe(true);
    expect(drafts.loadDraft(storage, KEY(), NOW)).toEqual(draft);
  });

  test('D13 a time of 0 seconds is a value (the draft is kept)', () => {
    const storage = new FakeStorage();
    expect(drafts.saveDraft(storage, KEY(), draftOf(NOW, { values: { [PLANK]: 0 } }))).toBe(true);
    expect(drafts.loadDraft(storage, KEY(), NOW)?.values[PLANK]).toBe(0);
  });

  test('BR-REC-85 saving again with new text replaces the old draft', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW - 60_000, { values: { [WEIGHT]: '9' } }));
    drafts.saveDraft(storage, KEY(), draftOf(NOW, { values: { [WEIGHT]: '94' } }));
    expect(drafts.loadDraft(storage, KEY(), NOW)?.values[WEIGHT]).toBe('94');
  });

  test('BR-REC-85 each member + assessment + date has its own draft', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW, { values: { [WEIGHT]: '94' } }));
    drafts.saveDraft(storage, KEY('2025-12-30'), draftOf(NOW, { values: { [WEIGHT]: '97' } }));
    expect(drafts.loadDraft(storage, KEY('2026-10-03'), NOW)?.values[WEIGHT]).toBe('94');
    expect(drafts.loadDraft(storage, KEY('2025-12-30'), NOW)?.values[WEIGHT]).toBe('97');
  });

  test('BR-REC-85 loading a draft does not remove it (it stays until Save or Discard)', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW));
    drafts.loadDraft(storage, KEY(), NOW);
    expect(storage.getItem(KEY())).not.toBeNull();
    expect(drafts.loadDraft(storage, KEY(), NOW)).not.toBeNull();
  });

  test('BR-REC-85 a key with no draft loads null', () => {
    const storage = new FakeStorage();
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
  });
});

describe('D13 a draft with every value empty is not kept', () => {
  test.each<[string, Draft['values']]>([
    ['empty text and null', { [WEIGHT]: '', [PLANK]: null }],
    ['only empty text', { [WEIGHT]: '', [FAT]: '' }],
    ['only nulls', { [PLANK]: null }],
    ['no values at all', {}],
  ])('D13 %s -> not stored, false', (_name, values) => {
    const storage = new FakeStorage();
    expect(drafts.saveDraft(storage, KEY(), draftOf(NOW, { values }))).toBe(false);
    expect(storage.getItem(KEY())).toBeNull();
    expect(storage.length).toBe(0);
  });

  test('D13 the About flag alone does not make a draft worth keeping', () => {
    const storage = new FakeStorage();
    const draft = draftOf(NOW, { isEstimated: true, values: { [WEIGHT]: '' } });
    expect(drafts.saveDraft(storage, KEY(), draft)).toBe(false);
    expect(storage.getItem(KEY())).toBeNull();
  });

  test('D13 clearing every box removes the draft saved earlier', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW - 60_000));
    expect(storage.getItem(KEY())).not.toBeNull();
    expect(drafts.saveDraft(storage, KEY(), draftOf(NOW, { values: { [WEIGHT]: '' } }))).toBe(
      false,
    );
    expect(storage.getItem(KEY())).toBeNull();
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
  });

  test('D13 emptying one draft leaves the other drafts alone', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW));
    drafts.saveDraft(storage, KEY('2025-12-30'), draftOf(NOW));
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW, { values: { [WEIGHT]: '' } }));
    expect(storage.getItem(KEY('2025-12-30'))).not.toBeNull();
  });
});

describe('BR-REC-85 loadDraft drops drafts older than 7 days', () => {
  test('BR-REC-85 a draft of exactly 7 days is still offered', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW - drafts.DRAFT_MAX_AGE_MS));
    expect(drafts.loadDraft(storage, KEY(), NOW)).not.toBeNull();
    expect(storage.getItem(KEY())).not.toBeNull();
  });

  test('BR-REC-85 a draft 1 ms over 7 days is gone: null and removed', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW - drafts.DRAFT_MAX_AGE_MS - 1));
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
    expect(storage.getItem(KEY())).toBeNull();
  });

  test.each([
    ['yesterday', NOW - DAY],
    ['6 days ago', NOW - 6 * DAY],
    ['6 days 23 hours ago', NOW - 6 * DAY - 23 * 60 * 60 * 1000],
  ])('BR-REC-85 a draft from %s is offered', (_name, savedAt) => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(savedAt));
    expect(drafts.loadDraft(storage, KEY(), NOW)?.savedAt).toBe(savedAt);
  });

  test.each([
    ['8 days ago', NOW - 8 * DAY],
    ['a month ago', NOW - 30 * DAY],
    ['a year ago', NOW - 365 * DAY],
  ])('BR-REC-85 a draft from %s is dropped', (_name, savedAt) => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(savedAt));
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
    expect(storage.getItem(KEY())).toBeNull();
  });

  test('BR-REC-85 a save moment a little ahead of the clock is not "older than 7 days"', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW + 60_000));
    expect(drafts.loadDraft(storage, KEY(), NOW)).not.toBeNull();
  });

  test('BR-REC-85 the age is counted from the "now" that is given', () => {
    const storage = new FakeStorage();
    const savedAt = NOW;
    drafts.saveDraft(storage, KEY(), draftOf(savedAt));
    expect(drafts.loadDraft(storage, KEY(), savedAt + 7 * DAY)).not.toBeNull();
    expect(drafts.loadDraft(storage, KEY(), savedAt + 7 * DAY + 1)).toBeNull();
  });
});

describe('D13 loadDraft: a bad item is null and removed', () => {
  const GOOD_VALUES = { [WEIGHT]: '94' };
  test.each<[string, string]>([
    ['not JSON', 'not json at all'],
    ['half JSON', '{"savedAt": 1'],
    ['an empty string', ''],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"draft"'],
    ['a JSON number', '42'],
    ['an empty object', '{}'],
    ['no values', JSON.stringify({ savedAt: NOW, isEstimated: false })],
    ['no save moment', JSON.stringify({ isEstimated: false, values: GOOD_VALUES })],
    ['no About flag', JSON.stringify({ savedAt: NOW, values: GOOD_VALUES })],
    [
      'a save moment that is text',
      JSON.stringify({ savedAt: '2026-10-04', isEstimated: false, values: GOOD_VALUES }),
    ],
    [
      'an About flag that is text',
      JSON.stringify({ savedAt: NOW, isEstimated: 'yes', values: GOOD_VALUES }),
    ],
    [
      'values that are a list',
      JSON.stringify({ savedAt: NOW, isEstimated: false, values: ['94'] }),
    ],
    ['values that are text', JSON.stringify({ savedAt: NOW, isEstimated: false, values: '94' })],
    ['values that are null', JSON.stringify({ savedAt: NOW, isEstimated: false, values: null })],
    [
      'a value that is an object',
      JSON.stringify({ savedAt: NOW, isEstimated: false, values: { [WEIGHT]: { x: 1 } } }),
    ],
  ])('D13 %s -> null and the item is removed', (_name, raw) => {
    const storage = new FakeStorage();
    storage.setItem(KEY(), raw);
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
    expect(storage.getItem(KEY())).toBeNull();
  });

  test('D13 a bad item does not touch the other keys', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY(), 'not json');
    storage.setItem('theme', 'dark');
    drafts.saveDraft(storage, KEY('2025-12-30'), draftOf(NOW));
    drafts.loadDraft(storage, KEY(), NOW);
    expect(storage.keys()).toEqual([KEY('2025-12-30'), 'theme'].sort());
  });
});

describe('D13 clearDraft', () => {
  test('BR-REC-85 clearDraft removes the draft (after Save or Discard)', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY(), draftOf(NOW));
    drafts.clearDraft(storage, KEY());
    expect(storage.getItem(KEY())).toBeNull();
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
  });

  test('BR-REC-85 clearDraft removes only that draft', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW));
    drafts.saveDraft(storage, KEY('2025-12-30'), draftOf(NOW));
    storage.setItem('theme', 'dark');
    drafts.clearDraft(storage, KEY('2026-10-03'));
    expect(storage.keys()).toEqual([KEY('2025-12-30'), 'theme'].sort());
  });

  test('BR-REC-85 clearDraft on a key with no draft does nothing', () => {
    const storage = new FakeStorage();
    expect(() => drafts.clearDraft(storage, KEY())).not.toThrow();
    expect(storage.length).toBe(0);
  });
});

describe('D13 private mode / blocked storage: nothing throws, the form still works', () => {
  test('D13 saveDraft answers false when setItem throws', () => {
    expect(drafts.saveDraft(brokenStorage(['setItem']), KEY(), draftOf(NOW))).toBe(false);
  });

  test('D13 saveDraft does not throw when every method throws', () => {
    const storage = brokenStorage(['getItem', 'setItem', 'removeItem', 'key']);
    expect(() => drafts.saveDraft(storage, KEY(), draftOf(NOW))).not.toThrow();
    expect(drafts.saveDraft(storage, KEY(), draftOf(NOW))).toBe(false);
  });

  test('D13 saveDraft of an empty draft does not throw when removeItem throws', () => {
    const storage = brokenStorage(['removeItem']);
    const empty = draftOf(NOW, { values: { [WEIGHT]: '' } });
    expect(() => drafts.saveDraft(storage, KEY(), empty)).not.toThrow();
    expect(drafts.saveDraft(storage, KEY(), empty)).toBe(false);
  });

  test('D13 loadDraft answers null when getItem throws', () => {
    const storage = brokenStorage(['getItem']);
    expect(() => drafts.loadDraft(storage, KEY(), NOW)).not.toThrow();
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
  });

  test('D13 loadDraft answers null for an expired item even when removeItem throws', () => {
    const inner = new FakeStorage();
    drafts.saveDraft(inner, KEY(), draftOf(NOW - 8 * DAY));
    const storage = brokenStorage(['removeItem'], inner);
    expect(() => drafts.loadDraft(storage, KEY(), NOW)).not.toThrow();
    expect(drafts.loadDraft(storage, KEY(), NOW)).toBeNull();
  });

  test('D13 clearDraft never throws', () => {
    const storage = brokenStorage(['removeItem']);
    expect(() => drafts.clearDraft(storage, KEY())).not.toThrow();
  });
});

describe('BR-REC-85 / D13 dropExpiredDrafts clears old drafts whenever a form opens', () => {
  test('D13 it removes expired drafts, keeps fresh ones and answers how many went', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW - DAY)); // fresh
    drafts.saveDraft(storage, KEY('2026-10-02'), draftOf(NOW - 6 * DAY)); // fresh
    drafts.saveDraft(storage, KEY('2026-09-01'), draftOf(NOW - 8 * DAY)); // expired
    drafts.saveDraft(storage, KEY('2026-08-01'), draftOf(NOW - 30 * DAY)); // expired
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(2);
    expect(storage.keys()).toEqual([KEY('2026-10-02'), KEY('2026-10-03')].sort());
  });

  test('D13 a draft of exactly 7 days is kept, 1 ms more is dropped', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-09-27'), draftOf(NOW - 7 * DAY));
    drafts.saveDraft(storage, KEY('2026-09-26'), draftOf(NOW - 7 * DAY - 1));
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(1);
    expect(storage.keys()).toEqual([KEY('2026-09-27')]);
  });

  test('D13 malformed drafts under the prefix are removed and counted', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY('2026-10-01'), 'not json');
    storage.setItem(KEY('2026-10-02'), '{"x":1}');
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW));
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(2);
    expect(storage.keys()).toEqual([KEY('2026-10-03')]);
  });

  test('D13 other keys are left alone, even when they look old or broken', () => {
    const storage = new FakeStorage();
    storage.setItem('theme', 'dark');
    storage.setItem('members:search', '{"broken":');
    storage.setItem(
      'assess-draft:v0:old-format',
      JSON.stringify({ savedAt: NOW - 100 * DAY, isEstimated: false, values: { a: '1' } }),
    );
    storage.setItem(
      `other:${drafts.DRAFT_PREFIX}${MEMBER}`,
      JSON.stringify({ savedAt: NOW - 100 * DAY, isEstimated: false, values: { a: '1' } }),
    );
    drafts.saveDraft(storage, KEY('2026-09-01'), draftOf(NOW - 8 * DAY)); // the only one to go
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(1);
    expect(storage.length).toBe(4);
    expect(storage.getItem('theme')).toBe('dark');
    expect(storage.getItem('members:search')).toBe('{"broken":');
    expect(storage.getItem('assess-draft:v0:old-format')).not.toBeNull();
  });

  test('D13 many drafts to remove in a row: none is skipped when the list shifts', () => {
    const storage = new FakeStorage();
    // expired and bad drafts side by side, with fresh ones and other keys mixed in
    for (let day = 1; day <= 6; day++) {
      drafts.saveDraft(storage, KEY(`2026-08-0${day}`), draftOf(NOW - (10 + day) * DAY)); // expired
    }
    storage.setItem(KEY('2026-07-01'), 'garbage');
    storage.setItem(KEY('2026-07-02'), '{}');
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW - DAY));
    drafts.saveDraft(storage, KEY('2026-10-04'), draftOf(NOW));
    storage.setItem('theme', 'dark');
    storage.setItem('zzz', 'last');
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(8);
    expect(storage.keys()).toEqual([KEY('2026-10-03'), KEY('2026-10-04'), 'theme', 'zzz'].sort());
  });

  test('D13 nothing to drop answers 0 and changes nothing', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-10-03'), draftOf(NOW));
    storage.setItem('theme', 'dark');
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(0);
    expect(storage.length).toBe(2);
  });

  test('D13 an empty storage answers 0', () => {
    expect(drafts.dropExpiredDrafts(new FakeStorage(), NOW)).toBe(0);
  });

  test('D13 a second call finds nothing more', () => {
    const storage = new FakeStorage();
    drafts.saveDraft(storage, KEY('2026-09-01'), draftOf(NOW - 8 * DAY));
    storage.setItem(KEY('2026-09-02'), 'garbage');
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(2);
    expect(drafts.dropExpiredDrafts(storage, NOW)).toBe(0);
  });
});
