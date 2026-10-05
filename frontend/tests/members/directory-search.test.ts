// Spec: docs/specs/member-records/members.md BR-REC-201, BR-REC-202 (pure search over the member directory).
// Interface: `@/lib/members/directory` exports MIN_SEARCH_CHARS = 2, foldText(text),
//   searchMembers(rows, { text, field: 'name'|'email'|'phone', archived }) -> matching E16 items in order.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Row {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  lastAssessedOn: string | null;
  archivedAt: string | null;
  membership: {
    status: 'active' | 'expiring' | 'expired';
    plan: 'monthly' | 'quarterly' | 'half_annual' | 'annual';
    endOn: string;
    daysLeft: number;
  };
}
interface Dir {
  MIN_SEARCH_CHARS: number;
  foldText(text: string): string;
  searchMembers(
    rows: Row[],
    q: { text: string; field: 'name' | 'email' | 'phone'; archived: boolean },
  ): Row[];
}
let dir: Dir;
beforeAll(async () => {
  dir = (await import('@/lib/members/directory')) as unknown as Dir;
});

const row = (
  id: string,
  fullName: string,
  phone = '+919000000000',
  email: string | null = null,
  archivedAt: string | null = null,
): Row => ({
  id,
  fullName,
  phone,
  email,
  lastAssessedOn: null,
  archivedAt,
  membership: { status: 'active', plan: 'annual', endOn: '2026-12-31', daysLeft: 90 },
});

const rows: Row[] = [
  row('rene', 'René Dsouza', '+919111111111', 'rene@gmail.com'),
  row('surya', 'Surya Pratap', '+919845012345', 'surya.p@Gmail.com'),
  row('asura', 'Asura Nair', '+919222222222', null),
  row('kiran', 'Kiran Surya', '+919333333333', 'kiran@work.in'),
  row('zed', 'Zed  Surya', '+919444444444', 'zed@yahoo.com'),
  row('old', 'Old Surya', '+919845099999', 'old@gmail.com', '2026-01-01T00:00:00.000Z'),
];
const ids = (r: Row[]) => r.map((x) => x.id);
const s = (text: string, field: 'name' | 'email' | 'phone' = 'name', archived = false) =>
  ids(dir.searchMembers(rows, { text, field, archived }));

describe('BR-REC-202 constants and foldText', () => {
  test('BR-REC-202 MIN_SEARCH_CHARS is 2', () => expect(dir.MIN_SEARCH_CHARS).toBe(2));
  test.each([
    ['René', 'rene'],
    ['  RENÉ   Dsouza ', 'rene dsouza'],
    ['Zoë  Ng', 'zoe ng'],
    ['', ''],
  ])('BR-REC-202 foldText(%j) = %j', (i, o) => expect(dir.foldText(i)).toBe(o));
});

describe('BR-REC-202 name', () => {
  test('accents ignored: "rene" finds René Dsouza', () => expect(s('rene')).toEqual(['rene']));
  test('accents ignored the other way: "RENÉ"', () => expect(s('RENÉ')).toEqual(['rene']));
  test('case ignored', () => expect(s('SURYA PRATAP')).toEqual(['surya']));
  test('double spaces collapsed in the text typed', () =>
    expect(s('surya   pratap')).toEqual(['surya']));
  test('double spaces collapsed in the stored name', () => expect(s('zed surya')).toEqual(['zed']));
  test('matches anywhere in the name: "atap"', () => expect(s('atap')).toEqual(['surya']));
  test('starts-with first, then the rest A-Z', () => {
    // starts with "sur": Surya Pratap. Contains it: Asura Nair, Kiran Surya, Zed Surya (A-Z by name).
    expect(s('sur')).toEqual(['surya', 'asura', 'kiran', 'zed']);
  });
  test('rest sorted A-Z regardless of input order', () => {
    const shuffled = [rows[4], rows[3], rows[2], rows[1]];
    expect(
      ids(dir.searchMembers(shuffled, { text: 'sur', field: 'name', archived: false })),
    ).toEqual(['surya', 'asura', 'kiran', 'zed']);
  });
  test('no match returns empty', () => expect(s('xyz')).toEqual([]));
});

describe('BR-REC-202 phone', () => {
  test('"+91 98450" matches 98450... (digits only)', () =>
    expect(s('+91 98450', 'phone')).toEqual(['surya']));
  test('matches anywhere in the stored digits: "45012"', () =>
    expect(s('45012', 'phone')).toEqual(['surya']));
  test('spaces and dashes ignored', () => expect(s('98450-12 345', 'phone')).toEqual(['surya']));
  test('more than 10 digits typed: last 10 are used', () =>
    expect(s('00919845012345', 'phone')).toEqual(['surya']));
  test('letters in the text do not match a name via phone', () =>
    expect(s('surya', 'phone')).toEqual([]));
  test('no phone match returns empty', () => expect(s('55555', 'phone')).toEqual([]));
});

describe('BR-REC-202 email', () => {
  test('"GMAIL" finds every gmail address, case ignored (active only)', () =>
    expect(s('GMAIL', 'email').sort()).toEqual(['rene', 'surya']));
  test('part match anywhere', () => expect(s('surya.p', 'email')).toEqual(['surya']));
  test('members without email never match', () => {
    expect(s('null', 'email')).not.toContain('asura');
    expect(s('asura', 'email')).toEqual([]);
  });
  test('name text does not match under the email field', () =>
    expect(s('Pratap', 'email')).toEqual([]));
});

describe('BR-REC-202 archived and short text', () => {
  test('archived members hidden from the active scope', () => expect(s('old')).toEqual([]));
  test('archived members found under the archived scope', () =>
    expect(s('old', 'name', true)).toEqual(['old']));
  test('active members hidden under the archived scope', () =>
    expect(s('surya', 'name', true)).toEqual(['old']));
  test('chip and text combine for email', () => expect(s('gmail', 'email', true)).toEqual(['old']));
  test.each([[''], ['s'], [' s '], [' ']])(
    'BR-REC-202 text %j (<2 chars) returns the scope rows in given order',
    (t) => {
      expect(s(t)).toEqual(['rene', 'surya', 'asura', 'kiran', 'zed']);
      expect(s(t, 'name', true)).toEqual(['old']);
    },
  );
  test('text under 2 chars returns rows in the order given, not sorted', () => {
    const rev = [...rows].reverse();
    expect(ids(dir.searchMembers(rev, { text: '', field: 'phone', archived: false }))).toEqual([
      'zed',
      'kiran',
      'asura',
      'surya',
      'rene',
    ]);
  });
  test('does not mutate the input rows', () => {
    const copy = [...rows];
    dir.searchMembers(rows, { text: 'sur', field: 'name', archived: false });
    expect(rows).toEqual(copy);
  });
});
