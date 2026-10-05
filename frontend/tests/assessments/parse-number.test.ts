// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-76 — number fields accept "." or ","; the value is rounded to the measurement's decimals
//               (BR-REC-64); anything else shows "Enter a number like 95.5". Example: "95,5" -> 95.5.
//   BR-REC-19 — blank fields are simply not recorded (`empty`).
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/parseNumber`: `parseNumberText(text, decimals)` -> `{ kind: 'empty' } |
//   { kind: 'ok', value } | { kind: 'invalid' }`; rounds half away from zero on the decimal digits of the text
//   (not through binary floats); never returns -0; the ROUNDED value's absolute value above 999,999,999.999 is
//   invalid ("999999999.6"@0 -> invalid, the same rule as the server, D3).
import { beforeAll, describe, expect, test } from 'bun:test';

type Decimals = 0 | 1 | 2;
type ParseResult = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' };
interface ParseNumber {
  parseNumberText(text: string, decimals: Decimals): ParseResult;
}

let parser: ParseNumber;

beforeAll(async () => {
  parser = (await import('@/lib/assessments/parseNumber')) as unknown as ParseNumber;
});

const DECIMALS: Decimals[] = [0, 1, 2];

describe('BR-REC-76 parseNumberText accepts "." or "," as the decimal mark', () => {
  test.each([
    ['95.5', 1, 95.5],
    ['95,5', 1, 95.5], // spec example
    ['95', 1, 95],
    ['0', 1, 0],
    ['0.5', 1, 0.5],
    ['0,5', 1, 0.5],
    ['.5', 1, 0.5],
    [',5', 1, 0.5],
    ['95.', 1, 95],
    ['95,', 1, 95],
    ['-3.2', 1, -3.2],
    ['-3,2', 1, -3.2],
    ['-.5', 1, -0.5],
    ['-,5', 1, -0.5],
    ['-12', 0, -12],
    ['007', 0, 7],
    ['00095.5', 1, 95.5],
    ['12.25', 2, 12.25],
    ['12,25', 2, 12.25],
  ] as const)('BR-REC-76 parseNumberText(%j, %d decimals) is ok %d', (text, decimals, value) => {
    expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'ok', value });
  });

  test.each([
    ['  95.5  ', 95.5],
    [' -3,2 ', -3.2],
    ['\t95\n', 95],
  ] as const)('BR-REC-76 parseNumberText trims outer spaces: %j', (text, value) => {
    expect(parser.parseNumberText(text, 1)).toEqual({ kind: 'ok', value });
  });
});

describe('BR-REC-19 parseNumberText: a blank box is empty (not recorded)', () => {
  for (const decimals of DECIMALS) {
    test.each([[''], [' '], ['   '], ['\t'], ['\n']])(
      `BR-REC-19 parseNumberText(%j, ${decimals} decimals) is empty`,
      (text) => {
        expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'empty' });
      },
    );
  }
});

describe('BR-REC-76 parseNumberText rounds to the measurement decimals, half away from zero', () => {
  test.each([
    // [text, decimals, expected]
    ['95.56', 1, 95.6], // contract example
    ['95.54', 1, 95.5],
    ['95.55', 1, 95.6], // a half goes up (95.55 is below .55 as a binary float; the text decides)
    ['-95.55', 1, -95.6],
    ['2.25', 1, 2.3],
    ['-2.25', 1, -2.3], // contract example: away from zero
    ['1.005', 2, 1.01], // contract example: classic float trap
    ['2.675', 2, 2.68],
    ['0.285', 2, 0.29],
    ['-0.285', 2, -0.29],
    ['1.255', 2, 1.26],
    ['2.5', 0, 3], // contract example
    ['-2.5', 0, -3], // contract example
    ['2.4', 0, 2],
    ['-2.4', 0, -2],
    ['95.5', 0, 96],
    ['95.49', 0, 95],
    ['0.5', 0, 1],
    ['-0.5', 0, -1],
    ['0.05', 1, 0.1],
    ['0.049', 1, 0],
    ['95.5', 2, 95.5], // fewer typed digits than decimals: unchanged
    ['95.123', 2, 95.12],
    ['95.999', 2, 96], // the carry runs through the digits
    ['95.95', 1, 96],
    ['9.995', 2, 10],
    ['99.5', 0, 100],
    ['95.5000000001', 1, 95.5],
    ['1,005', 2, 1.01], // "," as the decimal mark rounds the same
  ] as const)('BR-REC-76 parseNumberText(%j, %d decimals) is %d', (text, decimals, value) => {
    expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'ok', value });
  });

  test('BR-REC-76 a rounded value never has more digits than the decimals', () => {
    const samples = ['95.123456', '0.333', '12.9999', '7.005', '-7.005', '1,987654', '100.1'];
    for (const decimals of DECIMALS) {
      for (const text of samples) {
        const result = parser.parseNumberText(text, decimals);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(Number(result.value.toFixed(decimals))).toBe(result.value);
        }
      }
    }
  });
});

describe('BR-REC-76 parseNumberText never returns -0', () => {
  test.each([
    ['-0', 0],
    ['-0.0', 1],
    ['-0.04', 1], // rounds to zero
    ['-0.4', 0],
    ['-0.004', 2],
    ['-,04', 1],
  ] as const)('BR-REC-76 parseNumberText(%j, %d decimals) is a plain 0', (text, decimals) => {
    const result = parser.parseNumberText(text, decimals);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(Object.is(result.value, 0)).toBe(true);
    }
  });
});

describe('BR-REC-76 parseNumberText: anything else is invalid ("Enter a number like 95.5")', () => {
  const invalidTexts = [
    'abc',
    'a',
    '95.5kg',
    'kg95',
    '1e3',
    '1E3',
    '95.5.5',
    '1.2.3',
    '9 5',
    '- 5',
    '-',
    '.',
    ',',
    '-.',
    '-,',
    '--5',
    '5-',
    '+5',
    '95,5,5',
    '1,000.5',
    '1.000,5',
    '1,2.3',
    '0x10',
    'Infinity',
    'NaN',
    '1_000',
    '2:02',
    '95.5%',
  ];
  for (const decimals of DECIMALS) {
    test.each(invalidTexts.map((text) => [text]))(
      `BR-REC-76 parseNumberText(%j, ${decimals} decimals) is invalid`,
      (text) => {
        expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'invalid' });
      },
    );
  }
});

describe('BR-REC-76 parseNumberText: the size limit is 999,999,999.999 either way', () => {
  test.each([
    ['999999999', 0, 999999999],
    ['-999999999', 0, -999999999],
    ['999999999.4', 0, 999999999],
    ['999999999.9', 1, 999999999.9],
    ['-999999999.9', 1, -999999999.9],
  ] as const)('BR-REC-76 parseNumberText(%j, %d decimals) is ok %d', (text, decimals, value) => {
    expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'ok', value });
  });

  test.each([
    ['1000000000'],
    ['-1000000000'],
    ['1000000000.5'],
    ['1000000000.001'],
    ['-1000000000.001'],
    ['99999999999999999999'],
    ['1000000001'],
  ])('BR-REC-76 parseNumberText(%j) is invalid (above the limit)', (text) => {
    for (const decimals of DECIMALS) {
      expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'invalid' });
    }
  });
});

describe('BR-REC-76 / D3 the size limit is on the rounded value (same rule as the server)', () => {
  test.each([
    ['999999999.6', 0], // contract example: rounds to 1,000,000,000
    ['999999999.5', 0], // a half goes away from zero, past the limit
    ['-999999999.6', 0],
    ['-999999999.5', 0],
    ['999999999.95', 1],
    ['-999999999.95', 1],
    ['999999999.999', 1],
    ['999999999.999', 2],
    ['999999999.995', 2],
    ['-999999999.995', 2],
  ] as const)(
    'D3 parseNumberText(%j, %d decimals) is invalid (it rounds past 999,999,999.999)',
    (text, decimals) => {
      expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'invalid' });
    },
  );

  test.each([
    ['999999999.4', 0, 999999999],
    ['999999999.499', 0, 999999999],
    ['-999999999.4', 0, -999999999],
    ['999999999.94', 1, 999999999.9],
    ['-999999999.94', 1, -999999999.9],
    ['999999999.984', 2, 999999999.98],
    ['999999999.99', 2, 999999999.99],
    ['-999999999.99', 2, -999999999.99],
  ] as const)(
    'D3 parseNumberText(%j, %d decimals) is ok %d (it rounds to within the limit)',
    (text, decimals, value) => {
      expect(parser.parseNumberText(text, decimals)).toEqual({ kind: 'ok', value });
    },
  );
});
