# Admin design rules — "Navy & Flame" (D-037, D-039)

The look and feel every admin screen follows. Read by `ux-designer` (DESIGN step), `frontend-dev`, `visual-qa`
(VISUAL QA step) and `reviewer`. The spec rules behind them: `docs/specs/member-records/ux.md` (BR-REC-177…235).
Audit, before/after shots and the token file: `docs/design/admin-ui-audit/`.

Users: the gym owner and the front-desk admin — not technical, a laptop at the desk (1440 × 900) and a phone (390 px).
Every screen has **one job**, **plain words**, and **one main action**.

## 1. Colour
- Tokens only (`frontend/src/app/globals.css`, values = `docs/design/admin-ui-audit/tokens.css`); never a hex,
  `oklch()` or palette class in a component (`bun run check:colors`).
- Navy is the stage, orange is the flame, everything else steps back.
  - Primary button: `bg-primary` #F7941E, navy text, `--primary-edge` border. One per screen.
  - Orange **text** uses `text-brand` (#A64F00), never `text-primary` (fails 4.5:1).
  - Page `bg-background` (cool #EFF1F6), surfaces `ui/Card` (white, soft shadow in light; lighter card + border in dark).
- Status colour comes only from `toneFor()` (`lib/statusTone.ts`) through `StatusBadge`; always icon + words.

  | Tone | Means |
  |---|---|
  | danger | overdue |
  | warning | due soon, ends soon |
  | success | active, done |
  | info | reminder, estimated |
  | neutral | ended, archived, never recorded |

- One red (`danger` = `destructive`). Charts are SVG with `--chart-1…5` (no chart library, BR-REC-215).

## 2. Type
- Two fonts: Outfit (text, inputs, numbers with `tabular-nums`) and Poppins 600 (page and section titles).
- Sizes 12 / 13 / 14 / 16 / 18 / 22 / 28 px. Nothing below 12 px; hints and floating labels ≥ 13 px; inputs 16 px on touch.
- Member names 600. Table headers and KPI labels: 12 px, 600, uppercase, muted.
- Section titles carry a count pill ("Overdue 10").

## 3. Shape and space
- Radius 5 px base (controls ≈ 13 px, cards ≈ 9 px); badges and filter chips stay pills.
- Density tokens (`h-control`, `h-row`, `h-header`), never typed per component. Page padding `p-4`, whole width.
- Touch targets ≥ 44 px on phones. Forms: `FormItem min-h-19`, errors only on Save.

## 4. Patterns (reuse — do not rebuild)
| Need | Use |
|---|---|
| Person in a list or table | `MemberAvatar` + name (600) + one muted detail line; `ListRow` / `PersonCell` |
| Counts on a dashboard | Navy number band tiles (label, big orange number, tone dot, one line, link to the list) — see Home |
| Status | `StatusBadge` (tone map) — dot + word in dense tables, pill on cards |
| Several sub-items | One line of quiet text "Height · Weight · +13" / "All 15 measurements" — never chip piles |
| Next thing to do on a record | One banner under the header with one action (BR-REC-224) |
| Empty place | `EmptyState` with an icon, one warm sentence, at most one action |
| Loading | Grey shapes in the real layout; spinner only inside a saving button |
| Page header | `PageHeader`: title = the thing's name, sidebar toggle at the left, one main action at the right; secondary actions in ⋯ |
| Destructive action | In a ⋯ menu, with a confirm step (BR-REC-133) |
| Phone number | Formatted "98450 12345"; on a record it opens WhatsApp (`whatsAppUrl`) |
| Dates | "03 Oct 2026"; `DatePicker` (typed or calendar) |

## 5. Words
- One plain sentence that says what happened and what to do. Word list: `ux.md` → Word list.
- No ids, codes or statistics jargon ("n = 12" → "Based on 12 members"). Singular / plural correct.
- Positive where true ("Nobody is overdue. Nice work.").

## 6. Phone (390 px)
- ☰ top bar, title, one action; Save in the bottom bar on forms.
- Rows: name may wrap to 2 lines, status under the name, never a cut-off fragment.
- No sideways scroll from 320 px; number band 2 × 2.

## 7. Accessibility (WCAG 2.2 AA)
- axe: 0 serious / critical on every screen, light and dark (`tools/ui-audit/axe.mjs`).
- Contrast: text 4.5:1, large text / icons / control edges / focus 3:1. Status never by colour alone.
- Every icon-only button has a spoken name; ⋯ announces a popup and its open state; focus returns to the opener.
- One `<title>` per page ("<title> · Fionis India"), skip link, focus never hidden under sticky bars.

## 8. How a new screen is checked
1. **DESIGN** (`/design <module>`, `ux-designer`): mock-ups on the real app against these rules → owner picks → spec.
2. **VISUAL QA** (`visual-qa`, in `/feature` verify): screenshots 1440 / 390, light / dark + axe, compared with the
   approved mock-ups and this file. Visual rules are never source-scan tests (D-038).
