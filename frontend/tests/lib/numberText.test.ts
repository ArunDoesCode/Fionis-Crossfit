// Spec: docs/specs/member-records/assessments.md (v2)
//   D17       — `NumberField` gets `allowNegative` (a +- button next to the decimal keypad, #21); a phone's
//               decimal keypad has no minus key.
//   BR-REC-76 — number fields accept "." or ","; anything else shows "Enter a number like 95.5".
// Interface: docs/specs/member-records/assessments.md — `@/lib/numberText`:
//   `toggleMinus(text)`: "95.5" -> "-95.5", "-95.5" -> "95.5", "" -> "-", "-" -> ""
//   (ASCII minus only; leading spaces dropped).
import { describe, expect, test } from 'bun:test';
import { toggleMinus } from '@/lib/numberText';

describe('D17 toggleMinus adds or takes away a leading minus', () => {
  test.each([
    ['95.5', '-95.5'],
    ['-95.5', '95.5'],
    ['', '-'], // an empty box gets the sign first, the digits come next
    ['-', ''], // the sign alone goes away again
    ['0', '-0'],
    ['-0', '0'],
    ['12', '-12'],
    ['-12', '12'],
    ['95,5', '-95,5'], // a comma stays a comma
    ['-95,5', '95,5'],
    ['.5', '-.5'],
    [',5', '-,5'],
    ['-.5', '.5'],
    ['95.', '-95.'], // a half-typed number keeps its trailing mark
    ['-95.', '95.'],
    ['1000000', '-1000000'],
  ])('D17 toggleMinus(%j) is %j', (text, expected) => {
    expect(toggleMinus(text)).toBe(expected);
  });

  test.each(['95.5', '-95.5', '', '-', '12', '0', '95,5', '.5', '-,5'])(
    'D17 pressing the button twice gives %j back',
    (text) => {
      expect(toggleMinus(toggleMinus(text))).toBe(text);
    },
  );
});

describe('D17 toggleMinus: ASCII minus only, leading spaces dropped', () => {
  test('D17 the real minus U+2212 is not the sign this box understands: an ASCII minus is added', () => {
    expect(toggleMinus('−95.5')).toBe('-−95.5');
  });

  test('D17 a leading space is dropped when the sign is added', () => {
    expect(toggleMinus('  95.5')).toBe('-95.5');
  });

  test('D17 spaces only: the box counts as empty and gets the sign', () => {
    expect(toggleMinus('   ')).toBe('-');
  });

  test('D17 an en dash is not a minus either', () => {
    expect(toggleMinus('–95')).toBe('-–95');
  });
});
