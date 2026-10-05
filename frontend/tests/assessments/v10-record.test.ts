// Spec: docs/specs/member-records/ux.md (v10) BR-REC-230 (amends assessments BR-REC-216):
//   - a partial save's toast says "Saved 3 for Naveen Kumar · 12 still due"
//   - (v14) a value below 0 or above 100 in a % measurement is a field error "Use 0 to 100" (no "Save anyway")
//   - "Paper column" and "Save & next date" sit in a closed "Copying from the paper card?" Collapsible
// Interface: `entrySchema` (`@/lib/validators/assessments`) and `savedMessage` (`@/lib/assessments/labels`) exist;
// PROPOSED, not yet in the spec: `savedMessage(count, memberName, stillDue?: number)` — when `stillDue` is above 0
// the partial-save text of the rule is returned (full member name, not the first word); with 0 or no third argument
// the BR-REC-84 text ("Saved 9 results for Surya") is unchanged.
import { beforeAll, describe, expect, test } from 'bun:test';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { EntryMetric } from '@/lib/assessments/types';
import { entrySchema } from '@/lib/validators/assessments';

interface Labels {
  savedMessage(count: number, memberName: string, stillDue?: number): string;
}
let labels: Labels;
beforeAll(async () => {
  labels = (await import('@/lib/assessments/labels')) as unknown as Labels;
});

describe('BR-REC-230 partial save toast', () => {
  test('BR-REC-230 3 saved, 12 still due -> "Saved 3 for Naveen Kumar · 12 still due" (spec example)', () => {
    expect(labels.savedMessage(3, 'Naveen Kumar', 12)).toBe(
      'Saved 3 for Naveen Kumar · 12 still due',
    );
  });
  test('BR-REC-230 the full name is shown, not the first word', () => {
    expect(labels.savedMessage(1, 'Surya Pratap', 14)).toContain('Surya Pratap');
  });
  test('BR-REC-230 nothing still due: the BR-REC-84 text stays', () => {
    expect(labels.savedMessage(9, 'Surya Pratap', 0)).toBe('Saved 9 results for Surya');
    expect(labels.savedMessage(9, 'Surya Pratap')).toBe('Saved 9 results for Surya');
  });
});

describe('BR-REC-230 the paper tools are behind "Copying from the paper card?"', () => {
  const strings = JSON.stringify(
    Object.values(ASSESSMENT_TEXT).filter((v) => typeof v === 'string'),
  );
  test('BR-REC-230 the dictionary has the heading, "Paper column" and "Save & next date"', () => {
    expect(strings).toContain('Copying from the paper card?');
    expect(strings).toContain('Paper column');
    expect(strings).toContain('Save & next date');
  });
});

const PCT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const KG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const metric = (id: string, name: string, over: Partial<EntryMetric>): EntryMetric => ({
  id,
  name,
  unit: '',
  datatype: 'number',
  decimals: 1,
  better: 'none',
  plausibleMin: null,
  plausibleMax: null,
  previous: null,
  tableGroup: null,
  tablePart: null,
  ...over,
});
const schema = entrySchema({
  metrics: [metric(PCT, 'Body fat', { unit: '%' }), metric(KG, 'Weight', { unit: 'kg' })],
  today: '2026-10-03',
  member: { fullName: 'Surya Pratap', joinedOn: '2025-06-01' },
});
const run = (pct: string, kg = '') =>
  schema.safeParse({ date: '2026-10-01', isEstimated: false, values: { [PCT]: pct, [KG]: kg } });
const messagesAt = (r: ReturnType<typeof run>, path: string) =>
  r.success ? [] : r.error.issues.filter((i) => i.path.join('.') === path).map((i) => i.message);

describe('BR-REC-230 a % measurement below 0 or above 100 is a field error', () => {
  test('BR-REC-230 101 % -> "Use 0 to 100" on that field', () => {
    expect(messagesAt(run('101'), `values.${PCT}`)).toEqual(['Use 0 to 100']);
  });
  test('BR-REC-230 250 % -> "Use 0 to 100"', () => {
    expect(messagesAt(run('250'), `values.${PCT}`)).toEqual(['Use 0 to 100']);
  });
  test('BR-REC-230 (v14) -1 % -> "Use 0 to 100" on that field', () => {
    expect(messagesAt(run('-1'), `values.${PCT}`)).toEqual(['Use 0 to 100']);
  });
  test('BR-REC-230 (v14) -0,5 % (comma decimal) -> "Use 0 to 100"', () => {
    expect(messagesAt(run('-0,5'), `values.${PCT}`)).toEqual(['Use 0 to 100']);
  });
  test('BR-REC-230 (v14) -20 % -> "Use 0 to 100" and the form is not valid', () => {
    const r = run('-20');
    expect(r.success).toBe(false);
    expect(messagesAt(r, `values.${PCT}`)).toEqual(['Use 0 to 100']);
  });
  test('BR-REC-230 (v14) the 0 limit is only for % measurements: -5 kg is not a "Use 0 to 100" error', () => {
    expect(messagesAt(run('', '-5'), `values.${KG}`)).not.toContain('Use 0 to 100');
  });
  test('BR-REC-230 100 % is accepted (the limit is inclusive)', () => {
    expect(run('100').success).toBe(true);
  });
  test('BR-REC-230 0 % and 24.5 % are accepted', () => {
    expect(run('0').success).toBe(true);
    expect(run('24,5').success).toBe(true);
  });
  test('BR-REC-230 the 0 to 100 limit is only for % measurements: 150 kg is accepted', () => {
    expect(run('', '150').success).toBe(true);
  });
  test('BR-REC-230 an invalid % does not stop other fields being checked: error only on the % field', () => {
    const r = run('101', '80');
    expect(messagesAt(r, `values.${KG}`)).toEqual([]);
  });
});
