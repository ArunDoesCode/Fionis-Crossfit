// BR-REC-184 / 200: colours live in globals.css (tokens) and src/tv/theme.ts only. Run: bun run check:colors

import { join } from 'node:path';
import { Glob } from 'bun';

const ROOT = join(import.meta.dir, '..');
const ALLOWED = new Set(['src/app/globals.css', 'src/tv/theme.ts']);
const PALETTE =
  '(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)';
const UTILITIES =
  '(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)';

const RULES: [string, RegExp][] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
  ['oklch()', /\boklch\(/],
  ['rgb()/rgba()', /\brgba?\(/],
  ['hsl()', /\bhsla?\(/],
  ['arbitrary [#...] value', /\[#[0-9a-fA-F]+\]/],
  ['palette class', new RegExp(`\\b${UTILITIES}-${PALETTE}-\\d{2,3}\\b`)],
];

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
const failures: string[] = [];

for await (const file of new Glob('src/**/*.{ts,tsx,css}').scan({ cwd: ROOT })) {
  if (ALLOWED.has(file)) continue;
  const lines = (await Bun.file(join(ROOT, file)).text()).split('\n');
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    for (const [name, re] of RULES) {
      if (re.test(line)) failures.push(`${file}:${i + 1}  ${name}  ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error(`Raw colours found (use a token from globals.css):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('check:colors OK');
