# member-records · Stream 0 (Foundation) · manual test checklist

Only what the automated tests do not cover. Written from the spec (`docs/specs/member-records/{ux,performance,api-contract,data-model,auth}.md`,
BR-REC ids) and the screens file. 40 items, about 60 min. Tick the box when it passes; write the item id in the PR if it fails.

**Setup (once)**
- Backend: `cd backend && docker compose up -d && bun run db:reset && bun run seed && bun run dev` (API on :4000).
- Frontend: `cd frontend && bun run dev` (:3000). Items marked **[prod]** need `bun run build && bun run start` instead.
- Viewports: Chrome DevTools device mode 360×740, 800×1180, 1280×800 (1920×1080 where named). Real Android phone and iPhone/iPad where named.
- The Member page is an empty frame: any id works, e.g. `/admin/members/00000000-0000-4000-8000-000000000001`.
- SQL items: `psql "$DATABASE_URL"` (the dev database from `backend/.env`; never the `*_test` one).

## Shell and navigation (BR-REC-120, 121, 122, 135, 139)

- [ ] **S01 · `/admin` · 360×740 phone · bottom tabs.** Open it, tap each tab. Expect: bottom bar with Home · Members · Reports · Settings, each icon + word; the current one is marked; taps go to `/admin`, `/admin/members`, `/admin/reports`, `/admin/settings`; no left side bar. BR-REC-120.
- [ ] **S02 · `/admin` · 800×1180 tablet portrait · tabs until 1024.** Expect bottom tabs, no side bar. Drag the window to 1023 px: still tabs. To 1024 px: tabs vanish, side bar appears. On a real tablet, rotate portrait → landscape (≥ 1024): layout switches. BR-REC-120.
- [ ] **S03 · `/admin` · 1280×800 · side bar.** Expect: left bar with the gym name "Fionis CrossFit" on top, the same four items (current one marked, each navigates), "Sign out" at the bottom drawn but off (tapping does nothing); no bottom tabs. BR-REC-120.
- [ ] **S04 · `/admin` · 360 · tab spacing and hit area.** DevTools box overlay on the four tabs. Expect 8 px between neighbours and every tab at least 44×44 px. BR-REC-122.
- [ ] **S05 · `/admin` · real phone with home bar (iPhone or gesture-nav Android) · safe area.** Scroll a page. Expect the tab bar fixed, sitting above the home indicator, no content hidden behind it. BR-REC-120.
- [ ] **S06 · Member page · 360 · phone frame.** Expect: back arrow (goes to `/admin/members`), title "Member", **Edit** in the header; grey blocks Membership / Assessments / Recent plus a header block; buttons **All assessments** and **Report card**; **Record assessment** is one full-width 48 px bar fixed above the tabs; it is the only primary button; scroll to the bottom and the last block is not hidden behind the bar and tabs. BR-REC-121, 122.
- [ ] **S07 · Member page · 1023 / 1024 / 1920 px · desktop frame.** At 1023: one column, action bar above tabs. At 1024 and up: no bottom bar, **Record assessment** at the right of the page header, two columns. At 1920: detail content stays at most 720 px wide, centred. BR-REC-121, 139.
- [ ] **S08 · Home `/admin` · 360 · phone frame.** Expect: title = gym name; one column; sections in order Overdue, Due soon, Memberships ending, Recently ended, each as grey rows; swipe sideways: page does not move (console `document.documentElement.scrollWidth <= innerWidth` is true). BR-REC-139, 135.
- [ ] **S09 · Home `/admin` · 1280 and 1920 · desktop frame.** Expect Overdue + Due soon in the left column, Memberships ending + Recently ended in the right column; content at most 1080 px wide and centred beside the side bar. BR-REC-139.
- [ ] **S10 · 8 placeholder routes · 360 and 1280.** Open `/admin/members`, `/admin/members/new`, `/admin/members/<id>/{edit,assess,assessments,report}`, `/admin/reports`, `/admin/settings`. Expect "This screen is not built yet." inside the shell, the matching tab / side item marked (e.g. `/admin/members/new` → Members), no sideways scroll. BR-REC-130, 139.
- [ ] **S11 · 6 routes with no page yet · desktop.** Open `/admin/due`, `/admin/memberships`, `/admin/settings/{assessments,general,account,export}`. Expect a plain "not found" page: no crash, no blank white page, no stack trace or technical words; browser Back returns. BR-REC-126.

## Look and words (BR-REC-122, 123, 126)

- [ ] **L01 · Home and Member page · 360 · sizes.** DevTools Computed on text, buttons, rows. Expect body text 16 px, secondary 14 px, nothing under 12 px; default buttons 48 px tall; every tappable item at least 44×44 with at least 8 px between neighbours; list and placeholder rows at least 56 px tall. BR-REC-122, 123.
- [ ] **L02 · every screen from S01–S11 · words.** Read all visible text (tabs, side bar, section titles, banner, placeholder, not-found). Expect plain words only: no ids, codes, "metric", "datatype", "interval", "snooze", "flag", "payload"; section names exactly Overdue, Due soon, Memberships ending, Recently ended. BR-REC-126.

## Fonts · [prod] (BR-REC-143, 150, 174)

- [ ] **F01 · `/admin`, Member page, `/login` · 1280 · which fonts are requested.** DevTools Network → Font, disable cache, hard reload. Expect Outfit requested at once, Raleway requested for the title, **Geist Mono not requested**; all from `localhost:3000/_next/static/media/*.woff2`, none from Google; `curl -s localhost:3000/admin | grep -o '<link[^>]*as="font"[^>]*>'` prints exactly one preload (Outfit). BR-REC-150.
- [ ] **F02 · same pages · font bytes.** Sum the transferred sizes of the font rows. Expect all fonts together at most 150 KB, Outfit alone at most 40 KB, only Latin files (no Cyrillic / Devanagari / other subsets). BR-REC-174.
- [ ] **F03 · `/admin` and Member page · 360 · swap without a jump.** Network "Slow 3G", Rendering → Layout Shift Regions on, hard reload. Expect text readable at once in a fallback font (never invisible), and when Outfit and Raleway arrive nothing moves or reflows. BR-REC-143, 150.
- [ ] **F04 · Home · font by element.** DevTools Computed font-family. Expect page and section titles Raleway; body, buttons, tab labels, side bar Outfit; nothing on these frames uses Geist Mono (no number columns yet). BR-REC-123, 150.

## Colour and theme (BR-REC-124, 136)

- [ ] **T01 · `/admin`, Member page, one placeholder, `/admin/members` · light · contrast.** Run axe DevTools (or Lighthouse accessibility). Expect 0 contrast issues and 0 serious issues; tab and side labels and grey hint text readable. BR-REC-124, 137.
- [ ] **T02 · same four pages · dark · contrast.** DevTools Rendering → emulate `prefers-color-scheme: dark`, run axe. Expect 0 contrast issues; grey placeholder rows and blocks still visible against the page; icons and control borders visible. BR-REC-124.
- [ ] **T03 · `/admin` · real phone or DevTools · theme follows the device.** Device set to dark → open app: dark from the first paint (no white flash). Switch device to light while the app is open: it turns light (if it needs a reload, note it). BR-REC-136.

## Accessibility (BR-REC-137, 139)

- [ ] **A01 · Home and Member page · 1280 · keyboard.** Tab through everything. Expect a visible focus ring on every stop (side items, Edit, Record assessment, All assessments, Report card), a logical order, and "Sign out" not usable. BR-REC-137.
- [ ] **A02 · Home and Member page · real phone with VoiceOver (iPhone) or TalkBack (Android).** Swipe through. Expect the tabs read with their word and the current one announced as current, the back arrow read with a spoken name (not just "button"), titles read as headings. BR-REC-137.
- [ ] **A03 · Home and Member page · 200% text zoom.** Browser zoom 200% on a 1280 window and the largest font size on a real phone. Expect no sideways scroll, no clipped text, tab labels still readable. BR-REC-137, 139.
- [ ] **A04 · `/admin` · reduced motion.** Rendering → emulate `prefers-reduced-motion: reduce`; switch tabs, go offline (O01). Expect no sliding or fading animation, grey rows not pulsing. BR-REC-137.

## Offline banner (BR-REC-132)

- [ ] **O01 · `/admin` · 360 and 1280 · goes offline.** DevTools Network → Offline (or airplane mode on a real phone). Expect within 2 s a thin banner at the top reading exactly "You're offline — changes can't be saved right now"; it pushes content down, covers nothing. BR-REC-132.
- [ ] **O02 · `/admin` · back online.** Switch back to Online. Expect the banner gone within about 2 s, layout back to normal, tabs still work. BR-REC-132.
- [ ] **O03 · Member page · 360×500 (short window so it scrolls) · offline and scrolled.** Go offline, scroll down. Expect the page header (back arrow + "Member") stays visible just below the banner, not hidden behind it. BR-REC-132 (screens: fix round 1).

## Loading (BR-REC-129, 143)

- [ ] **K01 · Home, Member page, placeholders · 360 and 1280 · [prod] Network "Slow 3G".** Hard reload each, click between tabs. Expect grey shapes in the same layout as the finished screen (Home: grey rows in four sections; Member page: grey blocks); never a full-page spinner. BR-REC-129.
- [ ] **K02 · same screens · [prod] Slow 3G, Layout Shift Regions on · skeleton to content.** Watch the swap. Expect grey rows the same height as real rows (at least 56 px), blocks the same size, nothing jumps. BR-REC-129, 143.

## Same origin and `/` (BR-REC-36, 37, 159, 161; performance tactic 24)

- [ ] **R01 · `/` · 360 and 1280.** Open `http://localhost:3000/`. Expect Home, the address bar still `/`, Home marked in the nav. `curl -sI localhost:3000/ | head -1` → `200`, no `location:` header (no redirect). Performance tactic 24.
- [ ] **R02 · `/api` through the app · terminal.** `curl -si localhost:3000/api/health` → 200 `{"success":true…}` with `server-timing: db;dur=…, total;dur=…` and `cache-control: private, no-store`. `curl -si localhost:3000/api/members` → 401 JSON with `"code":"UNAUTHORIZED"` (an API answer, not a Next HTML 404). BR-REC-36, 159, 161.
- [ ] **R03 · `/admin` · browser console · no CORS.** Run `fetch('/api/members').then(r => r.status)`. Expect 401, the request URL on the page's own host `localhost:3000`, no OPTIONS row in Network, no CORS error. Then `curl -si -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' localhost:4000/api/members` → no `access-control-allow-origin` header. BR-REC-36.
- [ ] **R04 · writes need the app's Origin · terminal.** `curl -si -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{}'` → 403 `CSRF_ORIGIN`; same with `-H 'Origin: https://evil.example'` → 403 `CSRF_ORIGIN`; same with `-H 'Origin: http://localhost:3000'` → 400 `VALIDATION_ERROR` (got past the Origin check). `curl -si -H 'Origin: https://evil.example' localhost:3000/api/health` → still 200 (reads never refused). BR-REC-37.

## Commands (BR-REC-10, 13, 60, 63, 65, 68, 164, 168, 169, 170)

- [ ] **C01 · `bun run db:reset` · after data exists.** In `backend/`: `bun run seed:perf`, then `bun run db:reset`. Expect exit 0; `select count(*) from members;` = 0; `\dt` shows the 13 tables (audit_log, idempotency_keys, app_account, auth_sessions, login_attempts, gym_settings, assessment_types, metrics, members, membership_periods, assessments, measurements, due_overrides); `bun run db:push` then says no changes. BR-REC-169.
- [ ] **C02 · `bun run seed` · content.** Run it, then: `select gym_name, timezone, upcoming_lead_days, expiry_lead_days from gym_settings;` → Fionis CrossFit · Asia/Kolkata · 7 · 14 (one row); `select count(*) from login_attempts;` → 1; `select name, interval_count, interval_unit from assessment_types order by sort_order;` → Body composition 1 month, Fitness test 2 month; metrics per type → Body composition 15, Fitness test 14; Height has better = none, unit cm, range 120–220; Fran, Filthy 50, 5K run, Hang time, Plank are datatype duration, Fran range 90–1800 (seconds); `select count(*) from metrics where table_part is not null;` → 8. BR-REC-10, 13, 60, 63, 65, 164, 168.
- [ ] **C03 · `bun run seed` · twice, after a coach edit.** `update metrics set name = 'Hang' where name = 'Hang time';` then run `bun run seed` twice. Expect the name still "Hang", no new "Hang time" row, and still 2 types, 29 metrics, 1 settings row, 1 `login_attempts` row. BR-REC-68.
- [ ] **C04 · `bun run seed:perf` · refuses a remote database.** `DATABASE_URL=postgresql://gym:secret@db.example.supabase.co:5432/postgres bun run seed:perf; echo $?`. Expect a one-line error that it only runs on a local database, a non-zero exit code, no members created (fake host, nothing is reached). BR-REC-170.
- [ ] **C05 · `bun run seed:perf` · refuses production.** `NODE_ENV=production bun run seed:perf; echo $?` with the local database URL. Expect it refuses with a clear error and a non-zero exit code, no rows added. BR-REC-170 (guard: local host and not production, per the contract).
- [ ] **C06 · `bun run seed:perf` · size of the data set.** `bun run db:reset && bun run seed && bun run seed:perf`. Expect row counts printed. `select count(*), count(*) filter (where sex='male') male, count(*) filter (where archived_at is not null) archived, min(date_part('year', age(date_of_birth))) min_age, max(date_part('year', age(date_of_birth))) max_age, min(joined_on), max(joined_on) from members;` → 1000 members, about 500 male, about 100 archived, ages 18–65, joined dates spread over about the last 3 years. BR-REC-170.
- [ ] **C07 · `bun run seed:perf` · history.** (a) No gaps or overlaps: `select count(*) from (select start_on, lag(end_on) over (partition by member_id order by start_on) p from membership_periods) x where p is not null and start_on <> p + 1;` → 0, and every member has at least one period. (b) Cadence: `select t.name, count(*) from assessments a join assessment_types t on t.id = a.type_id group by 1;` → Body composition roughly twice the Fitness test count. (c) Pick one member joined about 3 years ago: weight rows about one per month, fitness rows about one per two months, values move a little each time (not all equal, not wild jumps). (d) Copies match: `select count(*) from measurements m join assessments a on a.id = m.assessment_id where m.member_id <> a.member_id or m.measured_on <> a.assessed_on;` → 0. BR-REC-170, 166.

## Not testable in this PR (no screen triggers them yet; run when the named stream lands)

- Sheets on phone vs dialogs on desktop, tab bar hidden while a sheet / dialog / form action bar is open, Back closes a sheet with no stray history step (BR-REC-120, 138): first sheet is Renew (S9, stream B); first form bar is Add member (stream B).
- "Couldn't load this." + [Try again] and the rest of the screen still working (BR-REC-131): needs a failing call; Home sections fetch in streams B and E (stop the API, reload Home).
- Theme choice System / Light / Dark in Settings (BR-REC-136): Settings screen S14, stream C.
- Status words with an icon, grey-scale readable (BR-REC-125): first badges arrive with streams B and E.
- Forms keep their values offline (BR-REC-132), 16 px input never zooms on iPhone (BR-REC-123), time field paste "2:02" and ":" jump (BR-REC-12, 75): first forms, streams B and D.
- Geist Mono only on digit columns (BR-REC-123, 150): first number columns, streams D and F.
- API port closed to the internet (BR-REC-36), installable app and offline reload (BR-REC-151): deploy and stream G.
