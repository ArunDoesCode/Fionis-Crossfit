// Shared helpers for the ux v10 source-text tests (no browser): read files under frontend/src and
// parse the CSS variable blocks of globals.css and of the design tokens (docs/design/admin-ui-audit/tokens.css).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT = join(import.meta.dir, '..', '..');
export const SRC = join(ROOT, 'src');
export const REPO = join(ROOT, '..');

export const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/** Every .ts / .tsx file under src, with the shadcn-installed `components/ui` kept apart. */
export const srcFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
export const appFiles = srcFiles.filter((f) => !f.includes('/components/ui/'));
export const rel = (f: string) => relative(ROOT, f);

/** Source text of a file under src; '' when it does not exist (the test then fails on its own assertion). */
export const readSrc = (path: string): string => {
  const full = join(SRC, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
};

/** Source text with comment lines removed, so a comment that names an old thing is not counted. */
export const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

export const readCode = (path: string): string => code(readSrc(path));

/** Files (relative to ROOT) whose comment-free text matches. */
export const filesMatching = (re: RegExp, among: string[] = appFiles): string[] =>
  among
    .filter((f) => re.test(code(readFileSync(f, 'utf8'))))
    .map(rel)
    .sort();

/** Text of a top-level CSS block that starts at `selector {` (`:root`, `.dark`, `@theme inline`). */
export function cssBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}

/** `--name: value;` declarations of a block, in order (a trailing comment is dropped). */
export function cssVars(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = block.slice(block.indexOf('{') + 1);
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out.set(m[1] as string, (m[2] as string).trim());
  }
  return out;
}

// --- colour maths: oklch() and #hex -> sRGB hex, so the tokens compare whatever format globals.css uses ---

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex2 = (n: number) =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0');

function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return `#${hex2(toSrgb(r))}${hex2(toSrgb(g))}${hex2(toSrgb(bl))}`;
}

/** "#RRGGBB" (upper case) for an `oklch(L C H)` or `#hex` value; null for anything else (e.g. `var(--x)`). */
export function toHex(value: string): string | null {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) return `#${(hex[1] as string).toUpperCase()}`;
  const ok = v.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!ok) return null;
  const l = ok[1]?.endsWith('%') ? Number.parseFloat(ok[1]) / 100 : Number(ok[1]);
  return oklchToHex(l, Number(ok[2]), Number(ok[3])).toUpperCase();
}

/** Largest per-channel gap between two "#RRGGBB" colours (0-255). */
export function hexGap(a: string, b: string): number {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.max(...[0, 1, 2].map((i) => Math.abs(ch(a, i) - ch(b, i))));
}
