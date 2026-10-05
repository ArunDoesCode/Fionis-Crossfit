// Spec: docs/specs/member-records/ux.md (v10) BR-REC-224: on the member page "at most one next-step banner — an
// overdue assessment ("Body composition overdue 34 days" [Record now]) wins over a membership that ended or ends
// soon ([Renew])". Example: overdue member with membership ending -> the banner shows the overdue assessment only.
// Interface (PROPOSED, not yet named in the spec): `@/lib/members/nextStep` exports
//   `nextStepFor(input: { overdue: { assessmentName: string; daysOverdue: number } | null;
//                         membershipStatus: 'active' | 'expiring' | 'expired' }):
//      { kind: 'record' | 'renew'; text: string } | null`
//   `overdue` = the most overdue assessment of the member (null when none is overdue).
import { beforeAll, describe, expect, test } from 'bun:test';

interface Input {
  overdue: { assessmentName: string; daysOverdue: number } | null;
  membershipStatus: 'active' | 'expiring' | 'expired';
}
interface Step {
  kind: 'record' | 'renew';
  text: string;
}
interface Mod {
  nextStepFor(input: Input): Step | null;
}
// A variable specifier keeps `tsc` green while the module does not exist yet; the import is still resolved by Bun.
const MODULE = '@/lib/members/nextStep';
let mod: Mod;
beforeAll(async () => {
  mod = (await import(MODULE)) as unknown as Mod;
});

const overdue = { assessmentName: 'Body composition', daysOverdue: 34 };

describe('BR-REC-224 nextStepFor', () => {
  test('BR-REC-224 overdue assessment -> "Body composition overdue 34 days" with Record now (spec example)', () => {
    const step = mod.nextStepFor({ overdue, membershipStatus: 'active' });
    expect(step?.kind).toBe('record');
    expect(step?.text).toBe('Body composition overdue 34 days');
  });
  test('BR-REC-224 overdue wins over a membership that ends soon (spec example)', () => {
    const step = mod.nextStepFor({ overdue, membershipStatus: 'expiring' });
    expect(step?.kind).toBe('record');
    expect(step?.text).toContain('Body composition overdue');
  });
  test('BR-REC-224 overdue wins over a membership that ended', () => {
    expect(mod.nextStepFor({ overdue, membershipStatus: 'expired' })?.kind).toBe('record');
  });
  test('BR-REC-224 nothing overdue and the membership ends soon -> Renew', () => {
    expect(mod.nextStepFor({ overdue: null, membershipStatus: 'expiring' })?.kind).toBe('renew');
  });
  test('BR-REC-224 nothing overdue and the membership ended -> Renew', () => {
    expect(mod.nextStepFor({ overdue: null, membershipStatus: 'expired' })?.kind).toBe('renew');
  });
  test('BR-REC-224 nothing overdue and an active membership -> no banner', () => {
    expect(mod.nextStepFor({ overdue: null, membershipStatus: 'active' })).toBeNull();
  });
  test('BR-REC-224 an overdue assessment with an active membership still gets the banner', () => {
    expect(mod.nextStepFor({ overdue, membershipStatus: 'active' })).not.toBeNull();
  });
});
