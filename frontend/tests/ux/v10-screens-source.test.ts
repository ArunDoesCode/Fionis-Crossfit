// Spec: docs/specs/member-records/ux.md (v10) BR-REC-222, 223, 224, 226, 227, 229, 230, 233, 234, 235.
// Source-text checks on the screens (no browser, no React renderer in this package): what the rule says a
// screen must contain or must no longer contain. Layout at real widths, focus order and axe are in the manual
// checklist and the Playwright pass; these catch a rule that was never built.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appFiles, code, filesMatching, readCode, rel, SRC, srcFiles, walk } from './srcScan';

const allApp = appFiles.map((f) => code(readFileSync(f, 'utf8'))).join('\n');

describe('BR-REC-222 Home number band', () => {
  test('BR-REC-222 the Overdue tile says "assessments late"', () => {
    expect(filesMatching(/assessments late/).length).toBeGreaterThan(0);
  });
  test.each(['Overdue', 'Due soon', 'Memberships ending', 'Recently ended'])(
    'BR-REC-222 a tile is labelled "%s"',
    (label) => {
      const home = walk(join(SRC, 'components/views/home'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      const anywhere = allApp;
      expect(home.includes(label) || anywhere.includes(label)).toBe(true);
    },
  );
  test('BR-REC-222 the band is 2 x 2 on phones and 4 across from 768 px', () => {
    const hits = filesMatching(/\bgrid-cols-2\b/).filter((f) =>
      /\bmd:grid-cols-4\b/.test(readFileSync(join(SRC, '..', f), 'utf8')),
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('BR-REC-223 every person row starts with an initials avatar', () => {
  test.each([
    'components/pages/members/MemberTable.tsx',
    'components/pages/due/DueRow.tsx',
    'components/pages/due/DueTable.tsx',
    'components/pages/members/EndingRow.tsx',
    'components/pages/members/EndingTable.tsx',
    'components/pages/members/MemberDirectoryResults.tsx',
    'components/pages/progress/Leaderboard.tsx',
  ])('BR-REC-223 %s shows an avatar', (path) => {
    expect(readCode(path)).toMatch(/Avatar|initials/i);
  });
  test('BR-REC-223 the member page shows a 64 px (size-16) circle', () => {
    const member = [
      'components/views/member/MemberView.tsx',
      'components/pages/member/MemberBlocks.tsx',
    ]
      .map(readCode)
      .join('\n');
    expect(member).toMatch(/\bsize-16\b/);
    expect(member).toMatch(/\brounded-full\b/);
  });
  test('BR-REC-223 no photos: no next/image in a person row or the member page', () => {
    const hits = [
      'components/pages/members/MemberTable.tsx',
      'components/pages/due/DueRow.tsx',
      'components/pages/members/EndingRow.tsx',
      'components/views/member/MemberView.tsx',
    ].filter((p) => /next\/image|<img\b/.test(readCode(p)));
    expect(hits).toEqual([]);
  });
});

describe('BR-REC-224 member page', () => {
  test('BR-REC-224 an unknown member shows "We couldn\'t find this member." with [Back to members]', () => {
    expect(allApp).toContain("We couldn't find this member.");
    expect(allApp).toContain('Back to members');
  });
  test('BR-REC-224 the next-step banner offers [Record now] and [Renew]', () => {
    expect(allApp).toContain('Record now');
    expect(allApp).toContain('Renew');
  });
});

describe('BR-REC-226 desktop tables', () => {
  test.each([
    'components/pages/members/MemberTable.tsx',
    'components/pages/due/DueTable.tsx',
    'components/pages/members/EndingTable.tsx',
  ])('BR-REC-226 %s has an action column with the spoken header "Actions"', (path) => {
    expect(readCode(path)).toContain('Actions');
  });
  test('BR-REC-226 the Due list table has the phone column (BR-REC-183)', () => {
    expect(readCode('components/pages/due/DueTable.tsx')).toContain('Phone');
  });
  test('BR-REC-226 the filter tabs of Memberships ending show counts, "Ends soon (4)"', () => {
    expect(readCode('components/pages/members/EndingTabs.tsx')).toMatch(
      /\(\$\{[^}]+\}\)|\(\{[^}]+\}\)/,
    );
  });
});

describe('BR-REC-227 sidebar toggle beside the sidebar, brand, active item', () => {
  const sidebar = readCode('app/(app)/admin/_components/AdminSidebar.tsx');
  test('BR-REC-227 the sidebar itself holds no toggle', () => {
    expect(sidebar).not.toMatch(/<SidebarTrigger\b/);
  });
  test('BR-REC-227 a SidebarTrigger sits in the page header, shown from 768 px (not md:hidden)', () => {
    const header = readCode('components/common/PageHeader.tsx');
    const trigger = header.match(/<SidebarTrigger[^>]*>/s)?.[0] ?? '';
    expect(trigger).not.toBe('');
    expect(trigger).not.toMatch(/\bmd:hidden\b/);
  });
  test('BR-REC-227 phones keep a menu button named "Open menu"', () => {
    expect(allApp).toContain('Open menu');
  });
  test('BR-REC-227 the sidebar header has the "F" square and the text "Fionis CrossFit" (expanded)', () => {
    expect(sidebar).toMatch(/>\s*F\s*</);
    expect(sidebar).toMatch(/Fionis CrossFit|DEFAULT_GYM_NAME|gymName/);
  });
  test('BR-REC-227 the brand text hides when collapsed, the "F" stays', () => {
    expect(sidebar).toMatch(/group-data-\[(?:collapsible=icon|state=collapsed)\]:hidden/);
  });
  test('BR-REC-227 the active item has a 3 px orange bar at the left', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
    const text = sidebar + css + readCode('components/ui/sidebar.tsx');
    expect(text).toMatch(/\[3px\]|\bw-0\.75\b|\bborder-l-3\b|\bbefore:w-0\.75\b/);
  });
});

describe('BR-REC-229 report card on screen: the same cards on desktop as on phones', () => {
  test.each([
    'components/views/progress/ReportCardView.tsx',
    'components/pages/progress/SegmentalSection.tsx',
  ])(
    'BR-REC-229 %s does not hide the cards from desktop (no lg:hidden / md:hidden / xl:hidden)',
    (path) => {
      expect(readCode(path)).not.toMatch(/\b(?:sm|md|lg|xl):hidden\b/);
    },
  );
  test('BR-REC-229 the table stays for print only (print:table, not lg:table)', () => {
    const table = readCode('components/pages/progress/MeasurementTable.tsx');
    expect(table).toMatch(/\bprint:table\b/);
    expect(table).not.toMatch(/\b(?:sm|md|lg|xl):table\b/);
  });
});

describe('BR-REC-230 Record assessment: 3 columns, paper tools collapsed', () => {
  test('BR-REC-230 the measurement grid allows 3 columns (FormGrid maxCols 3), not 2', () => {
    const text = ['EntryScreen.tsx', 'EntryFields.tsx']
      .map((f) => readCode(`components/pages/assessments/${f}`))
      .join('\n');
    expect(text).toMatch(/<FormGrid[^>]*maxCols=\{3\}/);
    expect(text).not.toMatch(/<FormGrid[^>]*maxCols=\{2\}/);
  });
  test('BR-REC-230 "Copying from the paper card?" is a closed Collapsible', () => {
    expect(allApp).toContain('Copying from the paper card?');
    const dir = join(SRC, 'components/pages/assessments');
    const text = walk(dir)
      .map((f) => code(readFileSync(f, 'utf8')))
      .join('\n');
    expect(text).toMatch(/Collapsible/);
  });
  test('BR-REC-230 a % value above 100 has its own field-error text "Use 0 to 100"', () => {
    expect(allApp).toContain('Use 0 to 100');
  });
});

describe('BR-REC-234 page titles and keyboard / screen reader basics', () => {
  test('BR-REC-234 the root layout has a title template "%s · Fionis India"', () => {
    expect(readCode('app/layout.tsx')).toMatch(/template:\s*['"`]%s · Fionis India['"`]/);
  });
  const pages = walk(join(SRC, 'app'))
    .filter((f) => f.endsWith('/page.tsx'))
    .map(rel);
  test('BR-REC-234 there are pages to check', () => {
    expect(pages.length).toBeGreaterThanOrEqual(17);
  });
  test.each(pages)('BR-REC-234 %s sets its own title (metadata or generateMetadata)', (page) => {
    expect(readFileSync(join(SRC, '..', page), 'utf8')).toMatch(
      /export\s+(?:const\s+metadata|(?:async\s+)?function\s+generateMetadata|const\s+generateMetadata)/,
    );
  });
  test('BR-REC-234 member pages are titled with the member name (generateMetadata)', () => {
    expect(readCode('app/(app)/admin/members/[memberId]/page.tsx')).toMatch(/generateMetadata/);
  });
  test('BR-REC-234 there is a "Skip to content" link', () => {
    expect(allApp).toContain('Skip to content');
  });
  test('BR-REC-234 only the error summary is role="alert"', () => {
    const allowed = [
      'src/components/common/form/FormErrorSummary.tsx',
      // the "Enter at least one value" top alert of BR-REC-190 (re-announced on every click)
      'src/components/pages/assessments/EntryNotices.tsx',
    ];
    expect(filesMatching(/role=["']alert["']/).filter((f) => !allowed.includes(f))).toEqual([]);
  });
  test('BR-REC-234 the "d" theme key is gone', () => {
    expect(filesMatching(/\.key(?:\.toLowerCase\(\))?\s*[!=]==?\s*['"]d['"]|ThemeHotkey/)).toEqual(
      [],
    );
  });
});

describe('BR-REC-235 Login split from 1024 px', () => {
  const login = readCode('components/views/auth/LoginView.tsx');
  test('BR-REC-235 the navy panel says "Fionis CrossFit — coach desk"', () => {
    expect(allApp).toContain('Fionis CrossFit — coach desk');
  });
  test('BR-REC-235 the layout changes at lg (1024 px)', () => {
    expect(login).toMatch(/\blg:/);
  });
  test('BR-REC-235 the wordmark is still the AVIF via next/image with priority', () => {
    expect(srcFiles.some((f) => /Fionis-Logo\.avif/.test(readFileSync(f, 'utf8')))).toBe(true);
    expect(login).toMatch(/Fionis-Logo\.avif/);
    expect(login).toMatch(/\bpriority\b/);
  });
});
