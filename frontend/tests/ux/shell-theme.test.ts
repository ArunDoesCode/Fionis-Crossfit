// Spec: docs/specs/member-records/ux.md (v2) BR-REC-177, 178, 184, 185, 186, 200 (raw-colour part)
//       docs/specs/member-records/performance.md (v2) BR-REC-214
// No browser: these check source text and globals.css only. Viewport behaviour is manual (see checklist).
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = join(ROOT, 'src');
const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC);
const codeFiles = files.filter((f) => /\.(ts|tsx|css)$/.test(f));
const rel = (f: string) => relative(ROOT, f);

/** Text of a top-level CSS block starting at `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}
const root = block(':root');
const dark = block('.dark');
const theme = block('@theme inline');
const lightness = (blk: string, name: string): number | null => {
  const m = blk.match(new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)`));
  return m ? Number(m[1]) : null;
};

describe('BR-REC-184 semantic colour tokens exist in both themes and in @theme inline', () => {
  const tokens = ['brand', 'info', 'info-soft', 'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'neutral', 'neutral-soft', 'sidebar'];
  test.each(tokens)('BR-REC-184 --%s defined in :root and .dark', (t) => {
    expect(root).toMatch(new RegExp(`--${t}:`));
    expect(dark).toMatch(new RegExp(`--${t}:`));
  });
  test.each(tokens)('BR-REC-184 --color-%s exposed through @theme inline', (t) => {
    expect(theme).toMatch(new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`));
  });
});

describe('BR-REC-184 / 200 no raw colour outside globals.css and src/tv/theme.ts', () => {
  const allowed = (f: string) => f.endsWith('app/globals.css') || rel(f) === 'src/tv/theme.ts';
  const scan = codeFiles.filter((f) => !allowed(f));
  const palette = '(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)';
  const rules: [string, RegExp][] = [
    ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
    ['oklch()', /\boklch\(/],
    ['rgb()/rgba()', /\brgba?\(/],
    ['hsl()', /\bhsla?\(/],
    ['arbitrary [#...] value', /\[#[0-9a-fA-F]+\]/],
    ['palette class', new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-${palette}-\\d{2,3}\\b`)],
  ];
  test.each(rules)('BR-REC-184 no %s in components', (_n, re) => {
    const hits = scan
      .filter((f) => {
        // strip hex-like false positives such as URL anchors by only testing lines that are not comments
        const text = readFileSync(f, 'utf8')
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join('\n');
        return re.test(text);
      })
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe('BR-REC-185 palette: navy sidebar in both themes, tones', () => {
  test('BR-REC-185 sidebar is dark (navy) in :root', () => {
    const l = lightness(root, 'sidebar');
    expect(l).not.toBeNull();
    expect(l as number).toBeLessThan(0.35);
  });
  test('BR-REC-185 sidebar is dark (navy) in .dark', () => {
    const l = lightness(dark, 'sidebar');
    expect(l).not.toBeNull();
    expect(l as number).toBeLessThan(0.35);
  });
});

describe('BR-REC-186 brand surfaces', () => {
  test.each([
    ['root', root],
    ['dark', dark],
  ])('BR-REC-186 primary button text is navy, never white (%s)', (_n, blk) => {
    const l = lightness(blk, 'primary-foreground');
    expect(l).not.toBeNull();
    expect(l as number).toBeLessThan(0.4);
  });
  test('BR-REC-186 the Fionis wordmark file is shipped', () => {
    expect(existsSync(join(ROOT, 'public/Fionis-Logo.avif'))).toBe(true);
  });
  test('BR-REC-186 wordmark used via next/image with 284 x 106 in at least two places (login + sidebar)', () => {
    const users = codeFiles.filter((f) => f.endsWith('.tsx') && readFileSync(f, 'utf8').includes('Fionis-Logo.avif'));
    expect(users.length).toBeGreaterThanOrEqual(2);
    for (const f of users) {
      const t = readFileSync(f, 'utf8');
      expect(t).toContain('next/image');
      expect(t).toMatch(/width=\{?284\}?/);
      expect(t).toMatch(/height=\{?106\}?/);
    }
  });
  test('BR-REC-186 Login logo has priority', () => {
    const login = readFileSync(join(SRC, 'app/(auth)/login/page.tsx'), 'utf8');
    const users = codeFiles.filter((f) => f.endsWith('.tsx') && /login/i.test(f) && readFileSync(f, 'utf8').includes('Fionis-Logo.avif'));
    const text = users.map((f) => readFileSync(f, 'utf8')).join('\n') + login;
    expect(text).toContain('Fionis-Logo.avif');
    expect(text).toMatch(/\bpriority\b/);
  });
  test('BR-REC-186 collapsed sidebar placeholder is an orange "F" square', () => {
    const t = codeFiles
      .filter((f) => f.endsWith('.tsx') && /shell/i.test(f))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(t).toMatch(/>\s*F\s*</);
    expect(t).toContain('bg-brand');
  });
});

describe('BR-REC-177 shell is the shadcn Sidebar', () => {
  const tsx = codeFiles.filter((f) => f.endsWith('.tsx') && !f.includes('components/ui/'));
  const all = tsx.map((f) => readFileSync(f, 'utf8')).join('\n');
  test('BR-REC-177 shadcn sidebar primitive is installed', () => {
    expect(existsSync(join(SRC, 'components/ui/sidebar.tsx'))).toBe(true);
  });
  test('BR-REC-177 shell uses SidebarProvider, Sidebar collapsible="icon" and SidebarInset', () => {
    expect(all).toContain('<SidebarProvider');
    expect(all).toMatch(/<Sidebar\b[^>]*collapsible="icon"/s);
    expect(all).toContain('<SidebarInset');
  });
  test('BR-REC-177 sidebar lists Home, Members, Reports, Settings and has Sign out', () => {
    for (const label of ['Home', 'Members', 'Reports', 'Settings', 'Sign out']) expect(all).toContain(label);
  });
});

describe('BR-REC-178 no tab bar; drawer below 768 px', () => {
  test('BR-REC-178 no --tabbar-h or data-hide-tabs left in src', () => {
    const hits = codeFiles.filter((f) => /--tabbar-h|data-hide-tabs/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });
  test('BR-REC-178 BottomTabBar is gone', () => {
    expect(existsSync(join(SRC, 'components/shells/BottomTabBar.tsx'))).toBe(false);
    const hits = codeFiles.filter((f) => /BottomTabBar/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });
  test('BR-REC-178 mobile breakpoint is 768 px', () => {
    const t = codeFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(t).toMatch(/MOBILE_BREAKPOINT\s*=\s*768|max-width:\s*767px|\(min-width:\s*768px\)/);
  });
  test('BR-REC-178 a sidebar trigger (menu button) exists for phones', () => {
    const t = codeFiles
      .filter((f) => f.endsWith('.tsx') && !f.includes('components/ui/'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(t).toContain('SidebarTrigger');
  });
});

describe('BR-REC-214 fonts: Outfit preloaded, Poppins 600 and Geist Mono on demand, Latin only', () => {
  const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8');
  const callOf = (name: string) => layout.match(new RegExp(`${name}\\(\\{[\\s\\S]*?\\}\\)`))?.[0] ?? '';
  test('BR-REC-214 Raleway is gone, Poppins is imported', () => {
    expect(layout).not.toMatch(/Raleway/);
    expect(layout).toMatch(/\bPoppins\b/);
    expect(css).not.toMatch(/raleway/i);
  });
  test('BR-REC-214 Poppins is weight 600 only, not preloaded, latin, swap', () => {
    const p = callOf('Poppins');
    expect(p).toMatch(/weight:\s*['"]600['"]/);
    expect(p).toMatch(/preload:\s*false/);
    expect(p).toMatch(/subsets:\s*\[\s*['"]latin['"]\s*\]/);
    expect(p).toMatch(/display:\s*['"]swap['"]/);
    expect(p).toMatch(/adjustFontFallback:\s*true/);
  });
  test('BR-REC-214 Outfit is the only preloaded font', () => {
    expect(callOf('Outfit')).toMatch(/preload:\s*true/);
    expect(callOf('Geist_Mono')).toMatch(/preload:\s*false/);
    expect((layout.match(/preload:\s*true/g) ?? []).length).toBe(1);
  });
  test('BR-REC-214 headings use the Poppins variable', () => {
    expect(theme).toMatch(/--font-heading:\s*var\(--font-poppins\)/);
  });
  test('BR-REC-214 exactly three font families are loaded', () => {
    expect((layout.match(/from 'next\/font\/google'/g) ?? []).length).toBe(1);
    const imp = layout.match(/import \{([^}]*)\} from 'next\/font\/google'/)?.[1] ?? '';
    expect(imp.split(',').map((s) => s.trim()).filter(Boolean).sort()).toEqual(['Geist_Mono', 'Outfit', 'Poppins']);
  });
});

describe('BR-REC-181 density tokens are CSS variables with desktop and touch values', () => {
  test('BR-REC-181 globals.css switches density on pointer type', () => {
    expect(css).toMatch(/pointer:\s*(fine|coarse)/);
  });
});
