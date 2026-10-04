// Spec: docs/specs/member-records/members.md
//   BR-REC-47 — the duplicate-phone warning shows under the phone field, names the other member(s) (archived ones
//               marked "archived") with an "Open" link, and never blocks saving.
//               Example: type Anita's phone -> "Also used by Anita Rao · Open".
//   BR-REC-04 — families share phones: the same phone is warned about, never refused.
// Interface: .pipeline/member-records-members/contract.md "Admin app interfaces" — `@/lib/members/duplicates`:
//   `duplicatePhoneMatches(items, selfId?)` -> [{ id, label }]: other members only (drops `selfId`); label = full
//   name, archived ones "Anita Rao (archived)". The form joins the labels with ", " and keeps Save enabled.
import { beforeAll, describe, expect, test } from 'bun:test';

interface ListItem {
  id: string;
  fullName: string;
  phone: string;
  lastAssessedOn: string | null;
  archivedAt: string | null;
  membership: {
    status: 'active' | 'expiring' | 'expired';
    plan: 'monthly' | 'quarterly' | 'half_annual' | 'annual';
    endOn: string;
    daysLeft: number;
  };
}

interface Duplicates {
  duplicatePhoneMatches(items: ListItem[], selfId?: string): { id: string; label: string }[];
}

let duplicates: Duplicates;

beforeAll(async () => {
  duplicates = (await import('@/lib/members/duplicates')) as unknown as Duplicates;
});

const person = (id: string, fullName: string, archivedAt: string | null = null): ListItem => ({
  id,
  fullName,
  phone: '+919845012345',
  lastAssessedOn: null,
  archivedAt,
  membership: { status: 'active', plan: 'annual', endOn: '2026-12-31', daysLeft: 89 },
});

const anita = person('member-anita', 'Anita Rao');
const bala = person('member-bala', 'Bala Rao');
const chitra = person('member-chitra', 'Chitra Rao', '2026-06-02T08:00:00.000Z');

describe('BR-REC-47 duplicatePhoneMatches', () => {
  test('BR-REC-47 no other member uses the phone: nothing to warn about', () => {
    expect(duplicates.duplicatePhoneMatches([])).toEqual([]);
  });

  test('BR-REC-47 one other member: their id and their full name', () => {
    expect(duplicates.duplicatePhoneMatches([anita])).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
    ]);
  });

  test('BR-REC-47 an archived member is marked "(archived)" in the label', () => {
    expect(duplicates.duplicatePhoneMatches([chitra])).toEqual([
      { id: 'member-chitra', label: 'Chitra Rao (archived)' },
    ]);
  });

  test('BR-REC-47 several members: every one of them is named, archived ones marked', () => {
    expect(duplicates.duplicatePhoneMatches([anita, bala, chitra])).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
      { id: 'member-bala', label: 'Bala Rao' },
      { id: 'member-chitra', label: 'Chitra Rao (archived)' },
    ]);
  });

  test('BR-REC-47 only archived members share the phone: still listed, still marked', () => {
    const second = person('member-dev', 'Dev Rao', '2026-01-10T08:00:00.000Z');
    expect(duplicates.duplicatePhoneMatches([chitra, second])).toEqual([
      { id: 'member-chitra', label: 'Chitra Rao (archived)' },
      { id: 'member-dev', label: 'Dev Rao (archived)' },
    ]);
  });

  test('BR-REC-47 the member being edited is dropped (their own phone is not a duplicate)', () => {
    expect(duplicates.duplicatePhoneMatches([anita], 'member-anita')).toEqual([]);
  });

  test('BR-REC-47 the member being edited is dropped, the others stay', () => {
    expect(duplicates.duplicatePhoneMatches([anita, bala, chitra], 'member-bala')).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
      { id: 'member-chitra', label: 'Chitra Rao (archived)' },
    ]);
  });

  test('BR-REC-47 an archived member being edited is dropped too', () => {
    expect(duplicates.duplicatePhoneMatches([anita, chitra], 'member-chitra')).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
    ]);
  });

  test('BR-REC-47 an id that is not in the list changes nothing', () => {
    expect(duplicates.duplicatePhoneMatches([anita, bala], 'member-unknown')).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
      { id: 'member-bala', label: 'Bala Rao' },
    ]);
  });

  test('BR-REC-47 on the Add form there is no selfId: every match is listed', () => {
    expect(duplicates.duplicatePhoneMatches([anita, bala], undefined)).toHaveLength(2);
  });

  test('BR-REC-04 the same name with the same phone is also a match (names may repeat)', () => {
    const twin = person('member-anita-2', 'Anita Rao');
    expect(duplicates.duplicatePhoneMatches([anita, twin])).toEqual([
      { id: 'member-anita', label: 'Anita Rao' },
      { id: 'member-anita-2', label: 'Anita Rao' },
    ]);
  });

  test('BR-REC-47 the labels join into the warning text the spec shows', () => {
    const labels = duplicates.duplicatePhoneMatches([anita]).map((match) => match.label);
    expect(`Also used by ${labels.join(', ')} · Open`).toBe('Also used by Anita Rao · Open');
  });

  test('BR-REC-47 the list it is given is not changed (a pure function)', () => {
    const items = [anita, bala, chitra];
    const copy = structuredClone(items);
    duplicates.duplicatePhoneMatches(items, 'member-bala');
    expect(items).toEqual(copy);
  });
});
