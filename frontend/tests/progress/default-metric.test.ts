// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-111 "pick a measurement (default Body fat)".
//   P11        Default measurement: the first measurement that is on whose name starts with "Body fat" (any case),
//              else the first one that is on. The measurement list shows measurements that are on.
// Interface: docs/specs/member-records/progress.md — `@/lib/progress/filters`:
//   `pickDefaultMetricId(catalog)`; `catalog` = E09 items (assessments with `metrics[]`, as returned, already in
//   setup order). Among measurements with `isActive` whose assessment `isActive`: the first whose name starts with
//   "body fat" (case-insensitive, after trimming), else the first; `null` when none.
import { beforeAll, describe, expect, test } from 'bun:test';

interface CatalogMetric {
  id: string;
  name: string;
  unit: string;
  datatype: 'number' | 'duration';
  decimals: number;
  better: 'higher' | 'lower' | 'none';
  isActive: boolean;
  sortOrder: number;
  hasValues: boolean;
}

interface CatalogType {
  id: string;
  name: string;
  intervalCount: number;
  intervalUnit: 'week' | 'month';
  isActive: boolean;
  sortOrder: number;
  hasValues: boolean;
  metrics: CatalogMetric[];
}

interface Filters {
  pickDefaultMetricId(catalog: CatalogType[]): string | null;
}

let filters: Filters;

beforeAll(async () => {
  filters = (await import('@/lib/progress/filters')) as unknown as Filters;
});

let counter = 0;
const nextId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

const metric = (name: string, isActive = true): CatalogMetric => ({
  id: nextId(),
  name,
  unit: '%',
  datatype: 'number',
  decimals: 1,
  better: 'lower',
  isActive,
  sortOrder: 0,
  hasValues: false,
});

const assessment = (name: string, metrics: CatalogMetric[], isActive = true): CatalogType => ({
  id: nextId(),
  name,
  intervalCount: 1,
  intervalUnit: 'month',
  isActive,
  sortOrder: 0,
  hasValues: false,
  metrics,
});

describe('P11 pickDefaultMetricId: Body fat first', () => {
  test('P11 Body fat is chosen even when other measurements come before it, and even in a later assessment', () => {
    const weight = metric('Weight');
    const bodyFat = metric('Body fat %');
    const fran = metric('Fran');
    const catalog = [
      assessment('Body composition', [weight]),
      assessment('Fitness test', [fran]),
      assessment('Skin folds', [bodyFat]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(bodyFat.id);
  });

  test('P11 the id returned is the measurement id, not the assessment id', () => {
    const bodyFat = metric('Body fat');
    const type = assessment('Body composition', [metric('Weight'), bodyFat]);
    const picked = filters.pickDefaultMetricId([type]);
    expect(picked).toBe(bodyFat.id);
    expect(picked).not.toBe(type.id);
  });

  test.each([
    ['Body fat'],
    ['Body fat %'],
    ['body fat'],
    ['BODY FAT %'],
    ['Body Fat (est.)'],
    ['bOdY fAt'],
  ])('P11 the name %j counts as Body fat (any case)', (name) => {
    const bodyFat = metric(name);
    const catalog = [assessment('Body composition', [metric('Weight'), bodyFat])];
    expect(filters.pickDefaultMetricId(catalog)).toBe(bodyFat.id);
  });

  test('P11 spaces around the name are ignored ("  Body fat %" starts with body fat)', () => {
    const bodyFat = metric('  Body fat %  ');
    const catalog = [assessment('Body composition', [metric('Weight'), bodyFat])];
    expect(filters.pickDefaultMetricId(catalog)).toBe(bodyFat.id);
  });

  test('P11 a name that only contains "body fat" later (not at the start) is not Body fat', () => {
    const weight = metric('Weight');
    const lean = metric('Lean body fat free mass');
    const catalog = [assessment('Body composition', [weight, lean])];
    expect(filters.pickDefaultMetricId(catalog)).toBe(weight.id);
  });

  test('P11 two Body fat measurements that are on: the first in the list wins', () => {
    const first = metric('Body fat %');
    const second = metric('Body fat (caliper)');
    const catalog = [
      assessment('Body composition', [metric('Weight'), first]),
      assessment('Skin folds', [second]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(first.id);
  });
});

describe('P11 pickDefaultMetricId: only measurements that are on', () => {
  test('P11 a Body fat that is turned off is skipped; the first one that is on is chosen', () => {
    const weight = metric('Weight');
    const catalog = [assessment('Body composition', [weight, metric('Body fat %', false)])];
    expect(filters.pickDefaultMetricId(catalog)).toBe(weight.id);
  });

  test('P11 a Body fat that is turned off is skipped in favour of a later Body fat that is on', () => {
    const later = metric('Body fat (caliper)');
    const catalog = [
      assessment('Body composition', [metric('Body fat %', false), metric('Weight')]),
      assessment('Skin folds', [later]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(later.id);
  });

  test('P11 a Body fat inside an assessment that is turned off is skipped', () => {
    const fran = metric('Fran');
    const catalog = [
      assessment('Old body composition', [metric('Body fat %')], false),
      assessment('Fitness test', [fran]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(fran.id);
  });

  test('P11 no Body fat anywhere: the first measurement that is on, skipping off ones and off assessments', () => {
    const wanted = metric('Deadlift');
    const catalog = [
      assessment('Old test', [metric('Squat')], false),
      assessment('Strength', [metric('Bench press', false), wanted, metric('Row')]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(wanted.id);
  });

  test('P11 an assessment with no measurements is stepped over', () => {
    const fran = metric('Fran');
    const catalog = [assessment('Empty', []), assessment('Fitness test', [fran])];
    expect(filters.pickDefaultMetricId(catalog)).toBe(fran.id);
  });

  test('P11 the first measurement that is on when there is no Body fat is the first in setup order', () => {
    const first = metric('Weight');
    const catalog = [
      assessment('Body composition', [first, metric('Height')]),
      assessment('Fitness test', [metric('Fran')]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBe(first.id);
  });
});

describe('P11 pickDefaultMetricId: nothing to pick', () => {
  test('P11 an empty catalog gives null', () => {
    expect(filters.pickDefaultMetricId([])).toBeNull();
  });

  test('P11 assessments without measurements give null', () => {
    expect(
      filters.pickDefaultMetricId([assessment('Empty', []), assessment('Also empty', [])]),
    ).toBeNull();
  });

  test('P11 every measurement off gives null (even a Body fat)', () => {
    const catalog = [
      assessment('Body composition', [metric('Body fat %', false), metric('Weight', false)]),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBeNull();
  });

  test('P11 every assessment off gives null', () => {
    const catalog = [
      assessment('Body composition', [metric('Body fat %'), metric('Weight')], false),
      assessment('Fitness test', [metric('Fran')], false),
    ];
    expect(filters.pickDefaultMetricId(catalog)).toBeNull();
  });
});
