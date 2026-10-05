// Spec: docs/specs/member-records/ux.md BR-REC-234 (titles, screen-reader basics). Source guards for non-visual
// rules only (D-038 keeps no look tests): every page sets its own title; role="alert" is reserved; no "d" hotkey.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filesMatching, rel, SRC, walk } from './srcScan';

describe('BR-REC-234 page titles and screen reader basics', () => {
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
    expect(readFileSync(join(SRC, 'app/(app)/admin/members/[memberId]/page.tsx'), 'utf8')).toMatch(
      /generateMetadata/,
    );
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
