---
module: member-records/ux
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 5
frozen_on: 2026-10-05
owner: Arun
depends_on: []
---
# Member records · Look, feel and words (desktop-first, phone-responsive)

## Summary

v2 (owner UAT 2026-10-05, #59): the laptop at the front desk is the main device; phones and tablets must still
work fully. Fixed left sidebar, only the page scrolls, compact desktop sizes, Fionis orange on navy, forms in
grids that fit one screen, one date picker, instant member search. Every screen has one obvious job, plain
words, no technical terms. Done = a trainer who never saw the app records an assessment and finds who is
overdue without help on a 1440 × 900 laptop and on a 360 px phone, and every screen passes the checks below.

## Owns

Rules BR-REC-120…140, 177…200 · screen index · app shell, design tokens, shared components, form primitives,
date pickers, modals, word list, code-health rules. Every stream follows these rules on its own screens.

## Who can do what

| Action           | Allowed                                            |
| ---------------- | -------------------------------------------------- |
| use every screen | the shared login (Login is the only public screen) |

## Rules (v1 — kept unless marked)

| ID | Rule | Example (given → then) | Check |
|---|---|---|---|
| BR-REC-120 | ~~Bottom tab bar under 1024 px; side bar from 1024 px.~~ Superseded by BR-REC-177, 178. | — | — |
| BR-REC-121 | ~~One main action; on phones in a bar fixed above the tabs; on desktop right of the header.~~ Superseded by BR-REC-180. | — | — |
| BR-REC-122 | On touch screens (`pointer: coarse`) targets are at least 44 × 44 px with 8 px between neighbours and list rows at least 56 px; desktop sizes are BR-REC-181. | Chip "Q2" on a phone → still a 44 px hit area | Automated size check at 360 px |
| BR-REC-123 | Inputs are 16 px on touch screens (iOS never zooms in) and 14 px on desktop; secondary text 13–14 px, nothing below 12 px; number columns use the mono font. | "95.5" and "102.0" align right | CSS review |
| BR-REC-124 | Text contrast is at least 4.5:1; large text, icons and control borders at least 3:1 — in light and dark themes. | Grey hint on white → must pass 4.5:1 | axe: 0 contrast issues |
| BR-REC-125 | Status is never shown by colour alone: every badge has words plus colour and icon. | Grey-scale screenshot still readable | Screenshot review |
| BR-REC-126 | Screens use only the word list below; no ids, codes or technical words. | "Turn off" on screen, never "Deactivate" | Copy review of all UI strings |
| BR-REC-127 | Formats: "today", "tomorrow", "in 3 days", "2 days ago"; "95.5 kg", "24.0 %"; times "2:02" or "1:05:30"; phones "98450 12345". ~~"3 Oct 2026" (year left out this year)~~ → calendar dates: BR-REC-191. | Due 4 Oct, today 3 Oct → "Due tomorrow" | Formatter unit tests |
| BR-REC-128 | Every message is one plain sentence saying what happened and what to do; server codes always map to friendly text (BR-REC-154). | `PERIOD_OVERLAP` → "This overlaps another membership. Change the start date." | Dictionary has every code |
| BR-REC-129 | While loading, each screen shows grey shapes in its real layout; a spinner appears only inside a button while saving ("Saving…"). | Slow network → member rows as grey bars | Throttled screenshot |
| BR-REC-130 | Empty places show one sentence and at most one action. | "No members yet." [Add member] | Each list has one |
| BR-REC-131 | A part that fails to load shows "Couldn't load this." [Try again] in its own place; the rest keeps working. | Due list fails → Memberships ending still shows | Error-injection test |
| BR-REC-132 | Within 2 s of losing connection a thin banner says "You're offline — changes can't be saved right now"; forms keep their values. | Wi-fi off mid-entry → banner, values kept | DevTools offline test |
| BR-REC-133 | Only destructive or hard-to-undo actions ask for confirmation: archive, delete assessment, sign out all devices, change "better", change a repeat interval. | Renew → no "Are you sure?" | Review |
| BR-REC-134 | ~~Forms: one column, label above…; Save jumps to the first problem; no Reset button.~~ Superseded by BR-REC-186, 187, 188 (no Reset button stays). | — | — |
| BR-REC-135 | ~~On phones rows, tables only on desktop or paper.~~ Superseded by BR-REC-183. | — | — |
| BR-REC-136 | The theme follows the device (light/dark), with a manual choice in Settings and in the sidebar. | Phone in dark mode → app dark | Manual check |
| BR-REC-137 | Every field has a visible label, icon-only buttons have a spoken name, focus is always visible, toasts are announced, 200% zoom needs no sideways scrolling, animation stops when the device asks for less motion. | VoiceOver reads "Open menu, button" | axe 0 serious; manual TalkBack pass |
| BR-REC-138 | ~~Bottom sheets on phones, dialogs on desktop.~~ Superseded by BR-REC-195. | — | — |
| BR-REC-139 | ~~Forms 720 px, lists 1080 px.~~ Superseded by BR-REC-182 (no sideways scroll from 360 px stays). | — | — |
| BR-REC-140 | The main jobs stay within the tap budgets below, on a phone and with a mouse. | Overdue member → form in 1 click from Home | Journey test counts taps |

## Rules (v2 — new)

| ID | Rule | Example (given → then) | Check (acceptance) |
|---|---|---|---|
| BR-REC-177 | The app shell is the shadcn **Sidebar** (`SidebarProvider` + `Sidebar collapsible="icon"` + `SidebarInset`): a left sidebar fixed to the window (logo + gym name, Home, Members, Reports, Settings, theme, Sign out) that never moves; only the content area scrolls; the collapsed/expanded choice is remembered. | Scroll a long Record assessment at 1280 px → sidebar and Sign out stay in place | Viewport test 1280 / 1440 / 1920: sidebar `position` fixed, Sign out visible at 1280 × 600; collapse survives reload |
| BR-REC-178 | Below 768 px (shadcn default; 768–1023 px gets the sidebar collapsed to icons, Q5) there is no tab bar: a sticky top bar shows ☰, the page title and the main action; ☰ opens the same sidebar items as an off-canvas drawer, which closes on a link, Esc, Back or a tap outside. | 360 px → ☰ → Members → drawer closes, Members shows | Every admin page at 360 px has ☰, at 800 px the icon sidebar; Sign out and theme reachable from the drawer; no `--tabbar-h` / `data-hide-tabs` left |
| BR-REC-179 | Every page has one parent from one route table: desktop shows breadcrumbs with static parent labels ("Members / Member / Record assessment"; the member's name in the trail is a later refinement, issue #40), phones show "‹ Members" above the title; `loading.tsx` and the screen read the same entry, so the back target never changes while loading. | Open Record assessment slowly → back target is the member page from the first frame | Unit test: each route in the screen index has one entry; loading and view use it; back is a real link (leave guard catches it) |
| BR-REC-180 | Each screen has at most one main action: on desktop at the right of a page header that stays visible while the content scrolls; on phones in a bottom action bar (48 px, above the keyboard) on forms, and in the top bar elsewhere. | Member page desktop → "Record assessment" top right, stays on scroll | Screen review: never two primary buttons; Save visible at all scroll positions |
| BR-REC-181 | Desktop density (fine pointer, ≥ 1024 px): controls 40 px, list and table rows 48 px, page header 56 px, page padding 24 px, 16 px between sections; touch keeps BR-REC-122; all sizes are tokens, never typed per component. | Home at 1440 × 900 shows ≥ 30% more rows than v1 | Screenshot diff vs v1 on Home, Members, Member, Assess; CLS ≤ 0.05 |
| BR-REC-182 | Content width: forms and detail pages up to 896 px, lists, reports and wide forms (Record assessment) up to 1280 px; 768–1023 px uses 2 columns where they fit; nothing scrolls sideways from 360 px. | 1920 px → Members table 1280 px wide | Viewport test 360 / 800 / 1280 / 1440 / 1920 |
| BR-REC-183 | From 1024 px, Members (S5), Due list (S3) and Memberships ending (S4) are dense tables (name, phone, status, last assessment / due date, row action); below 1024 px they are rows (name, one detail line, status). Leaderboard and report card stay tables. | Members at 1440 px → 5 columns; at 360 px → rows | Screenshot at 360 and 1440 px; whole row is one link |
| BR-REC-184 | Every colour is a semantic token in `globals.css` (`:root` + `.dark`) exposed through `@theme inline` as a Tailwind class (`bg-brand`, `text-warning`, `bg-info-soft`, `bg-sidebar` …); components use only those classes — no hex, `oklch()`, `rgb()`, arbitrary `[#…]` value or palette class (`red-500`) outside `globals.css` and `src/tv/theme.ts`. | `className="text-[#F7941E]"` in a component → CI red | CI grep check over `frontend/src` (TV excluded) |
| BR-REC-185 | The palette is Fionis (fionis.in): orange primary on navy, navy sidebar in both themes, tones success / warning / danger / info / neutral each with a `-soft` background (values: #41); status → tone comes from one map: overdue = danger, due soon and ends soon = warning, active and done = success, reminder and estimated = info, ended and archived = neutral. | "Overdue 12 days" → danger badge with icon and words | axe 0 contrast issues in both themes; unit test of the tone map |
| BR-REC-186 | Brand surfaces: active nav item = orange-tint pill with orange icon and text; primary buttons orange with navy text (never white on orange, it fails 4.5:1); KPI numbers and sparklines in `text-brand`; empty states with a faint brand wash; no screen shows a flat grey active or selected state; the Fionis wordmark (`public/Fionis-Logo.avif`, 284 × 106, via `next/image` with width/height, `priority` on Login) shows on Login and at the top of the expanded sidebar; the icon-collapsed sidebar shows a placeholder mark ("F" on a brand-orange rounded square) until the owner sends a square logo (Q7). | Collapse the sidebar → orange "F" square; expand → wordmark | Screenshot review light + dark; CLS 0 for the logo |
| BR-REC-187 | Every form field uses the owner's format (Q1, Q2): `FormField` (RHF `Controller`) → `<FormItem className="min-h-19">` (76 px, holds control + message) → `<FormControl>` wrapping a `FloatingLabelInput` (label floats inside the field; `*` and `aria-required` when required) → `<FormMessage />`; showing an error never changes the form's height. `FormItem`, `FormControl`, `FormMessage`, `FormField` and `FloatingLabelInput` live once in `components/common/form`, built on the installed shadcn `Field` / `FieldError` (no legacy shadcn `form`); number inputs and date/month picker triggers use the same `FloatingLabelInput` look; a Time field is one `FormItem` with one floating label over the min and sec boxes ("Plank (min:sec)", Q9); chips, switches and checkboxes use the same `FormItem` with the label above them (Q10); `min-h-19` (76 px) applies everywhere, desktop and touch (Q11). | Save with an empty phone → "Enter a phone number" appears inside the 76 px item, nothing below moves | CLS 0 on a failed Save; grep: no hand-made label + error `<p>`, no other min-height on field wrappers |
| BR-REC-188 | Form layout follows the form's own width (container query), not the window: 1 column below ~480 px, then 2, 3 and 4 columns (cells ≥ 240 px); related fields sit in titled groups; every desktop form fits one 1440 × 900 screen without scrolling (Add/Edit member in 2 columns, Renew, setup sheets, gym settings, Record assessment). | Add member at 1440 px → name · phone / birth · sex / joined · plan / starts on, More details spans both | Playwright screenshots 360 / 800 / 1280 / 1440 px; no page scroll at 1440 × 900 |
| BR-REC-189 | A field is checked when left and on Save; Save stays clickable (except while saving); a failed Save shows every error at its field, a top summary with links when there are 3 or more, and moves focus to the first problem in screen order (no smooth scroll under reduced motion); Enter in any field saves; no Reset button. | Save with 3 bad fields → summary "3 things to fix", focus on the first | Form test on Add member, Renew, gym settings, Record assessment |
| BR-REC-190 | Save with nothing to save never looks dead: on a new record it shows "Enter at least one value" as a top alert, re-announced on every click, and focuses the first field; on an edit with no change it sends nothing and closes silently (no toast, Q8) — the same on Edit member, Edit membership, gym settings and a saved assessment. | Record assessment, empty, Save twice → alert read out twice, focus on Height; Edit member unchanged → Save → back to the member page, no request | Unit test of the save-flow state; network log; grep: no "nothing changed" toast left (gym settings toast removed) |
| BR-REC-191 | Calendar dates are always shown as `dd MMM yyyy` ("03 Oct 2026", year included this year too, Q4) by one formatter; estimated dates stay "≈ Dec 2025"; relative words stay as BR-REC-127; weeks start on Monday everywhere. | Joined 1 Jun 2025 → "01 Jun 2025" | Formatter unit test; grep: one date formatter module |
| BR-REC-192 | Every date input is one shared `DatePicker` (shadcn Popover + Calendar): the button shows the date as BR-REC-191, days outside min/max are disabled (no future birth or assessment date; "Remind me later" tomorrow…+90 days), birth date has month and year dropdowns 1900…today, keyboard works (arrows, PgUp/PgDn, Esc returns focus); inside a sheet it opens inline. | Record assessment → Date → tomorrow is greyed out | Keyboard + axe check; grep: no `type="date"` left |
| BR-REC-193 | A picked day turns into `YYYY-MM-DD` from the device's local calendar fields, never through UTC (`toISOString`, `new Date('YYYY-MM-DD')`); "today" comes from the shared today hook. | Pick 3 Oct in IST → `2026-10-03`, never `2026-10-02` | Round-trip unit test under Asia/Kolkata, America/Los_Angeles, Pacific/Kiritimati incl. 31 Jan and 29 Feb |
| BR-REC-194 | Month filters (Reports join month) use a `MonthPicker` (popover, year stepper, 12 month buttons) that keeps `YYYY-MM` in the URL; "to" cannot be earlier than "from". | From Mar 2026 → "to" disables Jan–Feb 2026 | Unit test of the URL value; grep: no `type="month"` left |
| BR-REC-195 | Every modal is a shadcn component: phones get a bottom Drawer (swipe down or Back closes it), desktop a centred Dialog / AlertDialog that scrolls inside with its buttons always visible; the nav drawer is a Sheet; a sheet never opens a second sheet (confirmations are a step inside it); the leave question uses the shared confirm. | Measurement sheet at 1280 × 720 → body scrolls, Save visible | Grep: no raw `@base-ui` drawer or `<dialog>` in screens; Back test with one sheet |
| BR-REC-196 | No native pickers remain: time zone is a searchable shadcn Combobox, "More details" a shadcn Collapsible, every select a shadcn Select. | Gym settings → type "kolk" → Asia/Kolkata | Grep: no `<select>`, `<details>` in screens |
| BR-REC-197 | One source per thing: colours and sizes (tokens), breakpoints, date format, nav items (one list for sidebar and drawer), route titles and parents, status → tone map, user-facing text (`lib/messages`), form primitives, today hook; nothing is written twice. | Rename "Reports" → one edit changes sidebar, drawer and crumbs | Review checklist; grep finds one `focusFirstProblem`, one number parser, one date formatter |
| BR-REC-198 | Forms use React Hook Form + Zod (`zodResolver`, schemas in `lib/validators`) through the shared primitives — Record assessment too (Q3: drafts from `watch`, leave guard from `isDirty`; the D-024 reducer goes, D-034); toasts only in mutation hooks; busy state from the mutation; no copy-pasted `Controller` blocks; `components/ui` added only with the shadcn CLI, never hand-edited. | New form → only `FormGrid`, `FormField`, `NumberInput` | Grep: no `toast(` inside form components, no custom resolver |
| BR-REC-199 | Shared primitives live in `components/common` (form: `FormGrid`, `FormSection`, `FormField`, `FormItem`, `FormControl`, `FormMessage`, `FloatingLabelInput`, `NumberInput`, `DurationInput`, `FormErrorSummary`, `useFocusFirstProblem`; `DatePicker`, `MonthPicker`, `MemberSearch`, `ResponsiveSheet`, `ConfirmSheet`, `PageHeader` with crumbs, `StatusBadge`, `DataTable`); a screen never re-builds one. | Due sheet date → `DatePicker`, not its own input | Review: each primitive has ≥ 2 users or a reason |
| BR-REC-200 | CI fails on: a raw colour (BR-REC-184), a hand-edited `components/ui` file, `next build` errors or the bundle budget (performance BR-REC-215), plus the existing typecheck, Biome and tests. | PR adds `bg-[#000]` → red | CI workflow; a deliberately bad branch fails |

## Screens (index — wireframes live in the owner sub-spec)

| # | Screen | Route | Owner |
|---|---|---|---|
| S1 | Login | `/login` | auth |
| S2 | Home | `/admin` | due-list (frame + due sections), members (search + 2 sections) |
| S3 | Due list | `/admin/due` | due-list |
| S4 | Memberships ending | `/admin/memberships` | members |
| S5 · S6 · S8 | Members · Add member · Edit member | `/admin/members`, `/new`, `/[memberId]/edit` | members |
| S7 | Member page | `/admin/members/[memberId]` | members (frame), due-list and assessments blocks |
| S9 | Renew / edit membership | sheet on S7 | members |
| S10 · S11 | Record assessment · All assessments | `/admin/members/[memberId]/assess`, `/assessments` | assessments |
| S12 · S13 | Report card · Gym progress | `/admin/members/[memberId]/report`, `/admin/reports` | progress |
| S14 · S15 · S16 | Settings · Assessment setup · Reminders & gym | `/admin/settings`, `/assessments`, `/general` | setup |
| S17 · S18 | Account · Export data | `/admin/settings/account`, `/export` | auth · progress |

## App shell

```
Desktop (>= sidebar breakpoint)                         Phone (< breakpoint)
+-----------+--------------------------------------+    +--------------------------------+
| [logo]    | Members / Surya Pratap               |    | ☰  Surya Pratap        [Edit]  | sticky
| Fionis    | Surya Pratap      [Record assessment]|    | ‹ Members                      |
|-----------+--------------------------------------|    |  content (scrolls)             |
| > Home    |  content (only this scrolls)         |    |                                |
|   Members |  forms ≤ 896 px, lists ≤ 1280 px     |    +--------------------------------+
|   Reports |                                      |    | [   Save (forms only)        ] |
|   Settings|                                      |    +--------------------------------+
| ◐ Theme   |                                      |    ☰ = same items in a drawer
| Sign out  |                                      |
+-----------+--------------------------------------+
```

## Design tokens

Colours: BR-REC-184, 185 (starting values: issue #41, AA-checked; `--brand`, `--info`, `--info-soft` new). Fonts
(performance BR-REC-214): Outfit for text, inputs, buttons; Poppins 600 for page and section titles; Geist Mono for
number columns. Sizes 12 / 13 / 14 / 16 / 18 / 22 / 28 px, weights 400 / 500 / 600. Spacing 4 px steps; density
per BR-REC-181 as CSS variables with a desktop and a touch value. Radius 10 px. Motion 150 ms, opacity/transform only.

## Word list (rules → screen)

Assessment type → Assessment · metric → Measurement · number / duration → Number / Time (min:sec) · better
higher/lower/none → Higher is better / Lower is better / No direction · interval → Repeat every · Upcoming →
Due soon · Flag → Assess soon · Snooze → Remind me later · Expiring / Expired → Ends soon / Ended · period →
Membership · estimated → About (≈) · plausibility warning → Please check · deactivate → Turn off · archive → Archive (hide).
Fixed lines: sign-in locked → "Too many wrong tries, so sign-in is paused. Try again in 9 minutes." · archived/ended
banner → "Archived 02 Jun 2026 · Membership ended 31 May 2026" (members BR-REC-172) · empty record → "Enter at least one value".

## Tap budgets (BR-REC-140)

| Job | Path | Budget |
|---|---|---|
| See who is overdue | open the app | 0 taps (Home) |
| Record for an overdue member | Home → row | 1 tap to the form |
| Find a member | Home search → 2 letters → result (field picker defaults to Name) | 2 taps + typing |
| Add a member | Members → Add member → one form → Add member | 1 screen |
| Renew | Home "Ends soon" row → Renew → Renew | 2 taps |
| Back-fill one paper column | Member → Record → assessment → Q2 → type → Save & next date | 4 taps + typing |
| Print a report card | Member → Report card → Print | 2 taps |

## Build plan v2 (dependency order; one batch per slice)

| Slice | Issues | Rules | Needs |
|---|---|---|---|
| U0 gate | #37 | `/freeze` ux, members, assessments, setup, data-model, performance, api-contract | answers in (2026-10-05) |
| U1 shell + theme | #38, #39, #40, #41, #42, #43 | 177–186, 214, 200 (colour check) | U0 |
| U2 form primitives + modals | #47, #48, #49, #52, #53, #45 | 187–190, 195–199 | U1 |
| U3 dates | #50, #51 | 191–194, 215 | U2 (FormField slot) |
| U4 Record assessment grid | #46, #19 | assessments 216, 217; 188 | U2, U3; E25 contract change |
| U5 search + tables | #44, #17 | members 201–205, 183, data-model 206–207 | U1; E16 contract change |
| U6 performance | #54–#58, #20, #28 | performance 208–213 | U5 (directory keys) |

## Build clarifications (U1, 2026-10-05)

Names fixed so tests and code agree (no rule changed):
- **Tone map (BR-REC-185):** `frontend/src/lib/statusTone.ts` exports `type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'`, `type StatusKey` and `toneFor(key: StatusKey): StatusTone`. Keys: `overdue`→danger, `soon`→warning, `ending`→warning, `active`→success, `done`→success, `reminder`→info, `estimated`→info, `ended`→neutral, `archived`→neutral, `neverRecorded`→neutral (due row "Never recorded" that is not yet overdue). `StatusBadge` takes the tone from here only.
- **Route table (BR-REC-179):** `frontend/src/lib/routes.ts` exports `ROUTES` (one entry per screen-index route: `pattern`, `title`, optional `parent: { label, pattern }`) and `routeFor(pathname): { title: string; parent?: { label: string; href: string } }` (dynamic segments filled from the pathname). Top-level pages (Home, Members, Memberships ending, Reports, Settings) have no parent except as listed in the index.
- **Density and width tokens (BR-REC-181, 182):** `--header-height` (56 px ≥ 1024 px fine pointer), `--control-height` (40 px), `--row-height` (48 px), `--page-padding` (24 px), `--section-gap` (16 px), `--page-max-narrow` (56rem), `--page-max-wide` (80rem), all in `globals.css`; touch keeps the BR-REC-122 values.
- **Sidebar remembered state (BR-REC-177):** the choice lives in the cookie `sidebar_state`; before first paint a blocking script copies it (or the first-visit default: open from 1024 px, icons below) to `<html data-sidebar="open|collapsed">`, so a reload never flashes. Logic is one pure function in `frontend/src/components/shells/sidebarState.ts`, `readSidebarOpen()`: attribute first, else the cookie, else the viewport default — so a client-side navigation (login → `/admin`, where the script does not run) honours the cookie too. Ctrl/Cmd+B is not a sidebar shortcut (blocked only when the focus is not in an input, textarea or editable field, so bold still works in fields). Collapsed icon buttons are 44 px; the "F" placeholder keeps AA contrast (`bg-primary`, `text-primary-foreground`).

## Not now

Other languages (Hindi), member-facing screens, gym-chosen colours beyond Fionis, onboarding tour, coach-editable
section titles on the Record form, virtualised lists. Follow-up assets from the owner: a square logo for the
collapsed sidebar, app icon and favicon (the shipped logo is AVIF, supported by every target browser; no SVG yet).

## Questions

v1 Q1–Q3 answered 2026-10-03 (Q1 bottom tabs → retired by v2; Q2 "keep green" → replaced by Fionis brand, owner
2026-10-05; Q3 English only stays). v2 questions Q1–Q11 — all answered 2026-10-05, 0 open:

| # | Question | Answer |
|---|---|---|
| Q1 | Fixed height for a field and its message | **A** owner's format: `<FormItem className="min-h-19">` (76 px) holds `FormControl` + `FloatingLabelInput` + `FormMessage` → BR-REC-187 |
| Q2 | Base of the form primitives | **A** owner's API names on shadcn `Field` / `FieldError` + RHF `Controller`; no legacy shadcn `form` → BR-REC-187, 199 |
| Q3 | Record assessment state | **A** RHF + Zod (drafts via `watch`, leave guard via `isDirty`); D-024 reducer superseded (D-034) → BR-REC-198 |
| Q4 | Date shown as | **A** "03 Oct 2026" always → BR-REC-191 |
| Q5 | Width where the sidebar replaces ☰ | **A** 768 px; 768–1023 px icon-collapsed sidebar → BR-REC-178 |
| Q6 | Server prefetch (performance.md) | **A** Home and member page only → BR-REC-213 |
| Q7 | Logo | `public/Fionis-Logo.avif` on Login + expanded sidebar; "F" placeholder when collapsed; square logo, app icon, favicon = follow-up → BR-REC-186 |
| Q8 | Save on an unchanged edit | **B** close silently, no toast, on every edit form → BR-REC-190 |
| Q9 | Time field (min + sec boxes) label | **A** one floating label over the pair, one `FormItem` ("Plank (min:sec)") → BR-REC-187 |
| Q10 | Chips, switches, checkboxes | **A** same `FormItem min-h-19`, label above → BR-REC-187 |
| Q11 | `min-h-19` on desktop | **A** 76 px everywhere, desktop and touch → BR-REC-187 |

## Changelog
- 2026-10-05 v5 — clarified during build (U1 review round 2): sidebar remembered-state behaviour (`data-sidebar`, `readSidebarOpen` fallback, shortcut), 44 px collapsed targets, AA "F" square; no rule changed
- 2026-10-05 v4 — clarified during build (U1 review R-6): breadcrumbs use static parent labels; member name in the trail deferred (#40)
- 2026-10-05 v3 — clarified during build (U1): module paths and token names for the tone map, route table, density and width tokens (see Build clarifications); no rule changed
- 2026-10-05 v2 — re-frozen by the owner after the UX redesign review (#59); all open questions answered
- 2026-10-03 v0 — draft, new in member-records v2 (user decision: phone + tablet, mobile-first)
- 2026-10-03 v0 — answers folded: three fonts kept; fixed lines for the locked sign-in and the archived/ended banner
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-05 v2 — changed after freeze (owner UAT, #59, D-027…D-033): desktop-first; shadcn Sidebar shell, ☰ only
  on phones (BR-REC-120, 121 superseded); density, widths, desktop tables (122, 123 amended; 135, 139 superseded);
  Fionis brand + colour-token rule (Q2 reversed); FormField slot, grid forms, empty Save (134 superseded); `dd MMM
  yyyy`, Monday weeks, shadcn DatePicker/MonthPicker (127 date part moved to 191); shadcn modals (138 superseded);
  code-health rules 197–200; the v1 "Shared components" list is replaced by BR-REC-199 (SearchField debounce and
  native DateField gone); new BR-REC-177…200; build plan v2; 7 open questions
- 2026-10-05 v2 — owner answers folded (Q1–Q8, 0 open): BR-REC-187 rewritten to the owner's `FormItem min-h-19` +
  `FloatingLabelInput` format (overrides nextjs-standards §14 `h-4` and today's `min-h-5`, D-034); 178 sidebar from
  768 px; 186 AVIF wordmark + collapsed "F" placeholder; 190 unchanged edit closes silently; 191 year always shown;
  198 Record assessment on RHF + Zod (D-024 reducer superseded); 199 primitive list; word-list "No changes" line removed
- 2026-10-05 v2 — owner answers Q9–Q11 folded into BR-REC-187 (D-036): Time field = one `FormItem` with one floating
  label over min + sec; chips/switches/checkboxes in the same `FormItem min-h-19`, label above; 76 px everywhere; 0 open
