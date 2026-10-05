// Spec: docs/specs/member-records/ux.md BR-REC-179 (route table), BR-REC-185 (tone map). Logic only (D-038).
import { describe, expect, test } from 'bun:test';
import { ROUTES, routeFor } from '@/lib/routes';
import { type StatusKey, toneFor } from '@/lib/statusTone';

describe('BR-REC-185 tone map', () => {
  const cases: [StatusKey, string][] = [
    ['overdue', 'danger'],
    ['soon', 'warning'],
    ['ending', 'warning'],
    ['active', 'success'],
    ['done', 'success'],
    ['reminder', 'info'],
    ['estimated', 'info'],
    ['ended', 'neutral'],
    ['archived', 'neutral'],
    ['neverRecorded', 'neutral'],
  ];
  test.each(cases)('BR-REC-185 %s -> %s', (key, tone) => {
    expect(toneFor(key)).toBe(tone as never);
  });
});

describe('BR-REC-179 route table', () => {
  const index = [
    '/login',
    '/admin',
    '/admin/due',
    '/admin/memberships',
    '/admin/members',
    '/admin/members/new',
    '/admin/members/[memberId]/edit',
    '/admin/members/[memberId]',
    '/admin/members/[memberId]/assess',
    '/admin/members/[memberId]/assessments',
    '/admin/members/[memberId]/report',
    '/admin/reports',
    '/admin/settings',
    '/admin/settings/assessments',
    '/admin/settings/general',
    '/admin/settings/account',
    '/admin/settings/export',
  ];
  test.each(index)('BR-REC-179 %s has exactly one ROUTES entry', (p) => {
    expect(ROUTES.filter((r) => r.pattern === p).length).toBe(1);
  });
  test('BR-REC-179 no duplicate patterns', () => {
    const pats = ROUTES.map((r) => r.pattern);
    expect(new Set(pats).size).toBe(pats.length);
  });
  test('BR-REC-179 every entry has a title', () => {
    for (const r of ROUTES) expect(r.title.length).toBeGreaterThan(0);
  });
  test('BR-REC-179 routeFor fills params: assess page -> parent is the member page', () => {
    const r = routeFor('/admin/members/abc-123/assess');
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.parent?.href).toBe('/admin/members/abc-123');
    expect(r.parent?.label.length).toBeGreaterThan(0);
  });
  test('BR-REC-179 member page parent is Members', () => {
    expect(routeFor('/admin/members/abc-123').parent?.href).toBe('/admin/members');
  });
  test('BR-REC-179 new member parent is Members', () => {
    expect(routeFor('/admin/members/new').parent?.href).toBe('/admin/members');
  });
  test('BR-REC-179 account settings parent is Settings', () => {
    expect(routeFor('/admin/settings/account').parent?.href).toBe('/admin/settings');
  });
  test.each([
    '/admin',
    '/admin/members',
    '/admin/memberships',
    '/admin/reports',
    '/admin/settings',
  ])('BR-REC-179 top-level %s has no parent', (p) => {
    expect(routeFor(p).parent).toBeUndefined();
  });
  test('BR-REC-179 /admin is titled Home', () => {
    expect(routeFor('/admin').title).toBe('Home');
  });
  test('BR-REC-179 same input gives the same answer (loading and view agree)', () => {
    expect(routeFor('/admin/members/x1/report')).toEqual(routeFor('/admin/members/x1/report'));
  });
});
