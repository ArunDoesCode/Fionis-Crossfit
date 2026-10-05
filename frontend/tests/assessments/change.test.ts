// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-81 — change = this - previous with sign and unit, plus an arrow and "better"/"worse" by the
//               measurement's direction (none -> no word); times as +-m:ss.
//               Example: weight 95.5 -> 94 ("v 1.5 kg better"), plank 1:50 -> 2:02 ("^ 0:12 better").
//   BR-REC-20 — the entry form shows the change next to each field, in the configured unit.
//   D15       — arrow (up, down, none when equal) + signed amount with unit ("-1.5 kg", "+0.5 %", Time as
//               "+0:12" / "-1:05", h:mm:ss from one hour) + "better"/"worse" by direction; no word for
//               "No direction"; equal -> "No change". The difference is rounded to the measurement's decimals.
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/change`: `describeChange({ value, previous, datatype, decimals, unit, better })` ->
//   `{ arrow: 'up' | 'down' | 'none', amount, verdict: 'better' | 'worse' | null } | null`.
//   null when value or previous is null. The minus sign is U+2212. Number amount = sign + absolute value with
//   `decimals` digits + " " + unit (no space or unit when the unit is empty). Time amount = sign +
//   `formatDuration(abs seconds)`.
import { beforeAll, describe, expect, test } from 'bun:test';

type Better = 'higher' | 'lower' | 'none';
type Datatype = 'number' | 'duration';
type Decimals = 0 | 1 | 2;
interface Input {
  value: number | null;
  previous: number | null;
  datatype: Datatype;
  decimals: Decimals;
  unit: string;
  better: Better;
}
interface Change {
  arrow: 'up' | 'down' | 'none';
  amount: string;
  verdict: 'better' | 'worse' | null;
}
interface DescribeChange {
  describeChange(input: Input): Change | null;
}

let change: DescribeChange;

beforeAll(async () => {
  change = (await import('@/lib/assessments/change')) as unknown as DescribeChange;
});

const MINUS = '−';

const number = (
  value: number | null,
  previous: number | null,
  better: Better,
  decimals: Decimals,
  unit: string,
): Input => ({ value, previous, datatype: 'number', decimals, unit, better });

const time = (value: number | null, previous: number | null, better: Better): Input => ({
  value,
  previous,
  datatype: 'duration',
  decimals: 0,
  unit: 'min:sec',
  better,
});

describe('BR-REC-81 / D15 a number measurement: arrow, signed amount with unit, verdict', () => {
  test.each<[string, Input, Change]>([
    [
      'weight 95.5 -> 94, lower is better (spec example)',
      number(94, 95.5, 'lower', 1, 'kg'),
      { arrow: 'down', amount: `${MINUS}1.5 kg`, verdict: 'better' },
    ],
    [
      'weight 94 -> 95.5, lower is better',
      number(95.5, 94, 'lower', 1, 'kg'),
      { arrow: 'up', amount: '+1.5 kg', verdict: 'worse' },
    ],
    [
      'muscle 24.0 -> 24.5 %, higher is better',
      number(24.5, 24, 'higher', 1, '%'),
      { arrow: 'up', amount: '+0.5 %', verdict: 'better' },
    ],
    [
      'muscle 24.5 -> 24.0 %, higher is better',
      number(24, 24.5, 'higher', 1, '%'),
      { arrow: 'down', amount: `${MINUS}0.5 %`, verdict: 'worse' },
    ],
    [
      'reps 12 -> 15, higher is better, no decimals',
      number(15, 12, 'higher', 0, 'reps'),
      { arrow: 'up', amount: '+3 reps', verdict: 'better' },
    ],
    [
      'reps 15 -> 12, lower is better, no decimals',
      number(12, 15, 'lower', 0, 'reps'),
      { arrow: 'down', amount: `${MINUS}3 reps`, verdict: 'better' },
    ],
    [
      'two decimals keep two digits',
      number(7.5, 7.25, 'higher', 2, 'cm'),
      { arrow: 'up', amount: '+0.25 cm', verdict: 'better' },
    ],
    [
      'a whole difference still shows the decimals',
      number(97.5, 95.5, 'higher', 1, 'kg'),
      { arrow: 'up', amount: '+2.0 kg', verdict: 'better' },
    ],
    [
      'two decimals on a whole difference',
      number(10, 7.5, 'higher', 2, 'cm'),
      { arrow: 'up', amount: '+2.50 cm', verdict: 'better' },
    ],
    [
      'from a negative previous to a positive value',
      number(2.5, -3, 'higher', 1, 'cm'),
      { arrow: 'up', amount: '+5.5 cm', verdict: 'better' },
    ],
    [
      'from a positive previous to a negative value',
      number(-1.5, 2, 'higher', 1, 'cm'),
      { arrow: 'down', amount: `${MINUS}3.5 cm`, verdict: 'worse' },
    ],
    [
      'both negative',
      number(-5, -2.5, 'higher', 1, 'cm'),
      { arrow: 'down', amount: `${MINUS}2.5 cm`, verdict: 'worse' },
    ],
    [
      'to zero from a positive previous',
      number(0, 10, 'lower', 0, 'reps'),
      { arrow: 'down', amount: `${MINUS}10 reps`, verdict: 'better' },
    ],
    [
      'from zero',
      number(10, 0, 'lower', 0, 'reps'),
      { arrow: 'up', amount: '+10 reps', verdict: 'worse' },
    ],
  ])('BR-REC-81 %s', (_name, input, expected) => {
    expect(change.describeChange(input)).toEqual(expected);
  });

  test('BR-REC-81 the minus sign is the real minus (U+2212), never a hyphen', () => {
    const result = change.describeChange(number(94, 95.5, 'lower', 1, 'kg'));
    expect(result?.amount.startsWith(MINUS)).toBe(true);
    expect(result?.amount.includes('-')).toBe(false);
  });

  test('BR-REC-81 a gain starts with "+" and has no space between the sign and the digits', () => {
    const result = change.describeChange(number(95.5, 94, 'lower', 1, 'kg'));
    expect(result?.amount).toBe('+1.5 kg');
  });
});

describe('BR-REC-81 / D15 a measurement without a unit shows no space or unit', () => {
  test.each<[string, Input, Change]>([
    [
      'up, no decimals',
      number(15, 12, 'higher', 0, ''),
      { arrow: 'up', amount: '+3', verdict: 'better' },
    ],
    [
      'down, one decimal',
      number(2, 3.5, 'higher', 1, ''),
      { arrow: 'down', amount: `${MINUS}1.5`, verdict: 'worse' },
    ],
  ])('BR-REC-81 %s', (_name, input, expected) => {
    expect(change.describeChange(input)).toEqual(expected);
  });
});

describe('D15 the difference is rounded to the measurement decimals (no float noise)', () => {
  test.each<[string, Input, Change]>([
    [
      '0.3 - 0.1 is 0.2, not 0.19999999999999998',
      number(0.3, 0.1, 'higher', 1, 'kg'),
      { arrow: 'up', amount: '+0.2 kg', verdict: 'better' },
    ],
    [
      '1.0 - 1.1 is -0.1, not -0.10000000000000009',
      number(1, 1.1, 'higher', 1, 'kg'),
      { arrow: 'down', amount: `${MINUS}0.1 kg`, verdict: 'worse' },
    ],
    [
      '95.6 - 95.5 is 0.1, not 0.09999999999999432',
      number(95.6, 95.5, 'higher', 1, 'kg'),
      { arrow: 'up', amount: '+0.1 kg', verdict: 'better' },
    ],
    [
      '7.35 - 7.1 two decimals is 0.25',
      number(7.35, 7.1, 'higher', 2, 'cm'),
      { arrow: 'up', amount: '+0.25 cm', verdict: 'better' },
    ],
  ])('D15 %s', (_name, input, expected) => {
    expect(change.describeChange(input)).toEqual(expected);
  });
});

describe('D15 equal values: "No change", no arrow and no verdict', () => {
  test.each<[string, Input]>([
    ['same number', number(95.5, 95.5, 'lower', 1, 'kg')],
    ['same number, higher is better', number(12, 12, 'higher', 0, 'reps')],
    ['same number, no direction', number(12, 12, 'none', 0, 'reps')],
    ['zero and zero (0 is a value, not a missing one)', number(0, 0, 'higher', 1, 'kg')],
    ['a difference that rounds to zero', number(95.54, 95.5, 'lower', 1, 'kg')],
    ['same time', time(122, 122, 'higher')],
    ['time 0 and 0', time(0, 0, 'lower')],
  ])('D15 %s', (_name, input) => {
    expect(change.describeChange(input)).toEqual({
      arrow: 'none',
      amount: 'No change',
      verdict: null,
    });
  });
});

describe('BR-REC-81 / D15 no direction: the arrow and amount stay, no "better" / "worse"', () => {
  test.each<[string, Input, Change]>([
    ['up', number(96, 95.5, 'none', 1, 'kg'), { arrow: 'up', amount: '+0.5 kg', verdict: null }],
    [
      'down',
      number(95, 95.5, 'none', 1, 'kg'),
      { arrow: 'down', amount: `${MINUS}0.5 kg`, verdict: null },
    ],
    ['a time, up', time(130, 122, 'none'), { arrow: 'up', amount: '+0:08', verdict: null }],
    [
      'a time, down',
      time(100, 122, 'none'),
      { arrow: 'down', amount: `${MINUS}0:22`, verdict: null },
    ],
  ])('BR-REC-81 %s', (_name, input, expected) => {
    expect(change.describeChange(input)).toEqual(expected);
  });
});

describe('BR-REC-81 the verdict follows the direction of the measurement', () => {
  test.each<[Better, number, 'better' | 'worse']>([
    ['higher', 110, 'better'],
    ['higher', 90, 'worse'],
    ['lower', 90, 'better'],
    ['lower', 110, 'worse'],
  ])('BR-REC-81 better = %s, 100 -> %d is %s', (better, value, verdict) => {
    expect(change.describeChange(number(value, 100, better, 0, 'kg'))?.verdict).toBe(verdict);
    expect(change.describeChange(time(value, 100, better))?.verdict).toBe(verdict);
  });
});

describe('BR-REC-81 / BR-REC-12 a time measurement shows +-m:ss (h:mm:ss from one hour)', () => {
  test.each<[string, Input, Change]>([
    [
      'plank 1:50 -> 2:02, higher is better (spec example)',
      time(122, 110, 'higher'),
      { arrow: 'up', amount: '+0:12', verdict: 'better' },
    ],
    [
      'fran 6:05 -> 5:00, lower is better',
      time(300, 365, 'lower'),
      { arrow: 'down', amount: `${MINUS}1:05`, verdict: 'better' },
    ],
    [
      'plank 2:02 -> 1:40, higher is better',
      time(100, 122, 'higher'),
      { arrow: 'down', amount: `${MINUS}0:22`, verdict: 'worse' },
    ],
    ['one second', time(61, 60, 'lower'), { arrow: 'up', amount: '+0:01', verdict: 'worse' }],
    [
      'exactly one minute',
      time(120, 60, 'higher'),
      { arrow: 'up', amount: '+1:00', verdict: 'better' },
    ],
    [
      'just under an hour',
      time(3599, 0, 'higher'),
      { arrow: 'up', amount: '+59:59', verdict: 'better' },
    ],
    [
      'exactly one hour',
      time(3600, 0, 'higher'),
      { arrow: 'up', amount: '+1:00:00', verdict: 'better' },
    ],
    [
      'one hour, two minutes, three seconds',
      time(3723, 0, 'higher'),
      { arrow: 'up', amount: '+1:02:03', verdict: 'better' },
    ],
    [
      'an hour or more going down',
      time(0, 3723, 'lower'),
      { arrow: 'down', amount: `${MINUS}1:02:03`, verdict: 'better' },
    ],
    [
      'times of an hour or more compare as a difference, not as clock times',
      time(5400, 3600, 'higher'),
      { arrow: 'up', amount: '+30:00', verdict: 'better' },
    ],
  ])('BR-REC-81 %s', (_name, input, expected) => {
    expect(change.describeChange(input)).toEqual(expected);
  });

  test('BR-REC-81 a time amount carries no unit', () => {
    const result = change.describeChange({
      value: 122,
      previous: 110,
      datatype: 'duration',
      decimals: 0,
      unit: 'sec',
      better: 'higher',
    });
    expect(result?.amount).toBe('+0:12');
  });
});

describe('BR-REC-20 / 81 nothing to compare: null', () => {
  test.each<[string, Input]>([
    ['no value', number(null, 95.5, 'lower', 1, 'kg')],
    ['no previous', number(94, null, 'lower', 1, 'kg')],
    ['neither', number(null, null, 'lower', 1, 'kg')],
    ['a time with no value', time(null, 110, 'higher')],
    ['a time with no previous', time(122, null, 'higher')],
  ])('BR-REC-81 %s -> null', (_name, input) => {
    expect(change.describeChange(input)).toBeNull();
  });
});
