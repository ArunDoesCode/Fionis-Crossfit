// Spec: docs/specs/member-records/ux.md · BR-REC-193 (day bridge), BR-REC-191 (Monday), U3 build clarifications.
// `isoToDate(iso)` = local midnight; `dateToIso(d)` = from LOCAL fields, never via UTC. The round trip is checked
// in a subprocess per time zone because Bun reads TZ once, at the first Date use.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEEK_STARTS_ON } from '@/lib/dates/dayPicker';

const ZONES = ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'];
const DAYS = [
  '2026-10-03', // spec example: pick 3 Oct in IST
  '2026-01-31',
  '2026-02-28',
  '2028-02-29', // leap day
  '2024-02-29',
  '2026-03-01',
  '2026-12-31', // year edges
  '2027-01-01',
  '2026-01-01',
  '1900-01-01',
  '2026-03-29', // DST changes in some zones
  '2026-10-25',
  '2026-11-01',
];

const SCRIPT = `
import { dateToIso, isoToDate } from '@/lib/dates/dayPicker';
const days = JSON.parse(process.env.DAYS ?? '[]');
const out = days.map((iso) => {
  const d = isoToDate(iso);
  return {
    iso,
    back: dateToIso(d),
    local: [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()],
  };
});
console.log('RESULT' + JSON.stringify(out));
`;

const frontendRoot = join(import.meta.dir, '..', '..');

const runIn = (zone: string) => {
  const file = join(frontendRoot, `.tz-probe-${zone.replace('/', '_')}.ts`);
  require('node:fs').writeFileSync(file, SCRIPT);
  try {
    const proc = Bun.spawnSync(['bun', file], {
      cwd: frontendRoot,
      env: { ...process.env, TZ: zone, DAYS: JSON.stringify(DAYS) },
    });
    const stdout = proc.stdout.toString();
    const line = stdout.split('\n').find((l) => l.startsWith('RESULT'));
    if (!line) throw new Error(`probe failed in ${zone}: ${proc.stderr.toString()} ${stdout}`);
    return JSON.parse(line.slice(6)) as {
      iso: string;
      back: string;
      local: number[];
    }[];
  } finally {
    require('node:fs').rmSync(file, { force: true });
  }
};

describe('BR-REC-193 isoToDate / dateToIso round trip in other time zones', () => {
  for (const zone of ZONES) {
    const results = (() => {
      try {
        return runIn(zone);
      } catch (error) {
        return error as Error;
      }
    })();
    test.each(DAYS)(`BR-REC-193 %s round-trips in ${zone}`, (iso) => {
      if (results instanceof Error) throw results;
      const row = results.find((r) => r.iso === iso);
      expect(row?.back).toBe(iso);
    });
    test(`BR-REC-193 isoToDate is local midnight in ${zone}`, () => {
      if (results instanceof Error) throw results;
      for (const row of results) {
        const [y, m, d] = row.iso.split('-').map(Number) as [number, number, number];
        expect(row.local).toEqual([y, m, d, 0, 0]);
      }
    });
  }
});

describe('BR-REC-193 the bridge never goes through UTC (source text)', () => {
  const read = (path: string) => readFileSync(join(frontendRoot, path), 'utf8');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const files = [
    'src/lib/dates/dayPicker.ts',
    'src/lib/dates/month.ts',
    'src/components/common/DatePicker.tsx',
    'src/components/common/DatePickerCalendar.tsx',
    'src/components/common/MonthPicker.tsx',
  ];
  test.each(files)('BR-REC-193 %s has no toISOString and no new Date(<iso string>)', (path) => {
    const code = stripComments(read(path));
    expect(code).not.toContain('toISOString');
    expect(code).not.toMatch(/new Date\(\s*['"`]/);
    expect(code).not.toMatch(/new Date\(\s*(iso|value|date|day)\s*\)/);
  });
});

describe('BR-REC-191 weeks start on Monday', () => {
  test('WEEK_STARTS_ON is 1', () => {
    expect(WEEK_STARTS_ON).toBe(1);
  });
});
