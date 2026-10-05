---
module: member-records/ux
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 15
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

Rules BR-REC-120…140, 177…200, 218…235 · screen index · app shell, design tokens, shared components, form primitives,
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
| BR-REC-181 | Desktop density (fine pointer, ≥ 1024 px): controls 40 px, list and table rows 48 px, page header 56 px, page padding 16 px on all sides, 16 px between sections; touch keeps BR-REC-122; all sizes are tokens, never typed per component. | Home at 1440 × 900 shows ≥ 30% more rows than v1 | Screenshot diff vs v1 on Home, Members, Member, Assess; CLS ≤ 0.05 |
| BR-REC-182 | Content width: from 768 px every admin screen uses the whole content area (no centred max-width column) with 16 px padding on all four sides, the header included, so nothing sticks to the top or an edge (owner 2026-10-05; phones unchanged); 768–1023 px uses 2 columns where they fit; nothing scrolls sideways from 360 px. | 1920 px → Members table 1280 px wide | Viewport test 360 / 800 / 1280 / 1440 / 1920 |
| BR-REC-183 | From 1024 px, Members (S5), Due list (S3) and Memberships ending (S4) are dense tables (name, phone, status, last assessment / due date, row action); below 1024 px they are rows (name, one detail line, status). Leaderboard and report card stay tables. | Members at 1440 px → 5 columns; at 360 px → rows | Screenshot at 360 and 1440 px; whole row is one link |
| BR-REC-184 | Every colour is a semantic token in `globals.css` (`:root` + `.dark`) exposed through `@theme inline` as a Tailwind class (`bg-brand`, `text-warning`, `bg-info-soft`, `bg-sidebar` …); components use only those classes — no hex, `oklch()`, `rgb()`, arbitrary `[#…]` value or palette class (`red-500`) outside `globals.css` and `src/tv/theme.ts`. | `className="text-[#F7941E]"` in a component → CI red | CI grep check over `frontend/src` (TV excluded) |
| BR-REC-185 | The palette is Fionis (fionis.in): orange primary on navy, navy sidebar in both themes, tones success / warning / danger / info / neutral each with a `-soft` background (values: #41); status → tone comes from one map: overdue = danger, due soon and ends soon = warning, active and done = success, reminder and estimated = info, ended and archived = neutral. | "Overdue 12 days" → danger badge with icon and words | axe 0 contrast issues in both themes; unit test of the tone map |
| BR-REC-186 | Brand surfaces: active nav item = orange-tint pill with orange icon and text; primary buttons orange with navy text (never white on orange, it fails 4.5:1); KPI numbers and sparklines in `text-brand`; empty states with a faint brand wash; no screen shows a flat grey active or selected state; ~~the Fionis wordmark image shows on Login only~~ (v12: no logo image, text wordmark, BR-REC-235); the sidebar shows the text "Fionis CrossFit" (heading font) when expanded and the orange "F" square when collapsed (owner, 2026-10-05). | Collapse the sidebar → orange "F" square; expand → the text "Fionis CrossFit" | Screenshot review light + dark; CLS 0 for the logo |
| BR-REC-187 | Every form field uses the owner's format (Q1, Q2): `FormField` (RHF `Controller`) → `<FormItem className="min-h-19">` (76 px, holds control + message) → `<FormControl>` wrapping a `FloatingLabelInput` (label floats inside the field; `*` and `aria-required` when required) → `<FormMessage />`; showing an error never changes the form's height. `FormItem`, `FormControl`, `FormMessage`, `FormField` and `FloatingLabelInput` live once in `components/common/form`, built on the installed shadcn `Field` / `FieldError` (no legacy shadcn `form`); number inputs and date/month picker triggers use the same `FloatingLabelInput` look; a Time field is one `FormItem` with one floating label over the min and sec boxes ("Plank (min:sec)", Q9); chips, switches and checkboxes use the same `FormItem` with the label above them (Q10); `min-h-19` (76 px) applies everywhere, desktop and touch (Q11). | Save with an empty phone → "Enter a phone number" appears inside the 76 px item, nothing below moves | CLS 0 on a failed Save; grep: no hand-made label + error `<p>`, no other min-height on field wrappers |
| BR-REC-188 | Form layout follows the form's own width (container query), not the window: 1 column below ~480 px, then 2, 3 and 4 columns (cells ≥ 240 px); related fields sit in titled groups; every desktop form fits one 1440 × 900 screen without scrolling (Add/Edit member in 2 columns, Renew, setup sheets, gym settings, Record assessment). | Add member at 1440 px → name · phone / birth · sex / joined · plan / starts on, More details spans both | Playwright screenshots 360 / 800 / 1280 / 1440 px; no page scroll at 1440 × 900 |
| BR-REC-189 | A field is checked only when Save is pressed (never on blur, focus or typing; forms use mode `onSubmit` and re-check on submit only, owner 2026-10-05); error text always comes from our schemas in plain words (never a library default such as "Invalid input: expected string, received undefined"); Save stays clickable (except while saving); a failed Save shows every error at its field, a top summary with links when there are 3 or more, and moves focus to the first problem in screen order (no smooth scroll under reduced motion); Enter in any field saves; no Reset button. | Save with 3 bad fields → summary "3 things to fix", focus on the first | Form test on Add member, Renew, gym settings, Record assessment |
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
| BR-REC-218 | Code stays simple: (a) a component used in fewer than three places and under ~100 lines lives in the file that uses it — a separate file only when three or more places use it, it is a lazy-loaded boundary, or it is a form primitive; (b) there is no `shells/` folder: the app shell lives in the layout (`app/(app)/admin/layout.tsx` and `_components/` beside it); (c) classes are plain Tailwind: sizes from the density tokens use named utilities (`h-control`, `size-control`, `h-row`, `h-header`, `page-narrow`, `page-wide`), no `calc()` for token maths (`env()`, `dvh` and runtime values stay), and `cn()` is used only to merge a passed-in `className` or conditional classes, never on a static string. | `Skeletons` row → `h-row`, not `h-(--row-height)` | CI grep: no `calc(` with `var(--` and no `h-(--`, `size-(--`, `min-h-(--` in `frontend/src` outside `components/ui`; no `components/shells` |

## Rules (v10 — visual refresh "Navy & Flame", owner 2026-10-05, D-037)

Audit and before/after shots: `docs/design/admin-ui-audit/README.md`. Same Fionis brand (D-029), applied with more strength.

| ID | Rule | Example (given → then) | Check (acceptance) |
|---|---|---|---|
| BR-REC-219 | Tokens follow `docs/design/admin-ui-audit/tokens.css` (light + dark, AA-checked): page #EFF1F6, white cards with a soft shadow (light only; dark uses a lighter card and a stronger border), primary true Fionis #F7941E with navy text and a `--primary-edge` #B86200 border on primary buttons, orange text `--brand` #A64F00, radius 5 px (badges and filter chips stay pills), one red (`--destructive` = `--danger`), `--chart-1…5` for SVG charts. Amends BR-REC-185 values and the Design tokens radius. | Primary button, light → #F7941E fill, navy text, #B86200 edge | Token test both themes; axe 0 contrast issues; `check:colors` green |
| BR-REC-220 | Two fonts: Outfit for text and numbers (number columns and KPIs use `tabular-nums`) and Poppins 600 for titles; Geist Mono is removed (amends BR-REC-123 "mono font", performance BR-REC-214 "three fonts"). Member names are 600; table headers and KPI labels are 12 px 600 uppercase muted; hints and floating labels are at least 13 px; a section count is a small pill with a spoken space ("Overdue 10"). | "95.5" and "102.0" align right in Outfit → no Geist Mono request on any screen | Font test: 2 fonts; network review |
| BR-REC-221 | One control look: every input, search box, textarea, select and date / month / time-zone trigger has the white `control-fill` and the input border; a grey fill means disabled only. Focus is a solid 2 px `--ring` outline with 2 px offset (≥ 3:1). | Add member → Date of birth looks the same as Name | Screenshot review; contrast probe of fill, edge and focus |
| BR-REC-222 | Home shows a navy number band under the search with four tiles — Overdue, Due soon, Memberships ending, Recently ended: a 12 px uppercase label, the section total as a big orange number, a tone dot and one line; each tile links to that section's "See all"; 4 across from 768 px, 2 × 2 on phones; totals come from the section data already loaded (no new API); grey shapes while loading. | 10 overdue → tile "OVERDUE 10 · assessments late" → opens the Due list | Screen test of the four links and totals |
| BR-REC-223 | Every person row (Home sections, Members, Due list, Memberships ending, search results, leaderboard) starts with an initials avatar: first letters of the first and last word of the shown name, at most 2, upper case, neutral circle; the member page shows a 64 px navy circle with orange initials; no photos. | "Surya Pratap" → "SP"; "Madonna" → "M" | Unit test of the initials helper; screenshot |
| BR-REC-224 | Member page (S7): the page title is the member's name (breadcrumb parents stay static, BR-REC-179) with the avatar and a meta line (membership status, plan, phone, joined date); under it at most one next-step banner — an overdue assessment ("Body composition overdue 34 days" [Record now]) wins over a membership that ended or ends soon ([Renew]); Archive (hide) moves into a ⋯ menu; Report card and All assessments are outline buttons with icons. An unknown member shows only "We couldn't find this member." [Back to members], with no header actions. | Overdue member with membership ending → banner shows the overdue assessment only | Screen test; unknown id → one message, no Edit / Record |
| BR-REC-225 | Due sub-items show as one line of quiet text "Height · Weight · +13" instead of chips, and "All 15 measurements" when every turned-on measurement is due (amends the word "chips" in due-list BR-REC-16, 98; same information). Names wrap to at most two lines and are never cut to a fragment; below 768 px the status badge sits under the name. | 15 of 15 due → "All 15 measurements" | Unit test of the text; 320 px screenshot shows full names |
| BR-REC-226 | Desktop tables (S3, S4, S5): header row on a muted band with 12 px uppercase labels; name column 600 with the avatar; filter tabs show counts ("Ends soon (4)"); an action column has the spoken header "Actions"; the Due list shows the phone column (BR-REC-183). | Memberships at 1440 px → "Ends soon (4) · Ended (3)" | Screenshot; axe no empty table header |
| BR-REC-227 | Sidebar toggle sits outside the sidebar, at the left of the page header, as shadcn ships it (`SidebarTrigger` in the `SidebarInset` header) from 768 px; phones keep ☰ "Open menu" in the top bar (amends the U7 clarification). The sidebar header shows the orange "F" square plus "Fionis CrossFit" when expanded and the "F" only when collapsed (amends BR-REC-186). The active item is an orange-tint pill with a 3 px orange bar at the left and orange 600 icon and text. | Click the toggle beside the page title → sidebar collapses to icons | Sidebar test; the sidebar header holds no toggle |
| BR-REC-228 | Reports (S13) words and layout (amends progress BR-REC-113 wording, same numbers): a headline sentence "17 of 20 members improved Body fat since their first reading"; a count line "Based on 12 members (5 more have only one reading)"; the average as "Body fat down 2.0 % on average · better" (better / worse from the measurement's direction, no word when it has none); the KPI number in `text-brand`; the leaderboard title names the measurement and ranks 1–3 get a medal badge; "Download CSV" in the Reports header (the S18 export); month pickers use the control height. | n = 12, 5 not counted → "Based on 12 members (5 more have only one reading)" | Unit test of the text helpers |
| BR-REC-229 | Report card (S12) on screen uses the same cards on desktop as on phones (change line + sparkline); the table stays for print; a measurement with one reading shows "First reading" instead of dashes. | One reading of Weight → "First reading · 81.7 kg" | Screenshot desktop + print preview |
| BR-REC-230 | Record assessment (S10): 1 column on phones, 2 from 768 px, 3 from 1280 px, so it fits 1440 × 900 (amends assessments BR-REC-216 and the U8 clarification); "Paper column" and "Save & next date" sit in a closed "Copying from the paper card?" Collapsible (open while a paper column is picked); a partial save's toast says "Saved 3 for Naveen Kumar · 12 still due"; a value below 0 or above 100 in a % measurement is a field error "Use 0 to 100" (no "Save anyway"; owner 2026-10-05). | 3 of 15 saved → toast "Saved 3 for Naveen Kumar · 12 still due" | Form test; 1440 × 900 screenshot without page scroll |
| BR-REC-231 | Search picks the field from the text (amends members BR-REC-201 default): only digits (spaces, `+`, `-` allowed) → Phone, text with `@` → Email, else Name; the picker shows the field in use and a manual pick wins until the text is cleared; each result shows "Last assessed 23 Sep 2026". | Name picked, type "10016" → field Phone, Lakshmi Pillai shows | Unit test of the field picker |
| BR-REC-232 | `DatePicker` also takes typed dates `dd/mm/yyyy` (`-` or `.` allowed, single digits allowed), checked on Save like any field; the calendar stays (amends BR-REC-192). On Add member, "Starts on" copies "Joined on" until the user changes it. | Type "5/1/1990" → 05 Jan 1990 | Unit test of the date parser |
| BR-REC-233 | Words (word list): empty gym name → "Enter the gym name"; setup "Please check below / above" → "Warn if lower than / Warn if higher than"; "Report table" → "Show in a group on the report card"; time zone shows city and short name ("India (Kolkata) · IST", value unchanged); empty places get one icon and a warm sentence ("Nobody is overdue. Nice work."). | Overdue list empty → icon + "Nobody is overdue. Nice work." | Copy review |
| BR-REC-234 | Each page has its own `<title>` "<route title> · Fionis India" (member pages: the name); a "Skip to content" link; on forms the action bar comes after the fields in DOM order; only the error summary is `role="alert"`; a focused field is never hidden under the sticky header or the Save bar; the "d" theme key is removed; ⋯ buttons announce a popup and its open state. | Tab to the last field on a phone form → it shows above the Save bar | axe; keyboard pass |
| BR-REC-235 | Login (S1) from 1024 px is split: a navy panel at the left with the text wordmark "Fionis CrossFit" (heading font, white, orange "F" square before it) and the line "Coach desk", the form on white at the right; phones keep the single card with the same text wordmark above the form. No logo image anywhere in the app (owner removed `Fionis-Logo.avif`, 2026-10-05); amends BR-REC-186 and Q7. | Open `/login` at 1440 px → navy panel with "Fionis CrossFit" as text, no image request | Source scan: no `Fionis-Logo` and no `next/image` on Login; screenshot |

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
(performance BR-REC-214, amended by BR-REC-220): Outfit for text, inputs, buttons and numbers (`tabular-nums`); Poppins 600 for page and section titles. Sizes 12 / 13 / 14 / 16 / 18 / 22 / 28 px, weights 400 / 500 / 600. Spacing 4 px steps; density
per BR-REC-181 as CSS variables with a desktop and a touch value. Radius 5 px (BR-REC-219). Motion 150 ms, opacity/transform only.

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
| Find a member | Home search → 2 letters or digits → result (field picked from the text, BR-REC-231) | 2 taps + typing |
| Add a member | Members → Add member → one form → Add member | 1 screen |
| Renew | Home "Ends soon" row → Renew → Renew | 2 taps |
| Back-fill one paper column | Member → Record → assessment → "Copying from the paper card?" → Q2 → type → Save & next date | 5 taps + typing |
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

## Build clarifications (U2, 2026-10-05)

Names fixed so tests and code agree (no rule changed):
- **Form primitives (BR-REC-187, 199):** `frontend/src/components/common/form/index.ts` exports `FormField`, `FormItem`, `FormControl`, `FormMessage`, `FloatingLabelInput`, `FormGrid`, `FormSection`, `NumberInput`, `DurationInput`, `FormErrorSummary`, `useFocusFirstProblem`. `FormItem` carries `min-h-19`; `FormMessage` renders inside it; nothing outside `components/common/form` builds a label + error line by hand.
- **One number parser (BR-REC-197):** `frontend/src/lib/forms/numberText.ts` exports `parseNumberText(text, decimals)` returning `{ kind: 'empty' } | { kind: 'ok', value } | { kind: 'invalid' }` (the current `lib/assessments/parseNumber.ts` behaviour, moved; `lib/assessments/parseNumber.ts` and `lib/setup/form.ts`'s own `parseNumberText` are deleted). Setup schemas use it through a Zod pipe; messages: blank required → "Enter a number", not a number → "Enter a number like 7" (whole numbers) / "Enter a number like 95.5" (decimals), out of range keeps "Use 0 to 30 days" style.
- **First problem (BR-REC-189):** `frontend/src/lib/forms/firstProblem.ts` exports `firstProblem(errors, order: string[]): string | undefined` (first field of `order` that has an error; unknown names last) and `SUMMARY_MIN = 3` (summary shown from 3 errors). The three old helpers (`members/focusFirstProblem.ts`, `setup/focusFirstProblem.ts`, `lib/assessments/focusField.ts`) are removed or become thin callers of it; smooth scroll only when `prefers-reduced-motion` is not set.
- **Modals (BR-REC-195, 196):** `ResponsiveSheet` no longer imports `@base-ui/react/drawer` (it uses `components/ui/drawer`); `ConfirmSheet` takes `cancelLabel?` and `backToClose?` (default true) and `LeaveDialog` uses it; no native `<select>` in `components/pages/setup/` and no `<details>` in `components/pages/members/`.
- **Save with nothing (BR-REC-190):** a new Record assessment with no value shows the top alert text "Enter at least one value" (word-list key `needOneValue`), re-announced on every click; an unchanged edit closes with no request and no toast.

## Build clarifications (U3, 2026-10-05)

Names fixed so tests and code agree (no rule changed):
- **Day bridge (BR-REC-193):** `frontend/src/lib/dates/dayPicker.ts` exports `isoToDate(iso: IsoDate): Date` (local midnight: `new Date(y, m - 1, d)`), `dateToIso(d: Date): IsoDate` (from the LOCAL year/month/day fields) and `WEEK_STARTS_ON = 1` (Monday). `lib/domain/dates.ts` is untouched (it is mirrored in the backend).
- **One formatter (BR-REC-191):** `frontend/src/lib/format.ts` `formatDay(iso)` returns `dd MMM yyyy` ("03 Oct 2026", day zero-padded, year always); `lib/members/dayText.ts` `formatDayWithYear` is removed and its callers use `formatDay`; "≈ Dec 2025" for estimated dates and the relative words of BR-REC-127 are unchanged.
- **Components (BR-REC-192, 194):** `components/common/DatePicker.tsx` and `components/common/MonthPicker.tsx`; the only file that imports `components/ui/calendar` is `components/common/DatePickerCalendar.tsx`, loaded with `next/dynamic` (on-demand chunk, BR-REC-215). Month logic that needs no DOM lives in `frontend/src/lib/dates/month.ts`: `isMonthDisabled(candidate: 'YYYY-MM', min?: 'YYYY-MM', max?: 'YYYY-MM'): boolean` (a month before `min` or after `max` is disabled) and `shiftYear(value: 'YYYY-MM', delta: number): 'YYYY-MM'`.
- **No native pickers:** no `type="date"`, `type="month"`, `type="datetime-local"` or `type="time"` anywhere in `frontend/src`; `components/common/DateField.tsx`, `MemberDateField.tsx`, `MonthField.tsx` and `lib/assessments/useDeferredDate.ts` are removed (their callers use `DatePicker` / `MonthPicker` inside the `FormField` primitives).

## Build clarifications (U7, 2026-10-05, owner: simplify)

- **Sidebar and header (BR-REC-177, 178, 186):** ~~the collapse button lives in the sidebar header~~ → v10 BR-REC-227: toggle beside the sidebar in the page header; (next to the text brand when expanded, under the "F" when collapsed); from 768 px the page header has no toggle, below 768 px the top bar keeps ☰. The page header has no gap between its parts beyond `gap-2`.
- **Named utilities vs shadcn components (BR-REC-218c):** where a class lands on a shadcn component that has its own base size class (buttons, triggers, sidebar menu buttons, input groups, sheet close buttons), write the token as `h-[var(--control-height)]` / `size-[var(--control-height)]`, because `cn()` (tailwind-merge) de-duplicates only known classes; plain elements use the named utilities (`h-control`, `size-control`, `h-row`, `h-header`, `page-narrow`, `page-wide`).
- **Home title (BR-REC-179):** the `/admin` route title is "Home" (the gym name is no longer a page title).
- **Search (members.md BR-REC-201):** one joined control — the Name/Email/Phone dropdown attached to the left of the search input as a single rounded box.
- **Single-use components (BR-REC-218a):** inlined into their views; kept as files: form primitives, lazy-loaded boundaries (`*Sheet` chunks, desktop tables, `ChooseGate`, `DatePickerCalendar`), `RouteHeading` (client), and anything used by two or more screens or features (those live in `components/common`).

## Build clarifications (U8, 2026-10-05, owner review of the screens)

- **Errors only on Save (BR-REC-189):** every RHF form (Add/Edit member, Renew, Login, Change password, setup sheets, Record assessment) uses `mode: 'onSubmit'` and `reValidateMode: 'onSubmit'`; messages come from the schemas (one place sets the type-error wording, e.g. "Enter a number", "Fill this in"); a field that was never touched still has a defined value so a library "expected string, received undefined" can never appear.
- **Record assessment (assessments.md BR-REC-216):** two columns from 768 px (v10 BR-REC-230: 3 from 1280 px) (one on phones), the whole content area, section titles kept; the measurement label is name + unit only (no "· due" tag — the screen is opened because it is due); the "About" tick is renamed "Approximate date" (word list) and sits with the date.
- **Whole page (BR-REC-182):** `Page` has no centred max-width from 768 px; padding is `p-4` on every side.
- **Default shadcn first (BR-REC-218):** toasts are shadcn `sonner`; custom components are kept only when used in three or more places; where a shadcn default (form, badge, card, skeleton, toggle-group, table, alert) does the job it replaces the custom one.

## Build clarifications (v10, 2026-10-05)

Names fixed so tests and code agree (no rule changed):
- **Helpers:** `@/lib/members/initials` `initialsOf(name)` (BR-REC-223); `@/lib/members/searchField` `fieldForText(text)`,
  `activeSearchField(text, manual | null)` (231); `@/lib/dates/typedDate` `parseTypedDate(text): IsoDate | null` (232);
  `@/lib/due/text` `dueItemsText(names[], turnedOnCount)` (225); `@/lib/progress/text` `improvedHeadline(improved, total, name)`,
  `averageChangeText(name, change, metric)`, `firstReadingText(value, metric)` (228, 229); `@/lib/assessments/labels`
  `savedMessage(count, memberName, stillDue?)` — full name when `stillDue` > 0 (230); `@/lib/setup/timezones`
  `timeZoneLabel(id)` (233); `@/lib/members/nextStep` `nextStepFor({ overdue: { assessmentName, daysOverdue } | null,
  membershipStatus })` → `{ kind: 'record' | 'renew', text } | null` (224).
- **Alerts (BR-REC-234 vs 190):** `role="alert"` is allowed in `FormErrorSummary` and in the "Enter at least one value"
  notice (`EntryNotices`) only.
- **Page titles (BR-REC-234):** root `metadata.title.template` `'%s · Fionis India'`; each `page.tsx` exports `metadata`
  from the route table; only the member page (S7) uses `generateMetadata` with the member's name (its sub-pages keep
  the route title); the member read is shared with the page's server prefetch (performance BR-REC-213), never fetched twice.
- **Review round 1:** the Due table also shows a "What is due" column (BR-REC-226); the member meta line also shows age and
  sex (BR-REC-224); `common/ActionBar` and `common/MenuButton` stay files (client islands inside the server `PageHeader`,
  BR-REC-218a).
- **Next-step banner (BR-REC-224):** an assessment counts as overdue by its dates only (a flagged "Assess soon" line that is
  not overdue does not count); a never-recorded assessment that is overdue by its dates counts ("… overdue 124 days");
  a line on "Remind me later" does not count; on equal days the setup order wins.
- **Loose ends:** count line with 0 left out → "Based on 12 members" only; "1 more has only one reading" (singular).

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
| Q7 | Logo | `public/Fionis-Logo.avif` on Login only (sidebar: text "Fionis CrossFit", "F" when collapsed, owner 2026-10-05); square logo, app icon, favicon = follow-up → BR-REC-186 |
| Q8 | Save on an unchanged edit | **B** close silently, no toast, on every edit form → BR-REC-190 |
| Q9 | Time field (min + sec boxes) label | **A** one floating label over the pair, one `FormItem` ("Plank (min:sec)") → BR-REC-187 |
| Q10 | Chips, switches, checkboxes | **A** same `FormItem min-h-19`, label above → BR-REC-187 |
| Q11 | `min-h-19` on desktop | **A** 76 px everywhere, desktop and touch → BR-REC-187 |

## Changelog
- 2026-10-05 v15 — clarified during build: which assessment the next-step banner picks; no rule changed
- 2026-10-05 v14 — owner: a % measurement also refuses values below 0 (BR-REC-230)
- 2026-10-05 v13 — clarified during build (review round 1): member-page title + shared prefetch, Due "What is due" column, age · sex in the meta line, two client-island files kept; no rule changed
- 2026-10-05 v12 — owner removed the logo image: Login and sidebar use the text wordmark "Fionis CrossFit" (BR-REC-235 rewritten, BR-REC-186 logo clause struck)
- 2026-10-05 v11 — clarified during build (v10): helper module names, alert exception, page-title mechanism, count-line loose ends; no rule changed
- 2026-10-05 v10 — changed after freeze and re-frozen (owner, D-037): visual refresh "Navy & Flame" from the admin UI audit — new BR-REC-219…235 (tokens, two fonts, one control look, Home number band, avatars, member header, row text, tables, sidebar toggle beside the sidebar, Reports words, report card cards, Record assessment 3 columns + paper tools collapsed, search field from text, typed dates, words, page titles and a11y, Login split); amends 123, 185, 186, 192, U7/U8 clarifications, tap budgets, and members 201, assessments 216, progress 113, due-list 16/98, performance 214; next free ID BR-REC-236
- 2026-10-05 v9 — owner review of the built screens: errors only on Save and in plain words (BR-REC-189), whole-page width with p-4 on all sides (BR-REC-182/181), reuse threshold three places and shadcn defaults first (BR-REC-218), Record assessment two columns, no "due" label tag, "Approximate date"; next free ID BR-REC-219
- 2026-10-05 v8 — owner simplification (U7): sidebar brand is text (logo stays on Login), toggle in the sidebar, Home title "Home", joined search control, new BR-REC-218 (simple code: inline single-use components, no shells folder, plain Tailwind, `cn` only to merge); next free ID BR-REC-219
- 2026-10-05 v7 — clarified during build (U3): day bridge, formatter, DatePicker/MonthPicker module names, lazy calendar chunk; no rule changed
- 2026-10-05 v6 — clarified during build (U2): module paths and names for form primitives, number parser, first-problem helper, modals, empty-save text; no rule changed
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
