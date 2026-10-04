// Spec: docs/specs/member-records/assessments.md (v2)
//   D11 — `/assess` without `type` opens the choose sheet; `date` defaults to today.
//   D18 — S11 shows the tapped assessment in one sheet; the assessment filter is kept in the URL (`?type=`);
//         a row of the Recent block opens that assessment on S11 (`?open=`).
//   BR-REC-83 — a date that is not a real day is not used.
// Interface (names and shapes only):
//   `@/lib/assessments/entryParams` — `entryParams` (`type`, `date`: the S10 address), `typeFromParam(type)`: the
//     assessment id when the address holds a well-formed one (any 8-4-4-4-12 hex uuid, as the API accepts), else
//     null ("not picked yet"); `dateFromParam(date, fallback)`: the date in the address when it is a real day,
//     else the fallback (today).
//   `@/lib/assessments/listParams` — `listParams` (`type`, `open`: the S11 address), `idFromParam(id)`: a
//     well-formed id from the address, else null (E27 and E28 answer 400 to anything else).
//   (`useOpenParam` is a React hook and is not covered here.)
import { describe, expect, test } from 'bun:test';
import { dateFromParam, entryParams, typeFromParam } from '@/lib/assessments/entryParams';
import { idFromParam, listParams } from '@/lib/assessments/listParams';

const TYPE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TODAY = '2026-10-03';

const WELL_FORMED = [
  TYPE_ID,
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // not a "version 4" uuid, still 8-4-4-4-12 hex
  '00000000-0000-0000-0000-000000000000',
  '0123abcd-4567-89ab-cdef-0123456789ab',
];
const MALFORMED = [
  '',
  ' ',
  'abc',
  'null',
  'undefined',
  '123',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb', // one character short
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbbb', // one character long
  'bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb', // no dashes
  'gggggggg-gggg-4ggg-8ggg-gggggggggggg', // not hex
  '{bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb}',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb ',
  ' bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/../x',
  "x'; drop table assessments; --",
];

describe('D11 / D18 typeFromParam and idFromParam: only a well-formed id is used', () => {
  test.each(WELL_FORMED)('D11 typeFromParam(%j) is the id', (id) => {
    expect(typeFromParam(id)).toBe(id);
  });

  test('D11 no ?type= in the address is "not picked yet"', () => {
    expect(typeFromParam(null)).toBeNull();
  });

  test.each(MALFORMED)('D11 typeFromParam(%j) is null', (value) => {
    expect(typeFromParam(value)).toBeNull();
  });

  test.each(WELL_FORMED)('D18 idFromParam(%j) is the id', (id) => {
    expect(idFromParam(id)).toBe(id);
  });

  test('D18 no ?type= / ?open= is null', () => {
    expect(idFromParam(null)).toBeNull();
  });

  test.each(MALFORMED)('D18 idFromParam(%j) is null (never sent to E27 / E28)', (value) => {
    expect(idFromParam(value)).toBeNull();
  });
});

describe('D11 / BR-REC-83 dateFromParam: a real day, else today', () => {
  test.each([
    '2026-10-03',
    '2025-12-30',
    '2024-02-29', // a leap day
    '2026-01-01',
    '2026-12-31',
    '2030-06-15', // a future day is a real day (the form warns about it)
    '1999-12-31',
  ])('D11 dateFromParam(%j) is that day', (date) => {
    expect(dateFromParam(date, TODAY)).toBe(date);
  });

  test('D11 no ?date= in the address is the fallback', () => {
    expect(dateFromParam(null, TODAY)).toBe(TODAY);
  });

  test.each([
    '',
    ' ',
    'today',
    'tomorrow',
    '2026-02-30', // not a real day
    '2025-02-29', // not a leap year
    '2026-13-01',
    '2026-00-10',
    '2026-10-32',
    '2026-10-00',
    '2026-1-3',
    '2026-10-3',
    '26-10-03',
    '2026/10/03',
    '03-10-2026',
    '20261003',
    '2026-10-03T10:00:00Z',
    '2026-10-03 ',
    ' 2026-10-03',
    'NaN',
  ])('D11 dateFromParam(%j) is the fallback', (date) => {
    expect(dateFromParam(date, TODAY)).toBe(TODAY);
  });

  test('D11 the fallback is whatever is given (today comes from the caller, not a clock)', () => {
    expect(dateFromParam(null, '2025-01-31')).toBe('2025-01-31');
    expect(dateFromParam('nonsense', '2025-01-31')).toBe('2025-01-31');
  });
});

describe('D11 / D18 the address parameters', () => {
  test('D11 the S10 address has ?type= and ?date=', () => {
    expect(Object.keys(entryParams).sort()).toEqual(['date', 'type']);
  });

  test('D18 the S11 address has ?type= (the filter) and ?open= (the assessment to show)', () => {
    expect(Object.keys(listParams).sort()).toEqual(['open', 'type']);
  });
});
