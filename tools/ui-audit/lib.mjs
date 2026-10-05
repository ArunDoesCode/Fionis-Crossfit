// Shared helpers for the ui-audit scripts (D-039). The isolated copy comes from setup.sh.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';

export const ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
export const OUT = join(ROOT, 'tools/ui-audit/out');

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
export const THEMES = ['light', 'dark'];

/** Every admin screen; `:member` and `:type` are filled from the seeded data. */
export const ROUTES = [
  ['login', '/login'],
  ['home', '/admin'],
  ['due', '/admin/due'],
  ['members', '/admin/members'],
  ['member-new', '/admin/members/new'],
  ['memberships', '/admin/memberships'],
  ['reports', '/admin/reports'],
  ['settings', '/admin/settings'],
  ['settings-general', '/admin/settings/general'],
  ['settings-assessments', '/admin/settings/assessments'],
  ['settings-assessment-type', '/admin/settings/assessments/:type'],
  ['settings-export', '/admin/settings/export'],
  ['settings-account', '/admin/settings/account'],
  ['member', '/admin/members/:member'],
  ['member-edit', '/admin/members/:member/edit'],
  ['member-assess', '/admin/members/:member/assess'],
  ['member-assessments', '/admin/members/:member/assessments'],
  ['member-report', '/admin/members/:member/report'],
];

/** `--key value` flags: --routes home,member --viewports desktop --themes light --tag before */
export function flags() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, '')] = a[i + 1];
  return out;
}

export function login() {
  const file = join(ROOT, '.ui-audit/login.txt');
  if (!existsSync(file)) throw new Error('Run tools/ui-audit/setup.sh first (no .ui-audit/login.txt).');
  return Object.fromEntries(readFileSync(file, 'utf8').trim().split('\n').map((l) => l.split('=')));
}

export async function launch() {
  const executablePath = process.env.UI_AUDIT_CHROMIUM || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
}

export async function signIn(page, creds) {
  await page.goto(`${creds.url}/login`);
  await page.locator('input[autocomplete="username"]').first().fill(creds.username);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 15000 });
}

/** Fills `:member` / `:type` with the first seeded member and assessment type. */
export async function resolveIds(page, base) {
  const first = async (path, re) => {
    await page.goto(base + path);
    await page.waitForLoadState('networkidle');
    return page.locator('a[href]').evaluateAll(
      (as, src) => as.map((a) => a.getAttribute('href')).find((h) => new RegExp(src).test(h)),
      re.source,
    );
  };
  const member = (await first('/admin/members', /^\/admin\/members\/[0-9a-f-]{36}$/))?.split('/').pop();
  const type = (await first('/admin/settings/assessments', /^\/admin\/settings\/assessments\/[0-9a-f-]{36}$/))?.split('/').pop();
  return { member, type };
}

export function pick(list, wanted) {
  if (!wanted) return list;
  const keys = wanted.split(',');
  return list.filter(([k]) => keys.includes(k));
}

export function dir(...parts) {
  const d = join(OUT, ...parts);
  mkdirSync(d, { recursive: true });
  return d;
}

export async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  // The Next.js dev badge is not part of the app.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
}
