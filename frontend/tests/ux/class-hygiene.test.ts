// Spec: docs/specs/member-records/ux.md BR-REC-218c (class hygiene). Source-text checks, conservative.
// No arbitrary-token size classes and no calc() mixed with var(--) outside components/ui and globals.css;
// cn() is never called with only plain string literals (it adds nothing there).
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = join(ROOT, 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
const files = walk(SRC).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.includes('/components/ui/') && !f.endsWith('globals.css'),
);
const rel = (f: string) => relative(ROOT, f);
const hits = (re: RegExp) =>
  files
    .filter((f) => re.test(readFileSync(f, 'utf8')))
    .map(rel)
    .sort();

describe('BR-REC-218c class hygiene', () => {
  test('BR-REC-218c no h-(--, size-(--, min-h-(--, w-(-- token classes', () => {
    expect(hits(/(?<![\w-])(?:min-h|min-w|max-h|max-w|h|w|size)-\(--/)).toEqual([]);
  });
  test('BR-REC-218c no calc( combined with var(--', () => {
    expect(hits(/calc\([^)\n]*var\(--|var\(--[^)\n]*\)[^)\n]*calc\(/)).toEqual([]);
  });
  test('BR-REC-218c cn( is not called with only plain string literals', () => {
    expect(hits(/(?<![\w.])cn\(\s*(?:(['"`])[^'"`\n$]*\1\s*,?\s*)+\)/)).toEqual([]);
  });
});
