// Spec: docs/specs/member-records/ux.md · BR-REC-192, 194 (grep: no native date inputs), U3 build clarifications;
// performance.md BR-REC-215 (calendar only as an on-demand chunk). Source-text checks.
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dir, '..', '..');
const src = join(root, 'src');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const files = walk(src).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (path: string) => readFileSync(path, 'utf8');
const rel = (f: string) => relative(root, f);

describe('BR-REC-192 / 194 no native date inputs left', () => {
  test.each(['date', 'month', 'datetime-local', 'time'])('no type="%s" under src', (kind) => {
    const re = new RegExp(`type\\s*=\\s*(\\{\\s*)?['"\`]${kind}['"\`]`);
    const hits = files.filter((f) => re.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe('U3 the old date components are gone', () => {
  test.each([
    'src/components/common/DateField.tsx',
    'src/components/pages/members/MemberDateField.tsx',
    'src/components/pages/progress/MonthField.tsx',
    'src/lib/assessments/useDeferredDate.ts',
    'src/lib/members/dayText.ts',
  ])('%s does not exist', (path) => {
    expect(existsSync(join(root, path))).toBe(false);
  });
  test('nothing imports the removed modules', () => {
    const hits = files
      .filter((f) =>
        /(DateField|MemberDateField|MonthField|useDeferredDate|members\/dayText|formatDayWithYear)/.test(
          read(f),
        ),
      )
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe('BR-REC-215 the calendar is an on-demand chunk', () => {
  test('only DatePickerCalendar.tsx imports components/ui/calendar', () => {
    const hits = files
      .filter((f) => /from\s+['"]@\/components\/ui\/calendar['"]/.test(read(f)))
      .map(rel)
      .filter((f) => f !== 'src/components/ui/calendar.tsx');
    expect(hits).toEqual(['src/components/common/DatePickerCalendar.tsx']);
  });
  test.each(['DatePicker', 'MonthPicker'])(
    '%s loads DatePickerCalendar with next/dynamic',
    (name) => {
      const code = read(join(src, 'components/common', `${name}.tsx`));
      expect(code).toMatch(/from\s+['"]next\/dynamic['"]/);
      expect(code).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*['"][^'"]*DatePickerCalendar['"]/);
      expect(code).not.toMatch(/^import[^;]*DatePickerCalendar/m);
    },
  );
  test('react-day-picker is imported only by components/ui/calendar.tsx', () => {
    const hits = files.filter((f) => /from\s+['"]react-day-picker/.test(read(f))).map(rel);
    expect(hits.filter((f) => f !== 'src/components/ui/calendar.tsx')).toEqual([]);
  });
});

describe('BR-REC-192 DatePicker props and trigger', () => {
  const code = () => read(join(src, 'components/common/DatePicker.tsx'));
  test.each(['min', 'max', 'today', 'yearRange', 'variant'])(
    'DatePicker has a "%s" prop',
    (prop) => {
      expect(code()).toMatch(new RegExp(`\\b${prop}\\??\\s*:`));
    },
  );
  test('the trigger button carries the field id', () => {
    expect(code()).toMatch(/<Button[^>]*\bid=\{id\}|<button[^>]*\bid=\{id\}|\bid=\{id\}/);
  });
  test('the shown date comes from formatDay (BR-REC-191)', () => {
    expect(code()).toMatch(/formatDay/);
  });
});

describe('BR-REC-191 one date formatter', () => {
  test('no other module defines a "MMM yyyy" day formatter with a month-name table', () => {
    const hits = files
      .filter((f) => /['"]Jan['"]\s*,\s*['"]Feb['"]/.test(read(f)))
      .map(rel)
      .sort();
    expect(hits).toEqual(['src/lib/format.ts']);
  });
});
