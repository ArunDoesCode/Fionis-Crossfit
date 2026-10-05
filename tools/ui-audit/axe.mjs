// axe (WCAG 2.2 AA) on admin screens, light and dark, desktop and phone.
// bun axe.mjs [--routes ...] [--tag now]  → out/<tag>/axe.json + a summary line per screen
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { ROUTES, THEMES, VIEWPORTS, dir, flags, launch, login, pick, resolveIds, settle, signIn } from './lib.mjs';

const f = flags();
const creds = login();
const routes = pick(ROUTES, f.routes);
const browser = await launch();
const results = [];
for (const [vp, size] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    const page = await (await browser.newContext({ viewport: size, colorScheme: theme })).newPage();
    await signIn(page, creds);
    const ids = await resolveIds(page, creds.url);
    for (const [name, path] of routes.filter(([k]) => k !== 'login')) {
      await page.goto(creds.url + path.replace(':member', ids.member ?? '').replace(':type', ids.type ?? ''));
      await settle(page);
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .exclude('nextjs-portal')
        .analyze();
      const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, count: x.nodes.length, target: x.nodes[0]?.target }));
      results.push({ screen: name, viewport: vp, theme, violations: v });
      console.log(`${vp}-${theme} ${name}: ${v.length ? v.map((x) => `${x.id}(${x.impact})×${x.count}`).join(', ') : 'clean'}`);
    }
    await page.context().close();
  }
}
await browser.close();
writeFileSync(`${dir(f.tag ?? 'now')}/axe.json`, JSON.stringify(results, null, 2));
