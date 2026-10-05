// Full-page screenshots of admin screens on the isolated copy.
// bun shots.mjs [--routes home,member] [--viewports desktop,phone] [--themes light,dark] [--tag now] [--css file.css]
// --css injects a stylesheet before each shot (token / component preview for the DESIGN step).
import { readFileSync } from 'node:fs';
import { ROUTES, THEMES, VIEWPORTS, dir, flags, launch, login, pick, resolveIds, settle, signIn } from './lib.mjs';

const f = flags();
const creds = login();
const css = f.css ? readFileSync(f.css, 'utf8') : null;
const tag = f.tag ?? 'now';
const routes = pick(ROUTES, f.routes);
const browser = await launch();
const written = [];
for (const [vp, size] of Object.entries(VIEWPORTS).filter(([k]) => !f.viewports || f.viewports.split(',').includes(k))) {
  for (const theme of THEMES.filter((t) => !f.themes || f.themes.split(',').includes(t))) {
    const page = await (await browser.newContext({ viewport: size, colorScheme: theme })).newPage();
    const out = dir(tag, `${vp}-${theme}`);
    const shoot = async (name) => {
      await settle(page);
      if (css) await page.addStyleTag({ content: css });
      const file = `${out}/${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      written.push(file);
    };
    if (routes.some(([k]) => k === 'login')) { await page.goto(`${creds.url}/login`); await shoot('login'); }
    await signIn(page, creds);
    const ids = await resolveIds(page, creds.url);
    for (const [name, path] of routes.filter(([k]) => k !== 'login')) {
      const url = path.replace(':member', ids.member ?? '').replace(':type', ids.type ?? '');
      await page.goto(creds.url + url);
      await shoot(name);
    }
    await page.context().close();
  }
}
await browser.close();
console.log(`${written.length} screenshots in tools/ui-audit/out/${tag}/`);
