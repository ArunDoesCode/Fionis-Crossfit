// Spec: docs/specs/member-records/ux.md (v10) BR-REC-233 (word list):
//   empty gym name -> "Enter the gym name"; setup "Please check below / above" -> "Warn if lower than / Warn if
//   higher than"; "Report table" -> "Show in a group on the report card"; time zone shows city and short name
//   ("India (Kolkata) · IST", value unchanged); empty places get one icon and a warm sentence
//   ("Nobody is overdue. Nice work.").
// Interface: `gymSettingsSchema` (`@/lib/validators/setup`), `SETUP_TEXT` (`@/lib/setup/text`), `emptyDueLine`
// (`@/lib/due/status`) exist. PROPOSED, not yet in the spec: `@/lib/setup/timezones` exports
// `timeZoneLabel(id: string): string` (display text only; the id is still what is saved).
import { beforeAll, describe, expect, test } from 'bun:test';
import { emptyDueLine } from '@/lib/due/status';
import { SETUP_TEXT } from '@/lib/setup/text';
import { gymSettingsSchema } from '@/lib/validators/setup';

const collect = (node: unknown): string[] => {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collect);
  if (typeof node === 'object' && node !== null) return Object.values(node).flatMap(collect);
  return [];
};
const words = collect(SETUP_TEXT);

describe('BR-REC-233 gym name', () => {
  const issues = (gymName: string) => {
    const r = gymSettingsSchema.safeParse({
      gymName,
      timezone: 'Asia/Kolkata',
      upcomingLeadDays: '7',
      expiryLeadDays: '14',
    });
    return r.success
      ? []
      : r.error.issues.filter((i) => i.path[0] === 'gymName').map((i) => i.message);
  };
  test('BR-REC-233 an empty gym name says "Enter the gym name"', () => {
    expect(issues('')).toContain('Enter the gym name');
  });
});

describe('BR-REC-233 setup words', () => {
  test.each(['Warn if lower than', 'Warn if higher than', 'Show in a group on the report card'])(
    'BR-REC-233 the setup text has "%s"',
    (word) => {
      expect(words).toContain(word);
    },
  );
  test.each(['Please check below', 'Please check above', 'Report table'])(
    'BR-REC-233 the old label "%s" is gone',
    (word) => {
      expect(words).not.toContain(word);
    },
  );
});

describe('BR-REC-233 empty places', () => {
  test('BR-REC-233 Overdue empty -> "Nobody is overdue. Nice work."', () => {
    expect(emptyDueLine('overdue')).toBe('Nobody is overdue. Nice work.');
  });
});

describe('BR-REC-233 time zone shows city and short name', () => {
  let mod: { timeZoneLabel(id: string): string };
  beforeAll(async () => {
    mod = (await import('@/lib/setup/timezones')) as unknown as typeof mod;
  });
  test('BR-REC-233 Asia/Kolkata -> "India (Kolkata) · IST" (spec example)', () => {
    expect(mod.timeZoneLabel('Asia/Kolkata')).toBe('India (Kolkata) · IST');
  });
  test('BR-REC-233 the saved value is unchanged: the id is still in the option list', async () => {
    const { timeZoneOptions } = await import('@/lib/setup/timezones');
    expect(timeZoneOptions('Asia/Kolkata')).toContain('Asia/Kolkata');
  });
});
