---
module: member-records/ux
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-03
owner: Arun
depends_on: []
---
# Member records · Look, feel and words (mobile-first)

## Summary

Trainers use this on a phone or tablet on the gym floor, often one-handed, between classes. Every screen has
one obvious job, big targets, plain words and no technical terms. Desktop is the same layout, wider. Done =
a trainer who never saw the app records an assessment and finds who is overdue without help, and every
screen passes the checks below.

## Owns

Rules BR-REC-120…140 · screen index · app shell, design tokens, shared components, word list. Stream 0 builds
the shell and shared components; every stream follows these rules on its own screens.

## Who can do what

| Action           | Allowed                                            |
| ---------------- | -------------------------------------------------- |
| use every screen | the shared login (Login is the only public screen) |

## Rules

| ID         | Rule                                                                                                                                                                                                                        | Example (given → then)                                                          | Check                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| BR-REC-120 | Under 1024 px wide a bottom tab bar shows Home, Members, Reports, Settings (icon + word), hidden while a form or sheet is open; from 1024 px the same four sit in a left side bar with the gym name and Sign out.           | Tablet portrait 800 px → bottom tabs; landscape 1180 px → side bar             | Viewport test at 360 / 800 / 1280 px                       |
| BR-REC-121 | Each screen has at most one main action: on phones in a bar fixed above the tabs (full width, 48 px tall); on desktop at the right of the page header.                                                                      | Member page → "Record assessment"                                               | Screen review: never two primary buttons                   |
| BR-REC-122 | Touch targets are at least 44 × 44 px with 8 px between neighbours; list rows at least 56 px tall.                                                                                                                         | Chip "Q2" drawn small → still a 44 px hit area                                  | Automated size check per screen                            |
| BR-REC-123 | Body text and inputs are 16 px (iOS never zooms in), secondary text 14 px, nothing below 12 px; numbers in columns (report card, leaderboard, previous and change in Record assessment) use the mono font so digits line up. | "95.5" and "102.0" align right | CSS review |
| BR-REC-124 | Text contrast is at least 4.5:1; large text, icons and control borders at least 3:1 — in light and dark themes.                                                                                                            | Grey hint on white → must pass 4.5:1                                            | axe: 0 contrast issues                                     |
| BR-REC-125 | Status is never shown by colour alone: every badge has words (Active, Ends in 5 days, Ended, Archived, Overdue 12 days, Due today, Assess soon, Reminder 20 Oct) plus colour and icon.                                      | Grey-scale screenshot still readable                                             | Screenshot review                                          |
| BR-REC-126 | Screens use only the word list below; no ids, codes or technical words ("metric", "datatype", "interval", "snooze", "flag", "payload").                                                                                     | "Turn off" on screen, never "Deactivate"                                         | Copy review of all UI strings                              |
| BR-REC-127 | Formats: "3 Oct 2026" (year left out when it is this year), "today", "tomorrow", "in 3 days", "2 days ago"; "95.5 kg", "24.0 %"; times "2:02" or "1:05:30"; phones "98450 12345".                                           | Due 4 Oct, today 3 Oct → "Due tomorrow"                                         | Formatter unit tests                                       |
| BR-REC-128 | Every message is one plain sentence saying what happened and what to do, next to the field or as a short toast; server codes always map to friendly text (BR-REC-154).                                                      | `PERIOD_OVERLAP` → "This overlaps another membership. Change the start date." | Dictionary has every code                                  |
| BR-REC-129 | While loading, each screen shows grey shapes in its real layout (no full-page spinner); a spinner appears only inside a button while saving ("Saving…").                                                                   | Slow network → member rows as grey bars                                         | Throttled screenshot                                       |
| BR-REC-130 | Empty places show one sentence and at most one action.                                                                                                                                                                      | "No members yet." [Add member]; "Nobody is overdue."                             | Each list has one                                          |
| BR-REC-131 | A part that fails to load shows "Couldn't load this." [Try again] in its own place; the rest of the screen keeps working.                                                                                                   | Due list fails → Memberships ending still shows                                 | Error-injection test                                       |
| BR-REC-132 | Within 2 s of losing connection a thin banner says "You're offline — changes can't be saved right now"; it goes on reconnect; forms keep their values.                                                                     | Wi-fi off mid-entry → banner, values kept                                       | DevTools offline test                                      |
| BR-REC-133 | Only destructive or hard-to-undo actions ask for confirmation: archive, delete assessment, sign out all devices, change "better", change a repeat interval.                                                                 | Renew → no "Are you sure?"                                                      | Review                                                     |
| BR-REC-134 | Forms: one column, label above the field, required ones marked *, optional ones last under "More details"; checked when a field is left and on Save; Save stays tappable and jumps to the first problem; no Reset button.   | Save with no phone → scrolls to Phone, "Enter a phone number"                   | Form test                                                  |
| BR-REC-135 | On phones lists are rows (name, one detail line, status at the right), never tables; tables only on desktop or paper (leaderboard, report card).                                                                            | Members on 360 px → rows                                                        | Screenshot at 360 px                                       |
| BR-REC-136 | The theme follows the device (light/dark), with a manual choice in Settings.                                                                                                                                                | Phone in dark mode → app dark                                                   | Manual check                                               |
| BR-REC-137 | Every field has a visible label, icon-only buttons have a spoken name, focus is always visible, toasts are announced, 200% text zoom needs no sideways scrolling, and animation stops when the device asks for less motion. | VoiceOver reads "Remind me later, button"                                        | axe 0 serious; manual TalkBack pass on Login, Home, Record |
| BR-REC-138 | Short choices open as bottom sheets on phones (pick assessment, row menu, renew, confirm) and as centred dialogs on desktop; Back or swipe-down closes them.                                                                | Row "⋯" on phone → sheet from bottom                                           | UI test                                                    |
| BR-REC-139 | Phones from 360 px never scroll sideways; on desktop, forms and detail pages are at most 720 px wide and lists and reports at most 1080 px, centred.                                                                        | 1920 px screen → form stays 720 px                                              | Viewport test                                              |
| BR-REC-140 | The main jobs stay within the tap budgets below, on a phone.                                                                                                                                                                | Overdue member → form in 1 tap from Home                                        | Journey test counts taps                                   |

## Screens (index — wireframes live in the owner sub-spec)

| #                 | Screen                                          | Route                                                    | Owner                                                 |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| S1                | Login                                           | `/login`                                               | auth                                                  |
| S2                | Home                                            | `/admin`                                               | due-list (frame + due sections), members (2 sections) |
| S3                | Due list                                        | `/admin/due`                                           | due-list                                              |
| S4                | Memberships ending                              | `/admin/memberships`                                   | members                                               |
| S5 · S6 · S8    | Members · Add member · Edit member            | `/admin/members`, `/new`, `/[memberId]/edit`       | members                                               |
| S7                | Member page                                     | `/admin/members/[memberId]`                            | members (frame), due-list and assessments blocks      |
| S9                | Renew / edit membership                         | sheet on S7                                              | members                                               |
| S10 · S11        | Record assessment · All assessments            | `/admin/members/[memberId]/assess`, `/assessments`   | assessments                                           |
| S12 · S13        | Report card · Gym progress                     | `/admin/members/[memberId]/report`, `/admin/reports` | progress                                              |
| S14 · S15 · S16 | Settings · Assessment setup · Reminders & gym | `/admin/settings`, `/assessments`, `/general`      | setup                                                 |
| S17 · S18        | Account · Export data                          | `/admin/settings/account`, `/export`                 | auth · progress                                      |

## App shell

```
Phone / tablet portrait (< 1024 px)        Desktop / tablet landscape (>= 1024 px)
+--------------------------------+         +------------+-----------------------------------------+
| <  Page title          [Edit]  | 56 px   | Fionis     |  Page title               [Main action] |
+--------------------------------+         | CrossFit   +-----------------------------------------+
|                                |         |            |                                         |
|  content (scrolls)             |         | > Home     |  content, centred                       |
|                                |         |   Members  |  forms/detail 720 px, lists 1080 px     |
|                                |         |   Reports  |                                         |
+--------------------------------+         |   Settings |                                         |
| [        Main action         ] | 64 px   |            |                                         |
+--------------------------------+         | Sign out   |                                         |
| Home  Members  Reports Settings| 64 px   +------------+-----------------------------------------+
+--------------------------------+ + safe area
```

## Design tokens

Colours: the existing theme tokens in `globals.css` (primary green) plus status colours success, warning,
danger, neutral, each with a light and dark value passing BR-REC-124. Fonts (performance BR-REC-150): Outfit
for all text, inputs and buttons; Raleway for page and section titles only; Geist Mono for numbers in columns
only (BR-REC-123). Sizes 12 / 14 / 16 / 18 / 22 / 28 px, weights 400 / 500 / 600. Spacing in 4 px steps: page padding 16 px
phone / 24 px desktop, 24 px between sections. Radius 10 px (existing). Inputs and buttons 48 px tall.
Motion 150 ms, opacity/transform only.

## Shared components (Stream 0, in `components/common`)

AppShell (BottomTabBar, SideNav) · PageHeader · ActionBar · SearchField (250 ms debounce, clear button) ·
ListRow · StatusBadge · ChipList (+N) · Section (title, count, See all, own loading/error) · EmptyState ·
ErrorState · Skeletons (row, card, form) · ResponsiveSheet (sheet ↔ dialog) · ConfirmSheet · NumberField
(unit, previous, change) · DurationField (min + sec) · DateField (the phone's own date picker, no library) ·
ChoiceChips · Sparkline (server-drawn SVG) · OfflineBanner · Toasts (Sonner). New shadcn primitives (sheet,
dialog, alert-dialog, badge, tabs, switch, checkbox, toggle-group) are added with the shadcn CLI, never hand-edited.

## Word list (rules → screen)

Assessment type → Assessment · metric → Measurement · number / duration → Number / Time (min:sec) · better
higher/lower/none → Higher is better / Lower is better / No direction · interval → Repeat every · Upcoming →
Due soon · Flag → Assess soon · Snooze → Remind me later · Expiring / Expired → Ends soon / Ended · period →
Membership · estimated → About (≈) · plausibility warning → Please check · deactivate → Turn off · archive → Archive (hide).
Fixed lines: sign-in locked → "Too many wrong tries, so sign-in is paused. Try again in 9 minutes." (never says
which part was wrong; auth BR-REC-29) · archived/ended banner → "Archived 2 Jun 2026 · Membership ended 31 May 2026"
(members BR-REC-172).

## Tap budgets (BR-REC-140)

| Job                          | Path                                                             | Budget            |
| ---------------------------- | ---------------------------------------------------------------- | ----------------- |
| See who is overdue           | open the app                                                     | 0 taps (Home)     |
| Record for an overdue member | Home → tap row                                                  | 1 tap to the form |
| Find a member                | Home search → 2 letters → tap result                           | 2 taps + typing   |
| Add a member                 | Members → Add member → one form → Add member                  | 1 screen          |
| Renew                        | Home "Ends soon" row → Renew → Renew                           | 2 taps            |
| Back-fill one paper column   | Member → Record → assessment → Q2 → type → Save & next date | 4 taps + typing   |
| Print a report card          | Member → Report card → Print                                   | 2 taps            |

## Not now

Other languages (Hindi), member-facing screens, custom gym branding beyond name, onboarding tour.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Bottom tabs | **A** Home · Members · Reports · Settings / B add a centre "+ Record" button | **A** |
| Q2 | Main colour | **A** keep the current green / B the gym's own colour (send the code) | **A** |
| Q3 | Language | **A** English only / B English + Hindi (later) | **A** |

## Changelog

- 2026-10-03 v0 — draft, new in member-records v2 (user decision: phone + tablet, mobile-first)
- 2026-10-03 v0 — answers folded: three fonts kept (design tokens, BR-REC-123 mono for number columns); fixed
  lines for the locked sign-in and the archived/ended banner
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
