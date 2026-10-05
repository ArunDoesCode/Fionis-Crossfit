// Spec: docs/specs/member-records/ux.md v9 "Build clarifications (U8)" — BR-REC-189 (errors only on Save, plain
// words), BR-REC-181/182 (whole page, p-4 on every side); assessments.md BR-REC-216 (amended: label = name + unit,
// "Approximate date"). Source scans + schema parses; headless.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EntryMetric } from '@/lib/assessments/types';
import { UI_TEXT } from '@/lib/messages/words';
import * as assessments from '@/lib/validators/assessments';
import * as auth from '@/lib/validators/auth';
import * as members from '@/lib/validators/members';
import * as setup from '@/lib/validators/setup';

const SRC = join(import.meta.dir, '../../src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : /\.(tsx?|css)$/.test(n) ? [f] : [];
  });
const read = (f: string) => readFileSync(f, 'utf8');
const files = walk(SRC);

// The text inside the parentheses of every `useForm(` / `useForm<…>(` call (comments stripped first).
function useFormCalls(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  const re = /\buseForm\b/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    let i = m.index + m[0].length;
    if (code[i] === '<') {
      let d = 0;
      for (; i < code.length; i++) {
        if (code[i] === '<') d++;
        if (code[i] === '>' && code[i - 1] !== '=') d--;
        if (d === 0) {
          i++;
          break;
        }
      }
    }
    if (code[i] !== '(') continue;
    let d = 0;
    const start = i;
    for (; i < code.length; i++) {
      if (code[i] === '(') d++;
      if (code[i] === ')') d--;
      if (d === 0) break;
    }
    out.push(code.slice(start, i + 1));
  }
  return out;
}

describe('BR-REC-189 forms validate only on Save', () => {
  const calls = files.flatMap((f) => useFormCalls(read(f)).map((c) => ({ f, c })));
  test('BR-REC-189 every form component that calls useForm is found', () => {
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });
  test.each(calls.map(({ f, c }) => [f.slice(SRC.length + 1), c] as const))(
    'BR-REC-189 %s sets mode onSubmit and reValidateMode onSubmit',
    (_f, c) => {
      expect(c).toMatch(/mode:\s*['"]onSubmit['"]/);
      expect(c).toMatch(/reValidateMode:\s*['"]onSubmit['"]/);
      expect(c).not.toMatch(/mode:\s*['"](onTouched|onBlur|onChange|all)['"]/);
    },
  );
});

describe('BR-REC-189 schema messages are plain words', () => {
  const BAD = /Invalid input|expected .* received|Required$/i;
  const today = '2026-10-05';
  const metric = (id: string, name: string, over: Partial<EntryMetric> = {}): EntryMetric => ({
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
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0';
  const B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const METRICS = [
    metric(A, 'Weight'),
    metric(B, 'Waist', { decimals: 2 }),
    metric(C, 'Plank', { datatype: 'duration', decimals: 0 }),
  ];
  const entry = assessments.entrySchema({
    metrics: METRICS,
    today,
    member: { fullName: 'Surya', joinedOn: '2025-06-01' },
  });
  const cases: [
    string,
    { safeParse(v: unknown): { success: boolean; error?: { issues: { message: string }[] } } },
  ][] = [
    ['loginSchema', auth.loginSchema],
    ['changePasswordSchema', auth.changePasswordSchema],
    ['memberFormSchema', members.memberFormSchema(today)],
    ['memberEditFormSchema', members.memberEditFormSchema(today)],
    ['periodFormSchema', members.periodFormSchema],
    ['gymSettingsSchema', setup.gymSettingsSchema],
    ['assessmentFormSchema', setup.assessmentFormSchema],
    ['assessmentSheetSchema', setup.assessmentSheetSchema],
    ['measurementFormSchema', setup.measurementFormSchema],
    ['entrySchema', entry],
  ];
  const messages = (s: (typeof cases)[number][1], input: unknown) =>
    s.safeParse(input).error?.issues.map((i) => i.message) ?? [];

  test.each(cases)('BR-REC-189 %s: empty input gives only plain-word messages', (_n, schema) => {
    for (const m of messages(schema, {})) expect(m).not.toMatch(BAD);
  });
  test.each(cases)(
    'BR-REC-189 %s: fields set to undefined give only plain-word messages',
    (_n, schema) => {
      const probe = new Proxy({}, { get: () => undefined, has: () => true });
      for (const m of messages(schema, probe)) expect(m).not.toMatch(BAD);
      for (const m of messages(schema, { values: {} })) expect(m).not.toMatch(BAD);
    },
  );

  test('BR-REC-189 entrySchema: measurements never touched (missing keys) are valid blanks', () => {
    const r = entry.safeParse({ date: '2026-10-01', isEstimated: false, values: { [A]: '80' } });
    expect(r.error?.issues ?? []).toEqual([]);
    expect(r.success).toBe(true);
  });
  test('BR-REC-189 entrySchema: a missing Time measurement is a valid blank', () => {
    const r = entry.safeParse({ date: '2026-10-01', isEstimated: false, values: {} });
    expect(r.error?.issues ?? []).toEqual([]);
  });
  test('BR-REC-189 entrySchema: undefined measurement values report no issue', () => {
    const r = entry.safeParse({
      date: '2026-10-01',
      isEstimated: false,
      values: { [A]: undefined, [B]: undefined, [C]: undefined },
    });
    expect(r.error?.issues ?? []).toEqual([]);
  });
  test('BR-REC-189 entrySchema: a bad number still says "Enter a number like …"', () => {
    const r = entry.safeParse({ date: '2026-10-01', isEstimated: false, values: { [A]: 'abc' } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join('|')).toMatch(/Enter a number like/);
  });
});

describe('BR-REC-216 (amended) Record assessment wording', () => {
  const dir = join(SRC, 'components/pages/assessments');
  test('BR-REC-216 the measurement label is name + unit only, no due tag', () => {
    const f = read(join(dir, 'MetricField.tsx'));
    expect(f).not.toMatch(/·\s*\$\{[^}]*due/i);
    expect(f).not.toMatch(/ASSESSMENT_TEXT\.due\b/);
  });
  test('BR-REC-216 the word list says "Approximate date"', () => {
    expect(JSON.stringify(UI_TEXT)).toContain('"Approximate date"');
  });
  test('BR-REC-216 the old "About" label is gone from the Record form', () => {
    const f = read(join(dir, 'EntryDateSection.tsx')).replace(/\/\/.*$/gm, '');
    expect(f).not.toMatch(/ASSESSMENT_TEXT\.about|WORDS?\.about|['"`]About['"`]/);
    expect(f).not.toMatch(/>\s*About\s*</);
  });
});

describe('BR-REC-181/182 whole page, p-4 on every side', () => {
  const page = read(join(SRC, 'components/common/Page.tsx'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  test('BR-REC-182 Page has no centring or max width', () => {
    expect(page).not.toMatch(/mx-auto/);
    expect(page).not.toMatch(/max-w-/);
    expect(page).not.toMatch(/page-narrow|page-wide/);
  });
  test('BR-REC-181 Page pads p-4 on all sides (no px-only page-px, no 24 px step)', () => {
    expect(page).toMatch(/(^|[\s'"`])(md:)?p-4(?=[\s'"`])/);
    expect(page).not.toMatch(/page-px|pb-page|md:p-6|lg:p-6|p-6/);
  });
  test('BR-REC-182 no file under src uses page-narrow or page-wide', () => {
    const hits = files.filter((f) => /page-narrow|page-wide/.test(read(f)));
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
