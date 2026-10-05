// Shared helpers for the few source-text guards that protect NON-visual rules (D-038: no look tests).
// Never use these to assert classes, tokens, fonts, sizes or layout.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT = join(import.meta.dir, '..', '..');
export const SRC = join(ROOT, 'src');

export const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/** Every .ts / .tsx file under src, with the shadcn-installed `components/ui` kept apart. */
export const srcFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
export const appFiles = srcFiles.filter((f) => !f.includes('/components/ui/'));
export const rel = (f: string) => relative(ROOT, f);

/** Source text with comments removed, so a comment that names an old thing is not counted. */
export const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

/** Files (relative to ROOT) whose comment-free text matches. */
export const filesMatching = (re: RegExp, among: string[] = appFiles): string[] =>
  among
    .filter((f) => re.test(code(readFileSync(f, 'utf8'))))
    .map(rel)
    .sort();
