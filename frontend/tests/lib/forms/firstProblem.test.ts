// Spec: docs/specs/member-records/ux.md (v6) BR-REC-189 + "Build clarifications (U2)".
//   firstProblem(errors, order): first field of `order` that has an error; names not in `order` come last.
//   SUMMARY_MIN = 3 (the top summary is shown from 3 errors).
import { describe, expect, test } from 'bun:test';
import { firstProblem, SUMMARY_MIN } from '@/lib/forms/firstProblem';

const err = (message = 'bad') => ({ type: 'custom', message });

describe('BR-REC-189 firstProblem picks the first problem in screen order', () => {
  const order = ['fullName', 'phone', 'birthDate', 'joinedOn'];

  test('BR-REC-189 returns the first field of the order that has an error', () => {
    expect(firstProblem({ joinedOn: err(), phone: err() }, order)).toBe('phone');
  });

  test('BR-REC-189 the order of the errors object does not matter', () => {
    expect(firstProblem({ birthDate: err(), fullName: err() }, order)).toBe('fullName');
  });

  test('BR-REC-189 a single error is returned', () => {
    expect(firstProblem({ joinedOn: err() }, order)).toBe('joinedOn');
  });

  test('BR-REC-189 no errors gives undefined', () => {
    expect(firstProblem({}, order)).toBeUndefined();
  });

  test('BR-REC-189 fields in the order without an error are skipped', () => {
    expect(firstProblem({ birthDate: err() }, order)).toBe('birthDate');
  });

  test('BR-REC-189 a field unknown to the order is returned last, after any known one', () => {
    expect(firstProblem({ other: err(), joinedOn: err() }, order)).toBe('joinedOn');
  });

  test('BR-REC-189 a field unknown to the order is returned when no known field has an error', () => {
    expect(firstProblem({ other: err() }, order)).toBe('other');
  });

  test('BR-REC-189 an empty order still finds an error', () => {
    expect(firstProblem({ phone: err() }, [])).toBe('phone');
  });
});

describe('BR-REC-189 summary threshold', () => {
  test('BR-REC-189 the summary shows from 3 errors', () => {
    expect(SUMMARY_MIN).toBe(3);
  });
});
