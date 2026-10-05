// Spec: docs/specs/member-records/ux.md BR-REC-224 (the member page banner: "an overdue assessment" wins; text
// "Body composition overdue 34 days") with due-list.md: Overdue = due date before today (BR-REC-16), most days
// overdue first (BR-REC-97), "Remind me later" hides the assessment everywhere until that date (BR-REC-99),
// E32 `state` comes from dates only, `flagged` / `snoozedUntil` only while active (C10).
// Interface: `mostOverdue(lines: readonly MemberDueItem[])` -> { typeId, assessmentName, daysOverdue } | null
// (the member's most overdue assessment from the E32 lines; null when none).
import { describe, expect, test } from 'bun:test';
import type { MemberDueItem } from '@/lib/due/types';
import { mostOverdue } from '@/lib/members/nextStep';

interface Line {
  typeId: string;
  typeName: string;
  state: 'overdue' | 'upcoming' | 'ok';
  neverRecorded: boolean;
  nextDueOn: string | null;
  daysOverdue: number;
  flagged: boolean;
  snoozedUntil: string | null;
  items: unknown[];
}

function line(over: Partial<Line> & Pick<Line, 'typeId' | 'typeName'>): MemberDueItem {
  const base: Line = {
    state: 'ok',
    neverRecorded: false,
    nextDueOn: null,
    daysOverdue: -20,
    flagged: false,
    snoozedUntil: null,
    items: [],
    ...over,
  };
  return base as unknown as MemberDueItem;
}

const bodyComp = line({
  typeId: 'bc',
  typeName: 'Body composition',
  state: 'overdue',
  daysOverdue: 34,
  nextDueOn: '2026-09-01',
});
const fitness = line({
  typeId: 'ft',
  typeName: 'Fitness test',
  state: 'overdue',
  daysOverdue: 3,
  nextDueOn: '2026-10-02',
});
const weightOk = line({ typeId: 'wt', typeName: 'Weight', state: 'ok', daysOverdue: -20 });
const pullupsSoon = line({
  typeId: 'pu',
  typeName: 'Pull-ups',
  state: 'upcoming',
  daysOverdue: -3,
  nextDueOn: '2026-10-08',
});
const dueToday = line({
  typeId: 'dt',
  typeName: 'Due today one',
  state: 'upcoming',
  daysOverdue: 0,
  nextDueOn: '2026-10-05',
});

describe('BR-REC-224 mostOverdue', () => {
  test('BR-REC-224 no lines -> null', () => {
    expect(mostOverdue([])).toBeNull();
  });

  test('BR-REC-224 only ok / due-soon lines -> null (nothing is overdue)', () => {
    expect(mostOverdue([weightOk, pullupsSoon])).toBeNull();
  });

  test('BR-REC-96 an assessment due today is "Due soon", not overdue -> null', () => {
    expect(mostOverdue([dueToday])).toBeNull();
  });

  test('BR-REC-224 one overdue line -> its type, name and days (spec example 34 days)', () => {
    expect(mostOverdue([weightOk, bodyComp])).toEqual({
      typeId: 'bc',
      assessmentName: 'Body composition',
      daysOverdue: 34,
    });
  });

  test('BR-REC-97 several overdue -> the one with the most days overdue', () => {
    expect(mostOverdue([fitness, bodyComp, weightOk])?.typeId).toBe('bc');
    expect(mostOverdue([bodyComp, fitness])?.typeId).toBe('bc');
  });

  test('BR-REC-224 overdue beats not-overdue lines whatever the order', () => {
    expect(mostOverdue([pullupsSoon, weightOk, fitness, dueToday])?.typeId).toBe('ft');
  });

  test('BR-REC-99 an overdue assessment on "Remind me later" is hidden -> null when it is the only one', () => {
    const snoozed = line({
      typeId: 'bc',
      typeName: 'Body composition',
      state: 'overdue',
      daysOverdue: 34,
      snoozedUntil: '2026-11-03',
    });
    expect(mostOverdue([snoozed])).toBeNull();
  });

  test('BR-REC-99 a snoozed most-overdue assessment is skipped; the next overdue one is picked', () => {
    const snoozed = line({
      typeId: 'bc',
      typeName: 'Body composition',
      state: 'overdue',
      daysOverdue: 34,
      snoozedUntil: '2026-11-03',
    });
    expect(mostOverdue([snoozed, fitness])).toEqual({
      typeId: 'ft',
      assessmentName: 'Fitness test',
      daysOverdue: 3,
    });
  });

  test('BR-REC-18 an "Assess soon" line that is also overdue by its dates still counts', () => {
    const flagged = line({
      typeId: 'bc',
      typeName: 'Body composition',
      state: 'overdue',
      daysOverdue: 34,
      flagged: true,
    });
    expect(mostOverdue([flagged, fitness])?.typeId).toBe('bc');
  });

  test('BR-REC-224 does not change the lines it is given', () => {
    const lines = [fitness, bodyComp];
    const copy = structuredClone(lines);
    mostOverdue(lines);
    expect(lines).toEqual(copy);
  });
});
