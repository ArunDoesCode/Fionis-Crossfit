// Spec: docs/specs/member-records/setup.md (v2)
//   BR-REC-10  a measurement has name, unit, datatype (number or duration), better, optional check range, on/off.
//   BR-REC-14  a measurement may override its assessment's repeat (a pair: number + unit, or neither).
//   BR-REC-60  settings: gym name, time zone, "Due soon" 0-30 days, "Ends soon" 0-60 days
//              (45 -> "Use 0 to 30 days"); C1: gym name trimmed 2-60, lead days whole numbers.
//   BR-REC-61  assessment name 2-40 characters; repeats every 1-24 weeks or months; C2: names are trimmed.
//   BR-REC-62  measurement name 2-40, unit up to 12 (may be empty), check range min < max
//              (min 50, max 10 -> "Below must be smaller than above").
//   BR-REC-63  better can also be "none".
//   BR-REC-64  decimals 0-2 (C3: a Time measurement is min:sec with 0 decimals; its check range is in seconds).
//   BR-REC-65  report-table place = group + body part (whole body, arms, trunk, legs), both or neither.
//   BR-REC-69  units are labels only (no conversion: "lb" stays "lb").
// Interface: docs/specs/member-records/setup.md —
//   `@/lib/validators/setup`: `gymSettingsSchema`, `assessmentFormSchema`, `measurementFormSchema`; they mirror
//   the backend limits with the same issue `path`s and `message`s. Zod schemas: tested only through `safeParse`
//   and the issues it reports. A message is asserted wherever the spec gives one; for an enum or whole-number
//   rule only the path is asserted.
import { beforeAll, describe, expect, test } from 'bun:test';
import type { ZodType } from 'zod';

type Validators = typeof import('@/lib/validators/setup');

let validators: Validators;

beforeAll(async () => {
  validators = await import('@/lib/validators/setup');
});

interface Issue {
  path: PropertyKey[];
  message: string;
}

const TEXT_FIELDS = [
  'upcomingLeadDays',
  'expiryLeadDays',
  'intervalCount',
  'plausibleMin',
  'plausibleMax',
];

/**
 * The number boxes of the setup forms hold typed TEXT (ux.md U2: setup schemas read it through the shared
 * number parser). A number a case wants to send is sent as its text; a blank optional measurement field
 * (check range, own repeat) is the empty box. Everything else, including wrong types, goes through unchanged.
 */
function asTyped(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const isMeasurement = 'datatype' in input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of TEXT_FIELDS) {
    const value = out[key];
    if (typeof value === 'number') out[key] = String(value);
    else if (
      value === null &&
      isMeasurement &&
      key !== 'upcomingLeadDays' &&
      key !== 'expiryLeadDays'
    ) {
      out[key] = '';
    }
  }
  return out;
}

/** The issues a schema reports for `input` (empty when the input is accepted). */
function issuesOf(schema: ZodType, input: unknown): Issue[] {
  const result = schema.safeParse(asTyped(input));
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
}

/** What a schema hands back for `input`, or `undefined` when the input is refused. */
function parsed(schema: ZodType, input: unknown): Record<string, unknown> | undefined {
  const result = schema.safeParse(asTyped(input));
  return result.success ? (result.data as Record<string, unknown>) : undefined;
}

const onField = (issues: Issue[], field: string) =>
  issues.filter((issue) => issue.path.length === 1 && issue.path[0] === field);

const messagesOn = (issues: Issue[], field: string) =>
  onField(issues, field).map((issue) => issue.message);

const chars = (n: number, char = 'a') => char.repeat(n);

const GYM_NAME_MSG = 'Use 2 to 60 characters';
const TIMEZONE_MSG = 'Use a time zone name';
const UPCOMING_MSG = 'Use 0 to 30 days';
const EXPIRY_MSG = 'Use 0 to 60 days';
const NAME_MSG = 'Use 2 to 40 characters';
const REPEAT_COUNT_MSG = 'Use 1 to 24';
const UNIT_MSG = 'Use at most 12 characters';
const DECIMALS_MSG = 'Use 0, 1 or 2';
const BOUND_MSG = 'Use a number up to 999,999,999.999 either way';
const RANGE_MSG = 'Below must be smaller than above';
const REPEAT_PAIR_MSG = 'Set both the repeat number and unit, or neither';
const TABLE_PAIR_MSG = 'Set both the report group and part, or neither';

const MAX_BOUND = 999_999_999.999;

// ---------------------------------------------------------------------------------------------------------
// gymSettingsSchema — BR-REC-60, C1
// ---------------------------------------------------------------------------------------------------------

const seededSettings = {
  gymName: 'Fionis CrossFit',
  timezone: 'Asia/Kolkata',
  upcomingLeadDays: 7,
  expiryLeadDays: 14,
};

const settings = (overrides: Record<string, unknown> = {}) => ({ ...seededSettings, ...overrides });

const settingsWithout = (key: keyof typeof seededSettings) => {
  const { [key]: _removed, ...rest } = seededSettings;
  return rest;
};

describe('BR-REC-60 gymSettingsSchema: the defaults are accepted', () => {
  test('BR-REC-60 the seeded settings are accepted and come back unchanged', () => {
    expect(parsed(validators.gymSettingsSchema, seededSettings)).toEqual(seededSettings);
  });

  for (const timezone of ['Asia/Kolkata', 'Europe/London', 'UTC']) {
    test(`BR-REC-60 the time zone name ${timezone} is accepted`, () => {
      expect(issuesOf(validators.gymSettingsSchema, settings({ timezone }))).toEqual([]);
    });
  }
});

describe('BR-REC-60 / C1 gymSettingsSchema: gym name is trimmed, 2 to 60 characters', () => {
  for (const [label, gymName] of [
    ['2 characters', chars(2)],
    ['60 characters', chars(60)],
    ['a name with spaces inside', 'Fionis Cross Fit'],
    ['60 characters between spaces (the limit is on the trimmed text)', ` ${chars(60)} `],
    ['2 characters between spaces', '  ab  '],
  ] as const) {
    test(`C1 ${label} is accepted`, () => {
      expect(issuesOf(validators.gymSettingsSchema, settings({ gymName }))).toEqual([]);
    });
  }

  test('C1 the saved gym name is the trimmed text ("  Fionis  " -> "Fionis")', () => {
    expect(parsed(validators.gymSettingsSchema, settings({ gymName: '  Fionis  ' }))?.gymName).toBe(
      'Fionis',
    );
  });

  test('C1 a name of 60 characters between spaces is saved as the 60 characters', () => {
    expect(
      parsed(validators.gymSettingsSchema, settings({ gymName: `  ${chars(60)}  ` }))?.gymName,
    ).toBe(chars(60));
  });

  for (const [label, gymName] of [
    ['1 character', 'a'],
    ['1 character between spaces (trimmed first)', '   a   '],
    ['61 characters', chars(61)],
    ['61 characters between spaces', ` ${chars(61)} `],
    ['a very long name', chars(500)],
  ] as const) {
    test(`C1 ${label} -> "Use 2 to 60 characters" on gymName`, () => {
      const issues = issuesOf(validators.gymSettingsSchema, settings({ gymName }));
      expect(messagesOn(issues, 'gymName')).toContain(GYM_NAME_MSG);
    });
  }

  test('C1 a refused gym name leaves the other fields without issues', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ gymName: 'a' }));
    expect(issues.every((issue) => issue.path[0] === 'gymName')).toBe(true);
  });

  // ux.md v10 BR-REC-233: "empty gym name -> "Enter the gym name"". (Only spaces: the spec says "empty"; either
  // sentence is accepted for it, the 2 to 60 rule or the empty sentence.)
  test('BR-REC-233 an empty gym name -> "Enter the gym name" on gymName', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ gymName: '' }));
    expect(messagesOn(issues, 'gymName')).toContain('Enter the gym name');
  });

  test('BR-REC-233 a gym name of only spaces is refused with the empty sentence or the 2 to 60 rule', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ gymName: '     ' }));
    const messages = messagesOn(issues, 'gymName');
    expect(messages.includes('Enter the gym name') || messages.includes(GYM_NAME_MSG)).toBe(true);
  });

  test('C1 a missing gym name gives an issue on gymName', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settingsWithout('gymName'));
    expect(onField(issues, 'gymName').length).toBeGreaterThan(0);
  });

  test('C1 a gym name that is not text gives an issue on gymName', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ gymName: 123 }));
    expect(onField(issues, 'gymName').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-60 gymSettingsSchema: the time zone is not empty', () => {
  test('BR-REC-60 an empty time zone -> "Use a time zone name" on timezone', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ timezone: '' }));
    expect(messagesOn(issues, 'timezone')).toContain(TIMEZONE_MSG);
  });

  test('BR-REC-60 a missing time zone gives an issue on timezone', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settingsWithout('timezone'));
    expect(onField(issues, 'timezone').length).toBeGreaterThan(0);
  });

  test('BR-REC-60 a time zone that is not text gives an issue on timezone', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ timezone: 5.5 }));
    expect(onField(issues, 'timezone').length).toBeGreaterThan(0);
  });

  test('BR-REC-60 an empty time zone is the only problem reported', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ timezone: '' }));
    expect(issues.every((issue) => issue.path[0] === 'timezone')).toBe(true);
  });
});

describe('BR-REC-60 gymSettingsSchema: "Due soon" window is 0 to 30 whole days', () => {
  for (const upcomingLeadDays of [0, 1, 7, 29, 30]) {
    test(`BR-REC-60 ${upcomingLeadDays} days is accepted`, () => {
      const data = parsed(validators.gymSettingsSchema, settings({ upcomingLeadDays }));
      expect(data?.upcomingLeadDays).toBe(upcomingLeadDays);
    });
  }

  for (const upcomingLeadDays of [45, 31, -1, -30, 1000]) {
    test(`BR-REC-60 ${upcomingLeadDays} days -> "Use 0 to 30 days" on upcomingLeadDays`, () => {
      const issues = issuesOf(validators.gymSettingsSchema, settings({ upcomingLeadDays }));
      expect(messagesOn(issues, 'upcomingLeadDays')).toContain(UPCOMING_MSG);
    });
  }

  test('BR-REC-60 the spec example: window 45 reports only the "Due soon" field', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settings({ upcomingLeadDays: 45 }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.path[0] === 'upcomingLeadDays')).toBe(true);
  });

  for (const [label, upcomingLeadDays] of [
    ['a fraction (7.5)', 7.5],
    ['a fraction inside the range (0.5)', 0.5],
    ['null', null],
  ] as const) {
    test(`C1 ${label} gives an issue on upcomingLeadDays`, () => {
      const issues = issuesOf(validators.gymSettingsSchema, settings({ upcomingLeadDays }));
      expect(onField(issues, 'upcomingLeadDays').length).toBeGreaterThan(0);
    });
  }

  test('C1 a missing "Due soon" window gives an issue on upcomingLeadDays', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settingsWithout('upcomingLeadDays'));
    expect(onField(issues, 'upcomingLeadDays').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-60 gymSettingsSchema: "Ends soon" window is 0 to 60 whole days', () => {
  for (const expiryLeadDays of [0, 1, 14, 59, 60]) {
    test(`BR-REC-60 ${expiryLeadDays} days is accepted`, () => {
      const data = parsed(validators.gymSettingsSchema, settings({ expiryLeadDays }));
      expect(data?.expiryLeadDays).toBe(expiryLeadDays);
    });
  }

  for (const expiryLeadDays of [61, 100, -1, -60]) {
    test(`BR-REC-60 ${expiryLeadDays} days -> "Use 0 to 60 days" on expiryLeadDays`, () => {
      const issues = issuesOf(validators.gymSettingsSchema, settings({ expiryLeadDays }));
      expect(messagesOn(issues, 'expiryLeadDays')).toContain(EXPIRY_MSG);
    });
  }

  test('BR-REC-60 a "Due soon" window of 45 is fine for "Ends soon" (the two limits are separate)', () => {
    expect(issuesOf(validators.gymSettingsSchema, settings({ expiryLeadDays: 45 }))).toEqual([]);
  });

  for (const [label, expiryLeadDays] of [
    ['a fraction (14.5)', 14.5],
    ['null', null],
  ] as const) {
    test(`C1 ${label} gives an issue on expiryLeadDays`, () => {
      const issues = issuesOf(validators.gymSettingsSchema, settings({ expiryLeadDays }));
      expect(onField(issues, 'expiryLeadDays').length).toBeGreaterThan(0);
    });
  }

  test('C1 a missing "Ends soon" window gives an issue on expiryLeadDays', () => {
    const issues = issuesOf(validators.gymSettingsSchema, settingsWithout('expiryLeadDays'));
    expect(onField(issues, 'expiryLeadDays').length).toBeGreaterThan(0);
  });

  test('BR-REC-60 two bad windows are both reported on one Save', () => {
    const issues = issuesOf(
      validators.gymSettingsSchema,
      settings({ upcomingLeadDays: 45, expiryLeadDays: 61 }),
    );
    expect(messagesOn(issues, 'upcomingLeadDays')).toContain(UPCOMING_MSG);
    expect(messagesOn(issues, 'expiryLeadDays')).toContain(EXPIRY_MSG);
  });
});

// ---------------------------------------------------------------------------------------------------------
// assessmentFormSchema — BR-REC-61, C2
// ---------------------------------------------------------------------------------------------------------

const bodyComposition = { name: 'Body composition', intervalCount: 1, intervalUnit: 'month' };

const assessment = (overrides: Record<string, unknown> = {}) => ({
  ...bodyComposition,
  ...overrides,
});

const assessmentWithout = (key: keyof typeof bodyComposition) => {
  const { [key]: _removed, ...rest } = bodyComposition;
  return rest;
};

describe('BR-REC-61 assessmentFormSchema: a normal assessment is accepted', () => {
  test('BR-REC-61 "Body composition" every 1 month is accepted and comes back unchanged', () => {
    expect(parsed(validators.assessmentFormSchema, bodyComposition)).toEqual(bodyComposition);
  });

  test('BR-REC-61 "Fitness test" every 2 months is accepted', () => {
    expect(
      issuesOf(validators.assessmentFormSchema, {
        name: 'Fitness test',
        intervalCount: 2,
        intervalUnit: 'month',
      }),
    ).toEqual([]);
  });

  test('BR-REC-61 a weekly assessment is accepted', () => {
    expect(
      issuesOf(
        validators.assessmentFormSchema,
        assessment({ intervalCount: 3, intervalUnit: 'week' }),
      ),
    ).toEqual([]);
  });
});

describe('BR-REC-61 / C2 assessmentFormSchema: the name is trimmed, 2 to 40 characters', () => {
  for (const [label, name] of [
    ['2 characters', chars(2)],
    ['40 characters', chars(40)],
    ['40 characters between spaces (the limit is on the trimmed text)', ` ${chars(40)} `],
  ] as const) {
    test(`BR-REC-61 ${label} is accepted`, () => {
      expect(issuesOf(validators.assessmentFormSchema, assessment({ name }))).toEqual([]);
    });
  }

  test('C2 the saved name is the trimmed text ("  Body composition  " -> "Body composition")', () => {
    expect(
      parsed(validators.assessmentFormSchema, assessment({ name: '  Body composition  ' }))?.name,
    ).toBe('Body composition');
  });

  for (const [label, name] of [
    ['an empty name', ''],
    ['only spaces', '    '],
    ['1 character', 'a'],
    ['1 character between spaces (trimmed first)', '  a  '],
    ['41 characters', chars(41)],
    ['41 characters between spaces', ` ${chars(41)} `],
  ] as const) {
    test(`BR-REC-61 ${label} -> "Use 2 to 40 characters" on name`, () => {
      const issues = issuesOf(validators.assessmentFormSchema, assessment({ name }));
      expect(messagesOn(issues, 'name')).toContain(NAME_MSG);
    });
  }

  test('BR-REC-61 a missing name gives an issue on name', () => {
    const issues = issuesOf(validators.assessmentFormSchema, assessmentWithout('name'));
    expect(onField(issues, 'name').length).toBeGreaterThan(0);
  });

  test('BR-REC-61 a name that is not text gives an issue on name', () => {
    expect(
      onField(issuesOf(validators.assessmentFormSchema, assessment({ name: 42 })), 'name').length,
    ).toBeGreaterThan(0);
  });
});

describe('BR-REC-61 assessmentFormSchema: it repeats every 1 to 24 weeks or months', () => {
  for (const intervalUnit of ['week', 'month']) {
    for (const intervalCount of [1, 2, 12, 23, 24]) {
      test(`BR-REC-61 ${intervalCount} ${intervalUnit}(s) is accepted`, () => {
        const data = parsed(
          validators.assessmentFormSchema,
          assessment({ intervalCount, intervalUnit }),
        );
        expect(data?.intervalCount).toBe(intervalCount);
        expect(data?.intervalUnit).toBe(intervalUnit);
      });
    }
  }

  for (const intervalCount of [0, 25, -1, 100]) {
    test(`BR-REC-61 a repeat number of ${intervalCount} -> "Use 1 to 24" on intervalCount`, () => {
      const issues = issuesOf(validators.assessmentFormSchema, assessment({ intervalCount }));
      expect(messagesOn(issues, 'intervalCount')).toContain(REPEAT_COUNT_MSG);
    });
  }

  for (const [label, intervalCount] of [
    ['a fraction (1.5)', 1.5],
    ['null (the repeat is required here)', null],
  ] as const) {
    test(`BR-REC-61 ${label} gives an issue on intervalCount`, () => {
      const issues = issuesOf(validators.assessmentFormSchema, assessment({ intervalCount }));
      expect(onField(issues, 'intervalCount').length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-61 a missing repeat number gives an issue on intervalCount', () => {
    const issues = issuesOf(validators.assessmentFormSchema, assessmentWithout('intervalCount'));
    expect(onField(issues, 'intervalCount').length).toBeGreaterThan(0);
  });

  for (const [label, intervalUnit] of [
    ['"day"', 'day'],
    ['"year"', 'year'],
    ['an empty text', ''],
    ['null (the repeat is required here)', null],
  ] as const) {
    test(`BR-REC-61 a repeat unit of ${label} gives an issue on intervalUnit`, () => {
      const issues = issuesOf(validators.assessmentFormSchema, assessment({ intervalUnit }));
      expect(onField(issues, 'intervalUnit').length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-61 a missing repeat unit gives an issue on intervalUnit', () => {
    const issues = issuesOf(validators.assessmentFormSchema, assessmentWithout('intervalUnit'));
    expect(onField(issues, 'intervalUnit').length).toBeGreaterThan(0);
  });

  test('BR-REC-61 an empty form reports name, repeat number and repeat unit', () => {
    const issues = issuesOf(validators.assessmentFormSchema, {});
    expect(onField(issues, 'name').length).toBeGreaterThan(0);
    expect(onField(issues, 'intervalCount').length).toBeGreaterThan(0);
    expect(onField(issues, 'intervalUnit').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// measurementFormSchema — BR-REC-10, 14, 62, 63, 64, 65, 69; C2, C3
// ---------------------------------------------------------------------------------------------------------

const weight = {
  name: 'Weight',
  datatype: 'number',
  unit: 'kg',
  decimals: 1,
  better: 'lower',
  plausibleMin: 30,
  plausibleMax: 250,
  intervalCount: null,
  intervalUnit: null,
  tableGroup: null,
  tablePart: null,
  isActive: true,
};

const measurement = (overrides: Record<string, unknown> = {}) => ({ ...weight, ...overrides });

const measurementWithout = (key: keyof typeof weight) => {
  const { [key]: _removed, ...rest } = weight;
  return rest;
};

const check = (overrides: Record<string, unknown>) =>
  issuesOf(validators.measurementFormSchema, measurement(overrides));

describe('BR-REC-10 measurementFormSchema: normal measurements are accepted', () => {
  test('BR-REC-10 the seeded Weight is accepted and comes back unchanged', () => {
    expect(parsed(validators.measurementFormSchema, weight)).toEqual(weight);
  });

  test('BR-REC-10 the spec example "Burpees 1 min", count, higher is accepted', () => {
    expect(
      issuesOf(
        validators.measurementFormSchema,
        measurement({
          name: 'Burpees 1 min',
          unit: 'reps',
          decimals: 0,
          better: 'higher',
          plausibleMin: null,
          plausibleMax: null,
        }),
      ),
    ).toEqual([]);
  });

  test('BR-REC-10 a Time measurement (Fran: min:sec, 0 decimals, check range in seconds, own repeat) is accepted', () => {
    const fran = {
      name: 'Fran',
      datatype: 'duration',
      unit: 'min:sec',
      decimals: 0,
      better: 'lower',
      plausibleMin: 90,
      plausibleMax: 1800,
      intervalCount: 3,
      intervalUnit: 'month',
      tableGroup: null,
      tablePart: null,
      isActive: true,
    };
    expect(parsed(validators.measurementFormSchema, fran)).toEqual(fran);
  });

  test('BR-REC-65 a segmental item (Skeletal muscle % + Arms) is accepted', () => {
    expect(
      issuesOf(
        validators.measurementFormSchema,
        measurement({
          name: 'Arms skeletal muscle',
          unit: '%',
          better: 'higher',
          plausibleMin: 10,
          plausibleMax: 60,
          tableGroup: 'Skeletal muscle %',
          tablePart: 'arms',
        }),
      ),
    ).toEqual([]);
  });

  test('BR-REC-10 a measurement that is turned off (isActive false) is accepted', () => {
    expect(
      parsed(validators.measurementFormSchema, measurement({ isActive: false }))?.isActive,
    ).toBe(false);
  });

  test('BR-REC-10 isActive must be a real boolean, not the text "true"', () => {
    expect(onField(check({ isActive: 'true' }), 'isActive').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-62 / C2 measurementFormSchema: the name is trimmed, 2 to 40 characters', () => {
  for (const [label, name] of [
    ['2 characters', chars(2)],
    ['40 characters', chars(40)],
    ['40 characters between spaces (the limit is on the trimmed text)', ` ${chars(40)} `],
  ] as const) {
    test(`BR-REC-62 ${label} is accepted`, () => {
      expect(check({ name })).toEqual([]);
    });
  }

  test('C2 the saved name is the trimmed text ("  Weight  " -> "Weight")', () => {
    expect(
      parsed(validators.measurementFormSchema, measurement({ name: '  Weight  ' }))?.name,
    ).toBe('Weight');
  });

  for (const [label, name] of [
    ['an empty name', ''],
    ['only spaces', '   '],
    ['1 character', 'a'],
    ['1 character between spaces (trimmed first)', '  a  '],
    ['41 characters', chars(41)],
    ['41 characters between spaces', ` ${chars(41)} `],
  ] as const) {
    test(`BR-REC-62 ${label} -> "Use 2 to 40 characters" on name`, () => {
      expect(messagesOn(check({ name }), 'name')).toContain(NAME_MSG);
    });
  }

  test('BR-REC-62 a missing name gives an issue on name', () => {
    const issues = issuesOf(validators.measurementFormSchema, measurementWithout('name'));
    expect(onField(issues, 'name').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-10 / 63 / 69 measurementFormSchema: kind, better and unit', () => {
  for (const datatype of ['number', 'duration']) {
    test(`BR-REC-10 the kind "${datatype}" is accepted`, () => {
      expect(check({ datatype })).toEqual([]);
    });
  }

  for (const [label, datatype] of [
    ['"time" (the sheet says Time, the value is duration)', 'time'],
    ['"Number" with a capital', 'Number'],
    ['an empty text', ''],
    ['null', null],
  ] as const) {
    test(`BR-REC-10 the kind ${label} gives an issue on datatype`, () => {
      expect(onField(check({ datatype }), 'datatype').length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-10 a missing kind gives an issue on datatype', () => {
    const issues = issuesOf(validators.measurementFormSchema, measurementWithout('datatype'));
    expect(onField(issues, 'datatype').length).toBeGreaterThan(0);
  });

  for (const better of ['higher', 'lower', 'none']) {
    test(`BR-REC-63 better "${better}" is accepted (None is a real choice)`, () => {
      expect(parsed(validators.measurementFormSchema, measurement({ better }))?.better).toBe(
        better,
      );
    });
  }

  for (const [label, better] of [
    ['"best"', 'best'],
    ['"Higher" with a capital', 'Higher'],
    ['an empty text', ''],
    ['null', null],
  ] as const) {
    test(`BR-REC-63 better ${label} gives an issue on better`, () => {
      expect(onField(check({ better }), 'better').length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-63 a missing better gives an issue on better', () => {
    const issues = issuesOf(validators.measurementFormSchema, measurementWithout('better'));
    expect(onField(issues, 'better').length).toBeGreaterThan(0);
  });

  test('BR-REC-63 Height (no direction, cm, 1 decimal, 120-220) is accepted', () => {
    expect(
      check({
        name: 'Height',
        unit: 'cm',
        better: 'none',
        plausibleMin: 120,
        plausibleMax: 220,
      }),
    ).toEqual([]);
  });

  for (const [label, unit] of [
    ['an empty unit (allowed)', ''],
    ['1 character', '%'],
    ['12 characters', chars(12)],
    ['a unit with spaces inside', 'min : sec'],
  ] as const) {
    test(`BR-REC-62 ${label} is accepted`, () => {
      expect(check({ unit })).toEqual([]);
    });
  }

  for (const [label, unit] of [
    ['13 characters', chars(13)],
    ['a very long unit', chars(200)],
  ] as const) {
    test(`BR-REC-62 ${label} -> "Use at most 12 characters" on unit`, () => {
      expect(messagesOn(check({ unit }), 'unit')).toContain(UNIT_MSG);
    });
  }

  test('BR-REC-69 a unit "lb" is just a label: it comes back as typed, no conversion', () => {
    const data = parsed(validators.measurementFormSchema, measurement({ unit: 'lb' }));
    expect(data?.unit).toBe('lb');
    expect(data?.plausibleMin).toBe(30);
    expect(data?.plausibleMax).toBe(250);
  });

  test('BR-REC-62 the unit is not trimmed (units are labels, kept as typed)', () => {
    expect(parsed(validators.measurementFormSchema, measurement({ unit: ' kg ' }))?.unit).toBe(
      ' kg ',
    );
  });
});

describe('BR-REC-64 measurementFormSchema: decimals are 0, 1 or 2', () => {
  for (const decimals of [0, 1, 2]) {
    test(`BR-REC-64 ${decimals} decimals is accepted`, () => {
      expect(parsed(validators.measurementFormSchema, measurement({ decimals }))?.decimals).toBe(
        decimals,
      );
    });
  }

  for (const decimals of [3, 4, -1, 10]) {
    test(`BR-REC-64 ${decimals} decimals -> "Use 0, 1 or 2" on decimals`, () => {
      expect(messagesOn(check({ decimals }), 'decimals')).toContain(DECIMALS_MSG);
    });
  }

  test('BR-REC-64 3 decimals is refused for a Time measurement too (checked whatever the kind)', () => {
    expect(
      messagesOn(check({ datatype: 'duration', unit: 'min:sec', decimals: 3 }), 'decimals'),
    ).toContain(DECIMALS_MSG);
  });

  for (const [label, decimals] of [
    ['a fraction (1.5)', 1.5],
    ['null', null],
  ] as const) {
    test(`BR-REC-64 ${label} gives an issue on decimals`, () => {
      expect(onField(check({ decimals }), 'decimals').length).toBeGreaterThan(0);
    });
  }
});

describe('BR-REC-62 measurementFormSchema: the "please check" range', () => {
  test('BR-REC-62 no range at all (both null) is accepted', () => {
    expect(check({ plausibleMin: null, plausibleMax: null })).toEqual([]);
  });

  test('BR-REC-62 only "below" (above empty) is accepted', () => {
    expect(check({ plausibleMin: 30, plausibleMax: null })).toEqual([]);
  });

  test('BR-REC-62 only "above" (below empty) is accepted', () => {
    expect(check({ plausibleMin: null, plausibleMax: 250 })).toEqual([]);
  });

  test('BR-REC-62 min below max is accepted', () => {
    expect(check({ plausibleMin: 10, plausibleMax: 50 })).toEqual([]);
  });

  test('BR-REC-62 the spec example: min 50, max 10 -> "Below must be smaller than above"', () => {
    expect(messagesOn(check({ plausibleMin: 50, plausibleMax: 10 }), 'plausibleMin')).toContain(
      RANGE_MSG,
    );
  });

  test('BR-REC-62 min equal to max is refused (strictly smaller)', () => {
    expect(messagesOn(check({ plausibleMin: 10, plausibleMax: 10 }), 'plausibleMin')).toContain(
      RANGE_MSG,
    );
  });

  test('BR-REC-62 a zero minimum is a number, not "empty": 0 to 200 is accepted', () => {
    expect(check({ plausibleMin: 0, plausibleMax: 200 })).toEqual([]);
  });

  test('BR-REC-62 0 and 0 is refused (zero is a number, not "empty")', () => {
    expect(messagesOn(check({ plausibleMin: 0, plausibleMax: 0 }), 'plausibleMin')).toContain(
      RANGE_MSG,
    );
  });

  test('BR-REC-62 a zero maximum below a number is refused (-30 to 0 is fine, 5 to 0 is not)', () => {
    expect(check({ plausibleMin: -30, plausibleMax: 0 })).toEqual([]);
    expect(messagesOn(check({ plausibleMin: 5, plausibleMax: 0 }), 'plausibleMin')).toContain(
      RANGE_MSG,
    );
  });

  test('BR-REC-62 a negative range is accepted (Flexibility -30 to 60)', () => {
    expect(check({ plausibleMin: -30, plausibleMax: 60 })).toEqual([]);
  });

  test('BR-REC-62 two negative numbers in the wrong order are refused', () => {
    expect(messagesOn(check({ plausibleMin: -5, plausibleMax: -10 }), 'plausibleMin')).toContain(
      RANGE_MSG,
    );
  });

  test('BR-REC-62 decimals in the range are fine (min 0.5, max 0.75)', () => {
    expect(check({ plausibleMin: 0.5, plausibleMax: 0.75 })).toEqual([]);
  });

  test('BR-REC-64 / C3 a Time range is in seconds: 90 to 1800 is accepted, 1800 to 90 is refused', () => {
    const time = { datatype: 'duration', unit: 'min:sec', decimals: 0 };
    expect(check({ ...time, plausibleMin: 90, plausibleMax: 1800 })).toEqual([]);
    expect(
      messagesOn(check({ ...time, plausibleMin: 1800, plausibleMax: 90 }), 'plausibleMin'),
    ).toContain(RANGE_MSG);
  });

  for (const key of ['plausibleMin', 'plausibleMax'] as const) {
    test(`BR-REC-62 ${key} exactly +999,999,999.999 is accepted`, () => {
      const other = key === 'plausibleMin' ? { plausibleMax: null } : { plausibleMin: null };
      expect(check({ ...other, [key]: MAX_BOUND })).toEqual([]);
    });

    test(`BR-REC-62 ${key} exactly -999,999,999.999 is accepted`, () => {
      const other = key === 'plausibleMin' ? { plausibleMax: null } : { plausibleMin: null };
      expect(check({ ...other, [key]: -MAX_BOUND })).toEqual([]);
    });

    test(`BR-REC-62 ${key} of 1,000,000,000 -> "Use a number up to 999,999,999.999 either way"`, () => {
      const other = key === 'plausibleMin' ? { plausibleMax: null } : { plausibleMin: null };
      expect(messagesOn(check({ ...other, [key]: 1_000_000_000 }), key)).toContain(BOUND_MSG);
    });

    test(`BR-REC-62 ${key} of -1,000,000,000 -> "Use a number up to 999,999,999.999 either way"`, () => {
      const other = key === 'plausibleMin' ? { plausibleMax: null } : { plausibleMin: null };
      expect(messagesOn(check({ ...other, [key]: -1_000_000_000 }), key)).toContain(BOUND_MSG);
    });

    test(`BR-REC-62 ${key} that is text gives an issue on ${key}`, () => {
      expect(onField(check({ [key]: 'abc' }), key).length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-62 the range is not compared when one side is the wrong type: only the type issue is reported', () => {
    const issues = check({ plausibleMin: 'abc', plausibleMax: 5 });
    expect(onField(issues, 'plausibleMin').length).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.message)).not.toContain(RANGE_MSG);
  });
});

describe('BR-REC-14 measurementFormSchema: an own repeat is a number and a unit, or neither', () => {
  test('BR-REC-14 neither (same as the assessment) is accepted', () => {
    expect(check({ intervalCount: null, intervalUnit: null })).toEqual([]);
  });

  test('BR-REC-14 both (Fran every 3 months) is accepted', () => {
    expect(check({ intervalCount: 3, intervalUnit: 'month' })).toEqual([]);
  });

  for (const intervalUnit of ['week', 'month']) {
    for (const intervalCount of [1, 24]) {
      test(`BR-REC-14 own repeat ${intervalCount} ${intervalUnit}(s) is accepted`, () => {
        const data = parsed(
          validators.measurementFormSchema,
          measurement({ intervalCount, intervalUnit }),
        );
        expect(data?.intervalCount).toBe(intervalCount);
        expect(data?.intervalUnit).toBe(intervalUnit);
      });
    }
  }

  test('BR-REC-14 a number without a unit -> "Set both the repeat number and unit, or neither"', () => {
    expect(messagesOn(check({ intervalCount: 3, intervalUnit: null }), 'intervalCount')).toContain(
      REPEAT_PAIR_MSG,
    );
  });

  test('BR-REC-14 a unit without a number -> "Set both the repeat number and unit, or neither"', () => {
    expect(
      messagesOn(check({ intervalCount: null, intervalUnit: 'month' }), 'intervalCount'),
    ).toContain(REPEAT_PAIR_MSG);
  });

  test('BR-REC-14 a complete pair does not show the "both or neither" message', () => {
    expect(
      check({ intervalCount: 2, intervalUnit: 'week' }).map((issue) => issue.message),
    ).not.toContain(REPEAT_PAIR_MSG);
  });

  for (const intervalCount of [0, 25, -1]) {
    test(`BR-REC-14 an own repeat number of ${intervalCount} -> "Use 1 to 24" on intervalCount`, () => {
      expect(
        messagesOn(check({ intervalCount, intervalUnit: 'month' }), 'intervalCount'),
      ).toContain(REPEAT_COUNT_MSG);
    });
  }

  test('BR-REC-14 an own repeat number that is a fraction gives an issue on intervalCount', () => {
    expect(
      onField(check({ intervalCount: 1.5, intervalUnit: 'month' }), 'intervalCount').length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-14 an own repeat unit of "day" gives an issue on intervalUnit', () => {
    expect(
      onField(check({ intervalCount: 3, intervalUnit: 'day' }), 'intervalUnit').length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-14 the pair is not compared when a side is the wrong type: only the type issue is reported', () => {
    const issues = check({ intervalCount: 'x', intervalUnit: null });
    expect(onField(issues, 'intervalCount').length).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.message)).not.toContain(REPEAT_PAIR_MSG);
  });
});

describe('BR-REC-65 measurementFormSchema: a report-table place is a group and a part, or neither', () => {
  test('BR-REC-65 neither (no place in the report table) is accepted', () => {
    expect(check({ tableGroup: null, tablePart: null })).toEqual([]);
  });

  for (const tablePart of ['whole_body', 'arms', 'trunk', 'legs']) {
    test(`BR-REC-65 group "Skeletal muscle %" + part "${tablePart}" is accepted`, () => {
      const data = parsed(
        validators.measurementFormSchema,
        measurement({ tableGroup: 'Skeletal muscle %', tablePart }),
      );
      expect(data?.tableGroup).toBe('Skeletal muscle %');
      expect(data?.tablePart).toBe(tablePart);
    });
  }

  test('BR-REC-65 a group without a part -> "Set both the report group and part, or neither"', () => {
    expect(
      messagesOn(check({ tableGroup: 'Skeletal muscle %', tablePart: null }), 'tableGroup'),
    ).toContain(TABLE_PAIR_MSG);
  });

  test('BR-REC-65 a part without a group -> "Set both the report group and part, or neither"', () => {
    expect(messagesOn(check({ tableGroup: null, tablePart: 'arms' }), 'tableGroup')).toContain(
      TABLE_PAIR_MSG,
    );
  });

  test('BR-REC-65 a complete place does not show the "both or neither" message', () => {
    expect(
      check({ tableGroup: 'Skeletal muscle %', tablePart: 'legs' }).map((issue) => issue.message),
    ).not.toContain(TABLE_PAIR_MSG);
  });

  for (const tablePart of ['head', 'Arms', 'whole body', '']) {
    test(`BR-REC-65 a part of ${JSON.stringify(tablePart)} gives an issue on tablePart`, () => {
      expect(
        onField(check({ tableGroup: 'Skeletal muscle %', tablePart }), 'tablePart').length,
      ).toBeGreaterThan(0);
    });
  }

  test('C2 the report group is trimmed and saved trimmed', () => {
    const data = parsed(
      validators.measurementFormSchema,
      measurement({ tableGroup: '  Skeletal muscle %  ', tablePart: 'arms' }),
    );
    expect(data?.tableGroup).toBe('Skeletal muscle %');
  });

  for (const [label, tableGroup] of [
    ['2 characters', chars(2)],
    ['40 characters', chars(40)],
    ['40 characters between spaces', ` ${chars(40)} `],
  ] as const) {
    test(`C2 a report group of ${label} is accepted`, () => {
      expect(check({ tableGroup, tablePart: 'trunk' })).toEqual([]);
    });
  }

  for (const [label, tableGroup] of [
    ['1 character', 'a'],
    ['1 character between spaces (trimmed first)', '  a  '],
    ['41 characters', chars(41)],
  ] as const) {
    test(`C2 a report group of ${label} -> "Use 2 to 40 characters" on tableGroup`, () => {
      expect(messagesOn(check({ tableGroup, tablePart: 'trunk' }), 'tableGroup')).toContain(
        NAME_MSG,
      );
    });
  }

  test('BR-REC-65 the place is not compared when a side is the wrong type: only the type issue is reported', () => {
    const issues = check({ tableGroup: 'Skeletal muscle %', tablePart: 'head' });
    expect(onField(issues, 'tablePart').length).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.message)).not.toContain(TABLE_PAIR_MSG);
  });
});

describe('BR-REC-62 measurementFormSchema: every problem is reported on one Save', () => {
  test('BR-REC-62 a bad name, a bad unit and a swapped range are all reported at once', () => {
    const issues = check({ name: 'a', unit: chars(13), plausibleMin: 50, plausibleMax: 10 });
    expect(messagesOn(issues, 'name')).toContain(NAME_MSG);
    expect(messagesOn(issues, 'unit')).toContain(UNIT_MSG);
    expect(messagesOn(issues, 'plausibleMin')).toContain(RANGE_MSG);
  });

  test('BR-REC-62 a bad unit, a half repeat and a half report place are all reported at once', () => {
    const issues = check({
      unit: chars(13),
      intervalCount: 3,
      intervalUnit: null,
      tableGroup: null,
      tablePart: 'arms',
    });
    expect(messagesOn(issues, 'unit')).toContain(UNIT_MSG);
    expect(messagesOn(issues, 'intervalCount')).toContain(REPEAT_PAIR_MSG);
    expect(messagesOn(issues, 'tableGroup')).toContain(TABLE_PAIR_MSG);
  });

  test('BR-REC-62 one problem gives one issue on its own field and no issue elsewhere', () => {
    const issues = check({ decimals: 3 });
    expect(issues.length).toBe(1);
    expect(issues[0]?.path).toEqual(['decimals']);
  });

  test('BR-REC-62 an empty form reports the required fields', () => {
    const issues = issuesOf(validators.measurementFormSchema, {});
    for (const field of ['name', 'datatype', 'better']) {
      expect(onField(issues, field).length).toBeGreaterThan(0);
    }
  });
});
