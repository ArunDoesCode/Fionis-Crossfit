import { describe, expect, test } from 'bun:test';
import {
  durationFromParts,
  durationToParts,
  formatDuration,
  parseDuration,
} from '@/lib/domain/duration';
import cases from '../../fixtures/duration-cases.json';

// Golden fixture shared byte-identically with the backend (duration-cases.json).
// BR-REC-12: durations typed as mm:ss, stored in seconds, shown as mm:ss.
// BR-REC-75: two boxes, seconds 0-59, minutes 0-599, 60 min or more shows h:mm:ss.

describe('parseDuration (golden fixture)', () => {
  for (const c of cases.parse) {
    test(`BR-REC-12 parses ${JSON.stringify(c.text)} as ${c.seconds}`, () => {
      expect(parseDuration(c.text)).toBe(c.seconds);
    });
  }
});

describe('formatDuration (golden fixture)', () => {
  for (const c of cases.format) {
    test(`BR-REC-12 shows ${c.seconds} s as ${c.text}`, () => {
      expect(formatDuration(c.seconds)).toBe(c.text);
    });
  }
});

describe('durationFromParts (golden fixture)', () => {
  for (const c of cases.fromParts) {
    test(`BR-REC-75 ${c.minutes} min + ${c.seconds} s gives ${c.total}`, () => {
      expect(durationFromParts(c.minutes, c.seconds)).toBe(c.total);
    });
  }
});

describe('durationToParts (golden fixture)', () => {
  for (const c of cases.toParts) {
    test(`BR-REC-75 ${c.total} s is ${c.minutes} min + ${c.seconds} s`, () => {
      expect(durationToParts(c.total)).toEqual({ minutes: c.minutes, seconds: c.seconds });
    });
  }
});

describe('duration round trips', () => {
  test('BR-REC-75 pasting "2:02" fills minutes 2 and seconds 2', () => {
    const total = parseDuration('2:02');
    expect(total).toBe(122);
    expect(durationToParts(total as number)).toEqual({ minutes: 2, seconds: 2 });
  });

  test('BR-REC-12 formatDuration then parseDuration returns every whole second in the box range', () => {
    const mismatches: number[] = [];
    for (let s = 0; s <= 599 * 60 + 59; s++) {
      if (parseDuration(formatDuration(s)) !== s) mismatches.push(s);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  test('BR-REC-75 durationToParts then durationFromParts returns every whole second in the box range', () => {
    const mismatches: number[] = [];
    for (let s = 0; s <= 599 * 60 + 59; s++) {
      const { minutes, seconds } = durationToParts(s);
      if (durationFromParts(minutes, seconds) !== s) mismatches.push(s);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  test('BR-REC-75 under one hour is m:ss, one hour or more is h:mm:ss', () => {
    expect(formatDuration(3599)).toMatch(/^\d{1,2}:\d{2}$/);
    expect(formatDuration(3600)).toMatch(/^\d+:\d{2}:\d{2}$/);
  });
});
