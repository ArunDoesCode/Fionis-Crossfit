// Spec: docs/specs/member-records/ux.md (v6) "Build clarifications (U2)" — one number parser (BR-REC-197).
// Setup schemas take the typed TEXT of a number box through the shared parser. Messages:
//   blank required -> "Enter a number"; not a number -> "Enter a number like 7" (whole numbers) /
//   "Enter a number like 95.5" (decimals); out of range keeps "Use 0 to 30 days".
import { describe, expect, test } from 'bun:test';
import type { ZodType } from 'zod';
import { gymSettingsSchema, measurementFormSchema } from '@/lib/validators/setup';

interface Issue {
  path: PropertyKey[];
  message: string;
}
const issuesOf = (schema: ZodType, input: unknown): Issue[] => {
  const r = schema.safeParse(input);
  return r.success ? [] : r.error.issues.map(({ path, message }) => ({ path, message }));
};
const messagesOn = (issues: Issue[], field: string) =>
  issues.filter((i) => i.path[0] === field).map((i) => i.message);

const settings = (o: Record<string, unknown> = {}) => ({
  gymName: 'Fionis CrossFit',
  timezone: 'Asia/Kolkata',
  upcomingLeadDays: '7',
  expiryLeadDays: '14',
  ...o,
});

describe('BR-REC-197 gym settings numeric fields (whole numbers) use the shared parser messages', () => {
  for (const field of ['upcomingLeadDays', 'expiryLeadDays']) {
    test(`BR-REC-197 blank ${field} -> "Enter a number"`, () => {
      expect(messagesOn(issuesOf(gymSettingsSchema, settings({ [field]: '' })), field)).toEqual([
        'Enter a number',
      ]);
    });
    test(`BR-REC-197 "abc" in ${field} -> "Enter a number like 7"`, () => {
      expect(messagesOn(issuesOf(gymSettingsSchema, settings({ [field]: 'abc' })), field)).toEqual([
        'Enter a number like 7',
      ]);
    });
    test(`BR-REC-197 spaces only in ${field} -> "Enter a number"`, () => {
      expect(messagesOn(issuesOf(gymSettingsSchema, settings({ [field]: '  ' })), field)).toEqual([
        'Enter a number',
      ]);
    });
  }

  test('BR-REC-197 "45" for Due soon keeps "Use 0 to 30 days"', () => {
    expect(
      messagesOn(
        issuesOf(gymSettingsSchema, settings({ upcomingLeadDays: '45' })),
        'upcomingLeadDays',
      ),
    ).toEqual(['Use 0 to 30 days']);
  });

  test('BR-REC-197 valid text is accepted and comes back as a number', () => {
    const r = gymSettingsSchema.safeParse(settings());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.upcomingLeadDays).toBe(7);
      expect(r.data.expiryLeadDays).toBe(14);
    }
  });
});

describe('BR-REC-197 measurement check range (decimals) uses the shared parser messages', () => {
  const measurement = (o: Record<string, unknown> = {}) => ({
    name: 'Weight',
    datatype: 'number',
    unit: 'kg',
    decimals: 1,
    better: 'none',
    plausibleMin: '',
    plausibleMax: '',
    intervalCount: null,
    intervalUnit: null,
    tableGroup: null,
    tablePart: null,
    isActive: true,
    ...o,
  });

  test('BR-REC-197 "abc" in the check range -> "Enter a number like 95.5"', () => {
    expect(
      messagesOn(
        issuesOf(measurementFormSchema, measurement({ plausibleMin: 'abc' })),
        'plausibleMin',
      ),
    ).toEqual(['Enter a number like 95.5']);
  });

  test('BR-REC-197 "95,5" is accepted as 95.5', () => {
    const r = measurementFormSchema.safeParse(
      measurement({ plausibleMin: '10,5', plausibleMax: '95,5' }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.plausibleMin).toBe(10.5);
      expect(r.data.plausibleMax).toBe(95.5);
    }
  });
});
