// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-111 Gym progress: pick a measurement, filter by join month from-to, plan, sex, age band; "filters stay
//              in the web address so a view can be bookmarked". Example: Body fat, joined Jan-Mar 2026, Female.
//   P11        S13 URL keys: `metric`, `joinedFrom`, `joinedTo` (YYYY-MM), `plan`, `sex`, `age` (an age-band code);
//              unknown values are ignored.
//   BR-REC-114 age bands: under20, 20to29, 30to39, 40to49, 50to59, 60plus (E36 `ageBand` values).
// Interface: .pipeline/member-records-progress/contract.md "Admin app interfaces" — `@/lib/progress/filters`:
//   `parseProgressFilters(params)`, `progressFiltersSearch(filters)`, `toProgressQuery(metricId, filters)`.
//   Plan codes as the spec writes them (`half_annual`); sex `male` / `female`.
import { beforeAll, describe, expect, test } from 'bun:test';

type Plan = 'monthly' | 'quarterly' | 'half_annual' | 'annual';
type Sex = 'male' | 'female';
type AgeBand = 'under20' | '20to29' | '30to39' | '40to49' | '50to59' | '60plus';

interface ProgressFilters {
  metricId?: string;
  joinedFrom?: string;
  joinedTo?: string;
  plan?: Plan;
  sex?: Sex;
  ageBand?: AgeBand;
}

interface Filters {
  parseProgressFilters(params: Record<string, string | string[] | undefined>): ProgressFilters;
  progressFiltersSearch(filters: ProgressFilters): string;
  toProgressQuery(metricId: string, filters: ProgressFilters): Record<string, unknown>;
}

let filters: Filters;

beforeAll(async () => {
  filters = (await import('@/lib/progress/filters')) as unknown as Filters;
});

const METRIC = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER_METRIC = '11111111-1111-4111-8111-111111111111';

const PLANS: Plan[] = ['monthly', 'quarterly', 'half_annual', 'annual'];
const SEXES: Sex[] = ['male', 'female'];
const AGE_BANDS: AgeBand[] = ['under20', '20to29', '30to39', '40to49', '50to59', '60plus'];

describe('BR-REC-111 parseProgressFilters: reading the web address', () => {
  test('BR-REC-111 an address with no filters gives no filters', () => {
    expect(filters.parseProgressFilters({})).toEqual({});
  });

  test('BR-REC-111 every key is read into its filter (the age key becomes ageBand)', () => {
    expect(
      filters.parseProgressFilters({
        metric: METRIC,
        joinedFrom: '2026-01',
        joinedTo: '2026-03',
        plan: 'half_annual',
        sex: 'female',
        age: '20to29',
      }),
    ).toEqual({
      metricId: METRIC,
      joinedFrom: '2026-01',
      joinedTo: '2026-03',
      plan: 'half_annual',
      sex: 'female',
      ageBand: '20to29',
    });
  });

  test('BR-REC-111 the age key is read as ageBand and no "age" filter is returned', () => {
    const parsed = filters.parseProgressFilters({ age: '60plus' });
    expect(parsed).toEqual({ ageBand: '60plus' });
    expect('age' in parsed).toBe(false);
  });

  test('P11 keys that are not S13 keys are ignored', () => {
    expect(filters.parseProgressFilters({ foo: 'bar', utm_source: 'x', page: '2' })).toEqual({});
  });

  test('P11 an undefined value is the same as a missing key', () => {
    expect(
      filters.parseProgressFilters({
        metric: undefined,
        plan: undefined,
        sex: 'male',
        age: undefined,
      }),
    ).toEqual({ sex: 'male' });
  });
});

describe('BR-REC-111 / P11 metric must be a UUID', () => {
  test.each([[METRIC], [OTHER_METRIC]])('P11 metric %s is kept', (metric) => {
    expect(filters.parseProgressFilters({ metric })).toEqual({ metricId: metric });
  });

  test.each([
    ['not-a-uuid'],
    [''],
    ['12345'],
    [`${METRIC}0`], // one character too many
    [METRIC.slice(0, -1)], // one character too few
    [METRIC.replace(/-/g, '')], // no dashes
    ['Body fat'],
    ['7c9e6679-7425-40de-944b-e07fc1f90aeg'], // not hex
  ])('P11 metric %j is dropped', (metric) => {
    expect(filters.parseProgressFilters({ metric })).toEqual({});
  });
});

describe('BR-REC-111 / P11 join months are YYYY-MM with a month from 01 to 12', () => {
  const valid = ['2026-01', '2026-12', '2026-10', '2026-09', '1999-05', '2030-07'];
  const invalid = [
    '2026-00',
    '2026-13',
    '2026-99',
    '2026-1',
    '2026-001',
    '26-01',
    '2026/01',
    '2026-01-15', // a full date is not a month
    ' 2026-01',
    '2026-01 ',
    'January 2026',
    '2026-1a',
    '',
    'abc',
  ];

  test.each(valid)('P11 joinedFrom %s is kept', (month) => {
    expect(filters.parseProgressFilters({ joinedFrom: month })).toEqual({ joinedFrom: month });
  });

  test.each(valid)('P11 joinedTo %s is kept', (month) => {
    expect(filters.parseProgressFilters({ joinedTo: month })).toEqual({ joinedTo: month });
  });

  test.each(invalid)('P11 joinedFrom %j is dropped', (month) => {
    expect(filters.parseProgressFilters({ joinedFrom: month })).toEqual({});
  });

  test.each(invalid)('P11 joinedTo %j is dropped', (month) => {
    expect(filters.parseProgressFilters({ joinedTo: month })).toEqual({});
  });
});

describe('BR-REC-111 / BR-REC-114 / P11 plan, sex and age band must be one of their codes', () => {
  test.each(PLANS)('P11 plan %s is kept', (plan) => {
    expect(filters.parseProgressFilters({ plan })).toEqual({ plan });
  });

  test.each(SEXES)('P11 sex %s is kept', (sex) => {
    expect(filters.parseProgressFilters({ sex })).toEqual({ sex });
  });

  test.each(AGE_BANDS)('BR-REC-114 age band %s is kept', (age) => {
    expect(filters.parseProgressFilters({ age })).toEqual({ ageBand: age });
  });

  test.each([['weekly'], ['Monthly'], ['half-annual'], ['halfAnnual'], ['half annual'], ['']])(
    'P11 plan %j is dropped',
    (plan) => {
      expect(filters.parseProgressFilters({ plan })).toEqual({});
    },
  );

  test.each([['other'], ['Male'], ['FEMALE'], ['m'], ['']])('P11 sex %j is dropped', (sex) => {
    expect(filters.parseProgressFilters({ sex })).toEqual({});
  });

  test.each([
    ['20-29'],
    ['under 20'],
    ['Under 20'], // the label is not the code
    ['70plus'],
    ['60+'],
    ['30'],
    ['20to30'],
    ['10to19'],
    ['all'],
    [''],
  ])('P11 age band %j is dropped', (age) => {
    expect(filters.parseProgressFilters({ age })).toEqual({});
  });

  test('P11 a bad value is dropped and the good ones next to it stay', () => {
    expect(
      filters.parseProgressFilters({
        metric: 'nope',
        joinedFrom: '2026-13',
        plan: 'weekly',
        sex: 'female',
        age: '30to39',
      }),
    ).toEqual({ sex: 'female', ageBand: '30to39' });
  });
});

describe('BR-REC-111 / P11 a repeated key gives its first entry', () => {
  test('P11 the first entry of an array is used', () => {
    expect(filters.parseProgressFilters({ plan: ['annual', 'monthly'] })).toEqual({
      plan: 'annual',
    });
    expect(filters.parseProgressFilters({ sex: ['female', 'male'] })).toEqual({ sex: 'female' });
    expect(filters.parseProgressFilters({ age: ['40to49', '50to59'] })).toEqual({
      ageBand: '40to49',
    });
    expect(filters.parseProgressFilters({ metric: [METRIC, OTHER_METRIC] })).toEqual({
      metricId: METRIC,
    });
    expect(filters.parseProgressFilters({ joinedFrom: ['2026-01', '2026-02'] })).toEqual({
      joinedFrom: '2026-01',
    });
  });

  test('P11 an invalid first entry is dropped (a later entry does not replace it)', () => {
    expect(filters.parseProgressFilters({ plan: ['weekly', 'monthly'] })).toEqual({});
  });

  test('P11 an empty array is dropped', () => {
    expect(filters.parseProgressFilters({ plan: [], sex: [] })).toEqual({});
  });
});

describe('BR-REC-111 / P11 months that are the wrong way round are swapped', () => {
  test('P11 from after to: the two months swap', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-05', joinedTo: '2026-02' })).toEqual({
      joinedFrom: '2026-02',
      joinedTo: '2026-05',
    });
  });

  test('P11 from after to across a year: the two months swap', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2027-01', joinedTo: '2026-12' })).toEqual({
      joinedFrom: '2026-12',
      joinedTo: '2027-01',
    });
  });

  test('P11 from before to: nothing changes (Jan-Mar 2026, the spec example)', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-01', joinedTo: '2026-03' })).toEqual({
      joinedFrom: '2026-01',
      joinedTo: '2026-03',
    });
  });

  test('P11 from equal to: nothing changes', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-04', joinedTo: '2026-04' })).toEqual({
      joinedFrom: '2026-04',
      joinedTo: '2026-04',
    });
  });

  test('P11 only one month set: nothing to swap', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-09' })).toEqual({
      joinedFrom: '2026-09',
    });
    expect(filters.parseProgressFilters({ joinedTo: '2020-01' })).toEqual({
      joinedTo: '2020-01',
    });
  });

  test('P11 an invalid month is dropped before the swap, so the valid one stays where it was', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-13', joinedTo: '2026-02' })).toEqual({
      joinedTo: '2026-02',
    });
  });
});

describe('BR-REC-111 progressFiltersSearch: writing the web address', () => {
  test('BR-REC-111 no filters give an empty string (no bare "?")', () => {
    expect(filters.progressFiltersSearch({})).toBe('');
  });

  test('BR-REC-111 values that are undefined are left out; all undefined gives an empty string', () => {
    expect(
      filters.progressFiltersSearch({
        metricId: undefined,
        plan: undefined,
        sex: undefined,
      }),
    ).toBe('');
    expect(filters.progressFiltersSearch({ plan: undefined, sex: 'male' })).toBe('?sex=male');
  });

  test('BR-REC-111 all filters: "?" then metric, joinedFrom, joinedTo, plan, sex, age (the URL key for the age band)', () => {
    expect(
      filters.progressFiltersSearch({
        metricId: METRIC,
        joinedFrom: '2026-01',
        joinedTo: '2026-03',
        plan: 'half_annual',
        sex: 'female',
        ageBand: '20to29',
      }),
    ).toBe(
      `?metric=${METRIC}&joinedFrom=2026-01&joinedTo=2026-03&plan=half_annual&sex=female&age=20to29`,
    );
  });

  test('BR-REC-111 the key order is fixed whatever order the filters were built in', () => {
    const scrambled: ProgressFilters = {};
    scrambled.ageBand = '50to59';
    scrambled.sex = 'male';
    scrambled.plan = 'annual';
    scrambled.joinedTo = '2026-06';
    scrambled.joinedFrom = '2026-02';
    scrambled.metricId = METRIC;
    expect(filters.progressFiltersSearch(scrambled)).toBe(
      `?metric=${METRIC}&joinedFrom=2026-02&joinedTo=2026-06&plan=annual&sex=male&age=50to59`,
    );
  });

  test.each([
    [{ metricId: METRIC }, `?metric=${METRIC}`],
    [{ joinedFrom: '2026-01' }, '?joinedFrom=2026-01'],
    [{ joinedTo: '2026-03' }, '?joinedTo=2026-03'],
    [{ plan: 'quarterly' }, '?plan=quarterly'],
    [{ sex: 'female' }, '?sex=female'],
    [{ ageBand: '60plus' }, '?age=60plus'],
    [{ sex: 'male', metricId: METRIC }, `?metric=${METRIC}&sex=male`],
    [{ ageBand: 'under20', plan: 'monthly' }, '?plan=monthly&age=under20'],
  ] as [ProgressFilters, string][])(
    'BR-REC-111 progressFiltersSearch(%j) is "%s"',
    (input, expected) => {
      expect(filters.progressFiltersSearch(input)).toBe(expected);
    },
  );

  const SAMPLES: ProgressFilters[] = [
    {},
    { metricId: METRIC },
    { metricId: METRIC, sex: 'female' },
    { joinedFrom: '2026-01', joinedTo: '2026-03' },
    { plan: 'half_annual', ageBand: '40to49' },
    {
      metricId: OTHER_METRIC,
      joinedFrom: '2025-11',
      joinedTo: '2026-02',
      plan: 'quarterly',
      sex: 'male',
      ageBand: 'under20',
    },
  ];

  test.each(SAMPLES)(
    'BR-REC-111 a bookmarked address %j reads back as the same filters',
    (sample) => {
      const search = filters.progressFiltersSearch(sample);
      const params = Object.fromEntries(new URLSearchParams(search));
      expect(filters.parseProgressFilters(params)).toEqual(sample);
    },
  );

  test.each(PLANS)('BR-REC-111 plan %s survives the round trip through the address', (plan) => {
    const search = filters.progressFiltersSearch({ plan });
    expect(filters.parseProgressFilters(Object.fromEntries(new URLSearchParams(search)))).toEqual({
      plan,
    });
  });

  test.each(AGE_BANDS)(
    'BR-REC-114 age band %s survives the round trip through the address',
    (ageBand) => {
      const search = filters.progressFiltersSearch({ ageBand });
      expect(filters.parseProgressFilters(Object.fromEntries(new URLSearchParams(search)))).toEqual(
        {
          ageBand,
        },
      );
    },
  );
});

describe('BR-REC-111 toProgressQuery: the E36 query', () => {
  test('BR-REC-111 only the measurement when no filter is set', () => {
    const query = filters.toProgressQuery(METRIC, {});
    expect(query).toEqual({ metricId: METRIC });
    expect(Object.keys(query)).toEqual(['metricId']);
  });

  test('BR-REC-111 every filter is carried under the E36 names (metricId, joinedFrom, joinedTo, plan, sex, ageBand)', () => {
    expect(
      filters.toProgressQuery(METRIC, {
        joinedFrom: '2026-01',
        joinedTo: '2026-03',
        plan: 'half_annual',
        sex: 'female',
        ageBand: '30to39',
      }),
    ).toEqual({
      metricId: METRIC,
      joinedFrom: '2026-01',
      joinedTo: '2026-03',
      plan: 'half_annual',
      sex: 'female',
      ageBand: '30to39',
    });
  });

  test('BR-REC-111 only the set keys appear: no undefined or empty entries', () => {
    const query = filters.toProgressQuery(METRIC, { sex: 'male', plan: undefined });
    expect(Object.keys(query).sort()).toEqual(['metricId', 'sex']);
    expect(query).toEqual({ metricId: METRIC, sex: 'male' });
  });

  test('BR-REC-111 the example "Body fat, joined Jan-Mar 2026, Female" asks for exactly those', () => {
    const query = filters.toProgressQuery(METRIC, {
      joinedFrom: '2026-01',
      joinedTo: '2026-03',
      sex: 'female',
    });
    expect(Object.keys(query).sort()).toEqual(['joinedFrom', 'joinedTo', 'metricId', 'sex']);
  });

  test('BR-REC-111 the age band goes out as ageBand, never as age', () => {
    const query = filters.toProgressQuery(METRIC, { ageBand: '60plus' });
    expect(query).toEqual({ metricId: METRIC, ageBand: '60plus' });
    expect('age' in query).toBe(false);
  });

  test('BR-REC-111 the measurement given is the one asked for', () => {
    expect(filters.toProgressQuery(OTHER_METRIC, { sex: 'female' })).toEqual({
      metricId: OTHER_METRIC,
      sex: 'female',
    });
  });
});
