// Spec: docs/specs/member-records/ux.md (v10) BR-REC-219 (tokens), 220 (two fonts), 221 (one control look);
//       BR-REC-185 regression (tone map -> a token pair per tone). Source-text and CSS checks, no browser.
// The token values are the ones in docs/design/admin-ui-audit/tokens.css, which the rule names as the source:
// every variable in its :root and .dark blocks must come out the same in globals.css (compared as sRGB, so the
// colour format used in globals.css does not matter). `--destructive` is the one exception: the rule says it
// equals `--danger`.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type StatusKey, toneFor } from '@/lib/statusTone';
import {
  appFiles,
  cssBlock,
  cssVars,
  filesMatching,
  hexGap,
  REPO,
  readSrc,
  toHex,
} from './srcScan';

const css = readSrc('app/globals.css');
const tokensPath = join(REPO, 'docs/design/admin-ui-audit/tokens.css');
const tokensCss = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8') : '';

const themes = [
  ['light', ':root'],
  ['dark', '.dark'],
] as const;
const wanted = {
  light: cssVars(cssBlock(tokensCss, ':root')),
  dark: cssVars(cssBlock(tokensCss, '.dark')),
};
const actual = {
  light: cssVars(cssBlock(css, ':root')),
  dark: cssVars(cssBlock(css, '.dark')),
};
const theme = cssBlock(css, '@theme inline');

describe('BR-REC-219 the design tokens file is readable (guards the test itself)', () => {
  test('BR-REC-219 tokens.css has a light and a dark block with the named tokens', () => {
    for (const name of ['background', 'primary', 'primary-edge', 'brand', 'control-fill']) {
      expect(wanted.light.has(name)).toBe(true);
      expect(wanted.dark.has(name)).toBe(true);
    }
  });
  test('BR-REC-219 the colour maths agrees with the hex notes in tokens.css', () => {
    for (const m of tokensCss.matchAll(
      /--[\w-]+:\s*(oklch\([^)]*\));\s*\/\*\s*(#[0-9A-Fa-f]{6})/g,
    )) {
      const mine = toHex(m[1] as string);
      expect(mine).not.toBeNull();
      expect(hexGap(mine as string, (m[2] as string).toUpperCase())).toBeLessThanOrEqual(2);
    }
  });
});

describe('BR-REC-219 globals.css carries the tokens of tokens.css in both themes', () => {
  for (const [label] of themes) {
    for (const [name, value] of wanted[label]) {
      if (name === 'destructive') continue; // BR-REC-219: one red, tested below
      test(`BR-REC-219 ${label} --${name} is ${toHex(value)}`, () => {
        const have = actual[label].get(name);
        expect(have).toBeDefined();
        const haveHex = toHex(have as string);
        expect(haveHex).not.toBeNull();
        expect(hexGap(haveHex as string, toHex(value) as string)).toBeLessThanOrEqual(2);
      });
    }
  }
});

describe('BR-REC-219 named values of the rule', () => {
  test('BR-REC-219 page is #EFF1F6 in light', () => {
    expect(
      hexGap(toHex(actual.light.get('background') ?? '') ?? '#000000', '#EFF1F6'),
    ).toBeLessThanOrEqual(2);
  });
  test('BR-REC-219 primary is the true Fionis orange #F7941E in light and dark', () => {
    for (const t of ['light', 'dark'] as const)
      expect(
        hexGap(toHex(actual[t].get('primary') ?? '') ?? '#000000', '#F7941E'),
      ).toBeLessThanOrEqual(2);
  });
  test('BR-REC-219 --primary-edge is #B86200 in light', () => {
    expect(
      hexGap(toHex(actual.light.get('primary-edge') ?? '') ?? '#000000', '#B86200'),
    ).toBeLessThanOrEqual(2);
  });
  test('BR-REC-219 orange text --brand is #A64F00 in light', () => {
    expect(
      hexGap(toHex(actual.light.get('brand') ?? '') ?? '#000000', '#A64F00'),
    ).toBeLessThanOrEqual(2);
  });
  test('BR-REC-219 radius is 5 px (0.3125rem)', () => {
    expect(actual.light.get('radius')).toBe('0.3125rem');
  });
  for (const [label] of themes) {
    test(`BR-REC-219 ${label}: one red, --destructive equals --danger`, () => {
      const destructive = (actual[label].get('destructive') ?? '').trim();
      const danger = (actual[label].get('danger') ?? '').trim();
      expect(destructive).not.toBe('');
      const same =
        destructive === 'var(--danger)' ||
        destructive === danger ||
        (toHex(destructive) !== null &&
          hexGap(toHex(destructive) as string, toHex(danger) ?? '#000000') <= 2);
      expect(same).toBe(true);
    });
  }
  test('BR-REC-219 dark uses a lighter card than the page (surface steps, no shadow)', () => {
    const lum = (v: string | undefined) => {
      const h = toHex(v ?? '') ?? '#000000';
      return (
        0.2126 * Number.parseInt(h.slice(1, 3), 16) +
        0.7152 * Number.parseInt(h.slice(3, 5), 16) +
        0.0722 * Number.parseInt(h.slice(5, 7), 16)
      );
    };
    expect(lum(actual.dark.get('card'))).toBeGreaterThan(lum(actual.dark.get('background')));
  });
  test.each([
    'primary-edge',
    'control-fill',
    'brand',
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
  ])('BR-REC-219 --color-%s is exposed through @theme inline', (name) => {
    expect(theme).toMatch(new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`));
  });
});

describe('BR-REC-185 regression: every tone of the tone map has a token pair (used by badges and the Home number band dots)', () => {
  const keys: StatusKey[] = [
    'overdue',
    'soon',
    'ending',
    'active',
    'done',
    'reminder',
    'estimated',
    'ended',
    'archived',
    'neverRecorded',
  ];
  test.each(keys)(
    'BR-REC-185 %s maps to a tone whose --tone and --tone-soft exist in both themes',
    (key) => {
      const tone = toneFor(key);
      for (const t of ['light', 'dark'] as const) {
        expect(actual[t].has(tone)).toBe(true);
        expect(actual[t].has(`${tone}-soft`)).toBe(true);
      }
    },
  );
  test('BR-REC-185 "neverRecorded" (due row "Never recorded", not yet overdue) is neutral', () => {
    expect(toneFor('neverRecorded')).toBe('neutral');
  });
});

describe('BR-REC-220 two fonts: Outfit and Poppins 600, Geist Mono removed', () => {
  const layout = readSrc('app/layout.tsx');
  const imported = (layout.match(/import \{([^}]*)\} from 'next\/font\/google'/)?.[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  test('BR-REC-220 only Outfit and Poppins are loaded', () => {
    expect(imported).toEqual(['Outfit', 'Poppins']);
  });
  test('BR-REC-220 no Geist anywhere in the root layout or globals.css', () => {
    expect(layout).not.toMatch(/geist/i);
    expect(css).not.toMatch(/geist/i);
  });
  test('BR-REC-220 Outfit is still the only preloaded font; Poppins is weight 600', () => {
    expect((layout.match(/preload:\s*true/g) ?? []).length).toBe(1);
    expect(layout.match(/Outfit\(\{[\s\S]*?\}\)/)?.[0] ?? '').toMatch(/preload:\s*true/);
    expect(layout.match(/Poppins\(\{[\s\S]*?\}\)/)?.[0] ?? '').toMatch(/weight:\s*['"]600['"]/);
  });
  test('BR-REC-220 no screen file uses the mono font class (numbers are Outfit tabular-nums)', () => {
    expect(filesMatching(/(?<![\w-])font-mono(?![\w-])/)).toEqual([]);
  });
  test.each([
    'components/pages/progress/Leaderboard.tsx',
    'components/pages/progress/ActivePlans.tsx',
    'components/pages/progress/SegmentalSection.tsx',
  ])('BR-REC-220 number columns in %s use tabular-nums', (path) => {
    expect(readSrc(path)).toContain('tabular-nums');
  });
  test('BR-REC-220 table headers are 12 px 600 uppercase on a muted band (desktop tables)', () => {
    const text = [
      'components/common/DataTable.tsx',
      'components/pages/members/MemberTable.tsx',
      'components/pages/due/DueTable.tsx',
      'components/pages/members/EndingTable.tsx',
    ]
      .map(readSrc)
      .join('\n');
    expect(text).toMatch(/\buppercase\b/);
    expect(text).toMatch(/\btext-xs\b|text-\[12px\]|text-\[0\.75rem\]/);
    expect(text).toMatch(/\bfont-semibold\b/);
    expect(text).toMatch(/\bbg-muted\b/);
  });
  test('BR-REC-220 floating labels are at least 13 px (no text-xs or smaller)', () => {
    const label = readSrc('components/common/form/FloatingLabelInput.tsx');
    expect(label).not.toBe('');
    expect(label).not.toMatch(/\btext-xs\b|text-\[(?:9|10|11|12)px\]|text-\[0\.7\d*rem\]/);
  });
});

describe('BR-REC-221 one control look: white control-fill, input border, grey only when disabled', () => {
  // A control gets the white fill either from its own class in components/ui or from a rule in globals.css
  // that targets its data-slot.
  const controls: [string, string][] = [
    ['input', 'components/ui/input.tsx'],
    ['textarea', 'components/ui/textarea.tsx'],
    ['select-trigger', 'components/ui/select.tsx'],
    ['input-group', 'components/ui/input-group.tsx'],
  ];
  test.each(controls)('BR-REC-221 data-slot "%s" gets bg control-fill', (slot, file) => {
    const own = /control-fill/.test(readSrc(file));
    const bySlot = new RegExp(
      `\\[data-slot=["']?${slot}["']?\\][^{]*\\{[^}]*(?:background(?:-color)?:\\s*var\\(--control-fill\\))`,
    ).test(css);
    expect(own || bySlot).toBe(true);
  });
  test('BR-REC-221 the date, month and time-zone triggers and the search box are built on those controls (no own fill)', () => {
    const own = [
      'components/common/DatePicker.tsx',
      'components/common/MonthPicker.tsx',
      'components/pages/setup/TimeZoneCombobox.tsx',
      'components/common/MemberSearch.tsx',
    ]
      .map(readSrc)
      .join('\n');
    expect(own).not.toBe('');
    expect(own).not.toMatch(/\bbg-(?:input|muted|secondary|accent)(?:\/\d+)?\b/);
  });
  test('BR-REC-221 focus is a solid 2 px ring outline with a 2 px offset', () => {
    const everything = css + appFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    const inCss =
      /outline:\s*2px\s+solid\s+var\(--ring\)/.test(css) && /outline-offset:\s*2px/.test(css);
    const inClasses =
      /focus-visible:outline-2\b/.test(everything) &&
      /focus-visible:outline-ring\b/.test(everything) &&
      /focus-visible:outline-offset-2\b/.test(everything);
    expect(inCss || inClasses).toBe(true);
  });
});
