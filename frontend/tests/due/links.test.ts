// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-102 tapping a row opens Record assessment for that member and assessment (C12: S10
//              `/admin/members/[memberId]/assess?type=<typeId>`); "Open member" is `/admin/members/[memberId]`.
//   BR-REC-101 / C11 "See all" opens S3 `/admin/due?tab=overdue` or `?tab=soon`.
//   BR-REC-104 S3 `/admin/due?tab=overdue|soon&type=` — the assessment filter is the `type` param.
//   Naming (contract "Conventions"): the E31 query value is `upcoming`; the S3 URL tab is `soon`.
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/due/links`:
//   `recordHref(memberId, typeId)`, `dueListHref(tab, typeId?)`, `tabToStatus(tab)`.
import { beforeAll, describe, expect, test } from 'bun:test';
import { MEMBER_SURYA, TYPE_BODY, TYPE_FITNESS } from './helpers';

interface LinksModule {
  recordHref(memberId: string, typeId: string): string;
  dueListHref(tab: 'overdue' | 'soon', typeId?: string | null): string;
  tabToStatus(tab: 'overdue' | 'soon'): 'overdue' | 'upcoming';
}

let links: LinksModule;

beforeAll(async () => {
  links = (await import('@/lib/due/links')) as unknown as LinksModule;
});

describe('BR-REC-102 recordHref: a row tap opens Record assessment for that member and assessment', () => {
  test('C12 /admin/members/<memberId>/assess?type=<typeId>', () => {
    expect(links.recordHref(MEMBER_SURYA, TYPE_BODY)).toBe(
      `/admin/members/${MEMBER_SURYA}/assess?type=${TYPE_BODY}`,
    );
  });

  test('BR-REC-102 another assessment gives another link (the type is part of the link)', () => {
    expect(links.recordHref(MEMBER_SURYA, TYPE_FITNESS)).not.toBe(
      links.recordHref(MEMBER_SURYA, TYPE_BODY),
    );
    expect(links.recordHref(MEMBER_SURYA, TYPE_FITNESS)).toEndWith(`?type=${TYPE_FITNESS}`);
  });
});

describe('BR-REC-101 / 104 dueListHref: "See all" and the S3 filter', () => {
  test('C11 Overdue "See all" -> /admin/due?tab=overdue', () => {
    expect(links.dueListHref('overdue')).toBe('/admin/due?tab=overdue');
  });

  test('C11 Due soon "See all" -> /admin/due?tab=soon (the tab is "soon", never "upcoming")', () => {
    expect(links.dueListHref('soon')).toBe('/admin/due?tab=soon');
  });

  test('BR-REC-104 with an assessment: &type=<typeId>', () => {
    expect(links.dueListHref('overdue', TYPE_FITNESS)).toBe(
      `/admin/due?tab=overdue&type=${TYPE_FITNESS}`,
    );
    expect(links.dueListHref('soon', TYPE_BODY)).toBe(`/admin/due?tab=soon&type=${TYPE_BODY}`);
  });

  test('BR-REC-104 null or undefined type means "All": no type in the link', () => {
    expect(links.dueListHref('overdue', null)).toBe('/admin/due?tab=overdue');
    expect(links.dueListHref('soon', undefined)).toBe('/admin/due?tab=soon');
  });
});

describe('contract naming: tabToStatus maps the S3 tab to the E31 `status` value', () => {
  test('"overdue" -> "overdue"', () => {
    expect(links.tabToStatus('overdue')).toBe('overdue');
  });

  test('"soon" -> "upcoming" (the API says upcoming, the URL says soon)', () => {
    expect(links.tabToStatus('soon')).toBe('upcoming');
  });
});
