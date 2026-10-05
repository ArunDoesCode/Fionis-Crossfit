// Spec: docs/specs/member-records/ux.md BR-REC-189 (smooth scroll respects reduced motion; no Reset button),
// BR-REC-198 (forms use React Hook Form + Zod; toasts live in mutation hooks, not form components).
// Source guards for non-visual rules only (D-038: no look tests; markup and class checks were removed).
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appFiles, rel, SRC } from './srcScan';

const FORM_DIR = 'components/common/form/';
const text = (f: string) => readFileSync(f, 'utf8');
const under = (prefix: string) => appFiles.filter((f) => rel(f).startsWith(`src/${prefix}`));
const offenders = (files: string[], re: RegExp) => files.filter((f) => re.test(text(f))).map(rel);

describe('BR-REC-189 behaviour of the shared form helpers', () => {
  test('BR-REC-189 smooth scroll respects prefers-reduced-motion', () => {
    const first = join(SRC, 'lib/forms/firstProblem.ts');
    const t = under(FORM_DIR).map(text).join('\n') + (existsSync(first) ? text(first) : '');
    expect(t).toContain('prefers-reduced-motion');
  });
  test('BR-REC-189 no reset button in any component', () => {
    const comps = under('components/');
    expect(offenders(comps, /type=["']reset["']/)).toEqual([]);
    expect(offenders(comps, /<Button[^>]*>\s*Reset\s*</)).toEqual([]);
  });
});

describe('BR-REC-198 forms use React Hook Form + Zod through the shared primitives', () => {
  test('BR-REC-198 no custom schemaResolver anywhere', () => {
    expect(offenders(appFiles, /schemaResolver/)).toEqual([]);
  });
  test('BR-REC-198 no toast call inside form components (toasts live in mutation hooks)', () => {
    const formFiles = [
      ...under(FORM_DIR),
      ...appFiles.filter(
        (f) => /\buseForm\s*(<[^>]*>)?\s*\(/.test(text(f)) && rel(f).startsWith('src/components/'),
      ),
    ];
    expect(offenders(formFiles, /\btoast\s*[.(]|from 'sonner'/)).toEqual([]);
  });
});
