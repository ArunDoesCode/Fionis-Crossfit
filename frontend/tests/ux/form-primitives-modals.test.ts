// Spec: docs/specs/member-records/ux.md (v6) BR-REC-187, 189, 190, 195, 196, 197, 198, 199
//       + "Build clarifications (U2)". No browser: these check source text only. Visual / focus / swipe
//       behaviour is manual (see the return's MANUAL-ONLY list).
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = join(ROOT, 'src');
const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const all = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(ROOT, f);
const text = (f: string) => readFileSync(f, 'utf8');
const under = (prefix: string) => all.filter((f) => rel(f).startsWith(`src/${prefix}`));
const FORM_DIR = 'components/common/form/';
const formDirText = () => under(FORM_DIR).map(text).join('\n');
const offenders = (files: string[], re: RegExp) => files.filter((f) => re.test(text(f))).map(rel);

describe('BR-REC-187 / 199 form primitives live once in components/common/form', () => {
  const NAMES = [
    'FormField',
    'FormItem',
    'FormControl',
    'FormMessage',
    'FloatingLabelInput',
    'FormGrid',
    'FormSection',
    'NumberInput',
    'DurationInput',
    'FormErrorSummary',
    'useFocusFirstProblem',
  ];
  test('BR-REC-199 the index exports every primitive', () => {
    const index = join(SRC, FORM_DIR, 'index.ts');
    expect(existsSync(index)).toBe(true);
    const t = existsSync(index) ? text(index) : '';
    for (const name of NAMES) expect(t).toMatch(new RegExp(`\\b${name}\\b`));
  });

  test('BR-REC-187 FormItem carries min-h-19', () => {
    expect(formDirText()).toContain('min-h-19');
  });

  test('BR-REC-187 FormItem is defined in the form folder', () => {
    expect(formDirText()).toMatch(/function FormItem|const FormItem/);
  });

  test('BR-REC-187 a screen that uses FormMessage also wraps it in FormItem', () => {
    const bad = under('components/pages')
      .filter((f) => /<FormMessage\b/.test(text(f)) && !/<FormItem\b/.test(text(f)))
      .map(rel);
    expect(bad).toEqual([]);
  });

  test('BR-REC-187 no screen builds a label + error line by hand (outside components/common/form and ui)', () => {
    const screens = all.filter(
      (f) => !rel(f).startsWith(`src/${FORM_DIR}`) && !rel(f).startsWith('src/components/ui/'),
    );
    const bad = screens
      .filter((f) => {
        const t = text(f);
        return (
          /<(Label|FieldLabel|label)\b/.test(t) &&
          /(<FieldError\b|role="alert"|text-destructive)/.test(t)
        );
      })
      .map(rel);
    expect(bad).toEqual([]);
  });

  test('BR-REC-187 no legacy shadcn form in components/ui', () => {
    expect(existsSync(join(SRC, 'components/ui/form.tsx'))).toBe(false);
  });
});

describe('BR-REC-197 one source per thing', () => {
  test('BR-REC-197 one number parser: lib/forms/numberText.ts exists, the old ones are gone', () => {
    expect(existsSync(join(SRC, 'lib/forms/numberText.ts'))).toBe(true);
    expect(existsSync(join(SRC, 'lib/assessments/parseNumber.ts'))).toBe(false);
    const defs = offenders(all, /function parseNumberText\b|const parseNumberText\s*=/);
    expect(defs).toEqual(['src/lib/forms/numberText.ts']);
  });

  test('BR-REC-197 one first-problem helper: lib/forms/firstProblem.ts', () => {
    expect(existsSync(join(SRC, 'lib/forms/firstProblem.ts'))).toBe(true);
  });

  test('BR-REC-197 the three old focus helpers are gone or thin callers of the shared one', () => {
    const old = [
      'components/pages/members/focusFirstProblem.ts',
      'components/pages/setup/focusFirstProblem.ts',
      'lib/assessments/focusField.ts',
    ].map((p) => join(SRC, p));
    for (const f of old.filter(existsSync)) {
      const t = text(f);
      expect(t).toMatch(/lib\/forms\/firstProblem|components\/common\/form/);
      expect(t.split('\n').length).toBeLessThan(30);
    }
  });

  test('BR-REC-189 smooth scroll respects prefers-reduced-motion', () => {
    const t =
      formDirText() +
      (existsSync(join(SRC, 'lib/forms/firstProblem.ts'))
        ? text(join(SRC, 'lib/forms/firstProblem.ts'))
        : '');
    expect(t).toContain('prefers-reduced-motion');
  });
});

describe('BR-REC-198 forms use React Hook Form + Zod through the shared primitives', () => {
  test('BR-REC-198 no custom schemaResolver anywhere', () => {
    expect(offenders(all, /schemaResolver/)).toEqual([]);
  });

  test('BR-REC-198 no toast call inside form components (toasts live in mutation hooks)', () => {
    const formFiles = [
      ...under(FORM_DIR),
      ...all.filter(
        (f) => /\buseForm\s*(<[^>]*>)?\s*\(/.test(text(f)) && rel(f).startsWith('src/components/'),
      ),
    ];
    expect(offenders(formFiles, /\btoast\s*[.(]|from 'sonner'/)).toEqual([]);
  });

  test('BR-REC-198 Record assessment form uses useForm and zodResolver', () => {
    const t = under('components/pages/assessments').map(text).join('\n');
    expect(t).toMatch(/\buseForm\s*(<[^>]*>)?\s*\(/);
    expect(t).toContain('zodResolver');
  });

  test('BR-REC-198 components/ui is not given hand-made form files', () => {
    expect(existsSync(join(SRC, 'components/ui/form.tsx'))).toBe(false);
  });
});

describe('BR-REC-189 no Reset button', () => {
  test('BR-REC-189 no reset button in any component', () => {
    const comps = under('components/');
    expect(offenders(comps, /type=["']reset["']/)).toEqual([]);
    expect(offenders(comps, /<Button[^>]*>\s*Reset\s*</)).toEqual([]);
  });
});

describe('BR-REC-190 save with nothing', () => {
  test('BR-REC-190 word list has needOneValue = "Enter at least one value"', () => {
    const words = text(join(SRC, 'lib/messages/words.ts'));
    expect(words).toMatch(/needOneValue:\s*['"]Enter at least one value['"]/);
  });

  test('BR-REC-190 no "nothing changed" toast is left', () => {
    expect(offenders(all, /nothing changed/i)).toEqual([]);
  });
});

describe('BR-REC-195 modals are shadcn components', () => {
  const sheet = join(SRC, 'components/common/ResponsiveSheet.tsx');
  test('BR-REC-195 ResponsiveSheet does not import the raw base-ui drawer', () => {
    expect(text(sheet)).not.toContain('@base-ui/react/drawer');
  });
  test('BR-REC-195 ResponsiveSheet uses components/ui/drawer, which exists', () => {
    expect(text(sheet)).toContain('@/components/ui/drawer');
    expect(existsSync(join(SRC, 'components/ui/drawer.tsx'))).toBe(true);
  });
  test('BR-REC-195 no raw base-ui drawer or <dialog> in screens', () => {
    const screens = all.filter((f) => !rel(f).startsWith('src/components/ui/'));
    expect(offenders(screens, /@base-ui\/react\/drawer/)).toEqual([]);
    expect(offenders(under('components/pages'), /<dialog\b/)).toEqual([]);
  });
  test('BR-REC-195 ConfirmSheet takes cancelLabel and backToClose', () => {
    const t = text(join(SRC, 'components/common/ConfirmSheet.tsx'));
    expect(t).toMatch(/cancelLabel\??:/);
    expect(t).toMatch(/backToClose\??:/);
  });
  test('BR-REC-195 LeaveDialog uses the shared ConfirmSheet', () => {
    expect(text(join(SRC, 'components/pages/assessments/LeaveDialog.tsx'))).toContain(
      'ConfirmSheet',
    );
  });
});

describe('BR-REC-196 no native pickers', () => {
  test('BR-REC-196 no native <select> under components/pages/setup', () => {
    expect(offenders(under('components/pages/setup'), /<select\b/)).toEqual([]);
  });
  test('BR-REC-196 no <details> under components/pages/members', () => {
    expect(offenders(under('components/pages/members'), /<details\b/)).toEqual([]);
  });
});
