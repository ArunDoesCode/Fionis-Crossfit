// Spec: docs/specs/member-records/ux.md (v11) BR-REC-127 — "phones '98450 12345'".
// Bug: Home showed "90000 10016" next to "+919000010019". Stored numbers can carry a country code or a
// leading 0; every list shows them in the one form "98450 12345" (ten digits, groups of five).
import { describe, expect, test } from 'bun:test';
import { formatPhone } from '@/lib/format';
import { memberListDetail } from '@/lib/members/listDetail';

const SHOWN = '90000 10019';

describe('BR-REC-127 formatPhone: one shown form for every stored form', () => {
  test.each<[string, string]>([
    ['ten digits', '9000010019'],
    ['+91 prefix', '+919000010019'],
    ['91 prefix without plus', '919000010019'],
    ['leading 0', '09000010019'],
    ['+91 with spaces', '+91 90000 10019'],
    ['+91 with dashes', '+91-90000-10019'],
    ['already grouped', '90000 10019'],
    ['grouped with a dash', '90000-10019'],
  ])('BR-REC-127 %s -> "90000 10019"', (_name, stored) => {
    expect(formatPhone(stored)).toBe(SHOWN);
  });

  test('BR-REC-127 spec example "98450 12345" from the same three stored forms', () => {
    for (const stored of ['9845012345', '+919845012345', '919845012345', '09845012345']) {
      expect(formatPhone(stored)).toBe('98450 12345');
    }
  });

  test('BR-REC-127 formatting a shown phone again changes nothing', () => {
    for (const stored of ['+919000010019', '09000010019', '9000010019']) {
      expect(formatPhone(formatPhone(stored))).toBe(formatPhone(stored));
    }
  });

  test('BR-REC-127 two members with the same number in different stored forms look identical in a list', () => {
    const shown = ['9000010016', '+919000010016', '919000010016', '09000010016'].map(formatPhone);
    expect(new Set(shown).size).toBe(1);
    expect(shown[0]).toBe('90000 10016');
  });
});

describe('BR-REC-127 member list detail line uses the one phone form', () => {
  const item = (phone: string) => ({
    phone,
    lastAssessedOn: null,
    archivedAt: null,
    membership: { status: 'active', endOn: '2026-12-31' },
  });
  test.each(['+919000010019', '919000010019', '09000010019', '9000010019'])(
    'BR-REC-127 stored "%s" -> "90000 10019 · Never assessed"',
    (stored) => {
      // biome-ignore lint/suspicious/noExplicitAny: only the fields the line reads are given
      expect(memberListDetail(item(stored) as any, '2026-10-05', 'Asia/Kolkata')).toBe(
        `${SHOWN} · Never assessed`,
      );
    },
  );
});
