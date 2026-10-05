// Spec: docs/specs/member-records/ux.md (v3) BR-REC-179, 180, 181, 182, 185 + "Build clarifications (U1)".
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  test('BR-REC-185 StatusTone includes info (source declares the five tones)', () => {
    const src = readFileSync(join(import.meta.dir, '../../src/lib/statusTone.ts'), 'utf8');
    const m = src.match(/type StatusTone\s*=([^;]+);/s);
    expect(m).not.toBeNull();
    for (const t of ['success', 'warning', 'danger', 'info', 'neutral'])
      expect(m?.[1]).toContain(`'${t}'`);
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
  test('BR-REC-179 same input gives the same answer (loading and view agree)', () => {
    expect(routeFor('/admin/members/x1/report')).toEqual(routeFor('/admin/members/x1/report'));
  });
});

describe('BR-REC-180/181/182 density and width tokens', () => {
  const css = readFileSync(join(import.meta.dir, '../../src/app/globals.css'), 'utf8');
  const px = (v: string) => {
    const m = v.trim().match(/^([\d.]+)(rem|px)$/);
    if (!m) return Number.NaN;
    return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
  };
  const decl = (text: string, name: string) =>
    text.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  // text of every @media block whose query mentions 1024px and a fine pointer
  const fineBlocks: string[] = [];
  const re = /@media\s*([^{]+)\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const query = m[1] ?? '';
    if (!/1024px/.test(query) || !/pointer:\s*fine/.test(query)) continue;
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
    }
    fineBlocks.push(css.slice(re.lastIndex, i));
  }
  const fine = fineBlocks.join('\n');
  const rootStart = css.indexOf(':root {');
  const rootText = css.slice(rootStart, css.indexOf('\n}', rootStart));

  test('BR-REC-181 a (min-width: 1024px) and (pointer: fine) media block exists', () => {
    expect(fineBlocks.length).toBeGreaterThan(0);
  });
  test.each([
    ['header-height', 56],
    ['control-height', 40],
    ['row-height', 48],
    ['page-padding', 24],
    ['section-gap', 16],
  ])('BR-REC-181 --%s is %i px on fine pointer >= 1024 px', (name, want) => {
    expect(px(decl(fine, name) ?? '')).toBe(want);
  });
  test.each([
    ['control-height', 48],
    ['row-height', 64],
    ['tap-min', 44],
    ['page-padding', 16],
    ['section-gap', 24],
  ])('BR-REC-181 touch default --%s stays %i px', (name, want) => {
    expect(px(decl(rootText, name) ?? '')).toBe(want);
  });
  test('BR-REC-180 --header-height token exists (page header 56 px)', () => {
    expect(css).toMatch(/--header-height:/);
  });
  test.each([
    ['page-max-narrow', 896],
    ['page-max-wide', 1280],
  ])('BR-REC-182 --%s is %i px', (name, want) => {
    expect(px(decl(css, name) ?? '')).toBe(want);
  });
});
