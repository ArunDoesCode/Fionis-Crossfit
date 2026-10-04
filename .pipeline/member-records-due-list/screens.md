# member-records/due-list · screens touched (admin app, frontend-dev)

Input for the manual checklist (test-writer writes the checklist from the spec, not from this file).
Permission for every screen: the shared login (any signed-in user; no permission keys, BR-REC-159).

## S2 Home — `/admin` (slot `components/pages/home/DueSections.tsx`)
- Two sections before the membership sections: **Overdue**, then **Due soon**. Each: title, count (`meta.total`, hidden when 0),
  first 5 rows (E31 `pageSize=5`), "See all" (only when the count is above 0) -> `/admin/due?tab=overdue` / `?tab=soon`.
- Row (>= 56 px): member name, assessment name under it, chips of the due measurements (+N), status words at the right
  ("Assess soon", "Overdue 34 days", "Overdue 1 day", "Due today", "Due tomorrow", "Due in 3 days"), a "⋯" button (44 px, spoken name "More for <name>").
- Row tap -> `/admin/members/<memberId>/assess?type=<typeId>` (1 tap from Home; a placeholder page until the assessments stream merges).
- "⋯" -> row sheet (below).
- States: loading = grey rows per section; empty = "Nobody is overdue." / "Nobody is due soon."; error = "Couldn't load this." [Try again]
  in that section only (the other section and the membership sections keep working).
- Fresh on every visit (`staleTime: 0`): a change in Setup or a saved assessment shows when Home is opened again.

## S3 Due list — `/admin/due?tab=overdue|soon&type=<assessmentId>` (new page; `loading.tsx` / `error.tsx` kept)
- Header "Due list" with a back arrow to Home. No main action.
- Tabs **Overdue** · **Due soon** (URL `tab`, default Overdue; any other value = Overdue).
- Filter chips: **All** + every turned-on assessment in setup order (URL `type`; an invalid id is ignored = All). While the catalog loads
  or fails only "All" shows.
- Rows as on Home, 25 per page, "Show more" adds the next 25 under the rows (button reads "Loading…" while it loads; a failed page shows
  "Couldn't load this." [Try again]). Order is the server's: Assess soon first, then most days overdue / soonest due, then name A-Z.
- States: loading = grey rows; empty = one line ("Nobody is overdue." / "Nobody is due soon."); error = "Couldn't load this." [Try again].
  Switching tab or chip keeps the old rows (dimmed) until the new ones arrive.
- Row tap and "⋯" as on Home.

## Row sheet (bottom sheet on phones, centred dialog from 1024 px) — Home, S3 and the member page
Title = the member's name (lists) or the assessment name (member page); line under it = assessment name. Loads on first tap of a "⋯"
(not part of the page's first load). Choices, no confirmation for any:
- **Record assessment** (link, opens Record assessment for that member + assessment)
- **Assess soon** — or **Remove Assess soon** when the row is Assess soon. Closes the sheet; toast "Marked Assess soon." / "Removed."
- **Remind me later ›** — second step in the SAME sheet: **1 week** · **2 weeks** · **1 month** (each shows its date) · **Pick a date**
  (date field "Remind me on", after today and at most 90 days ahead, then [Set reminder]; a wrong or empty date says why under the field).
  [Back] returns to the first step. Choosing closes the sheet; toast "Reminder set for 3 Nov.".
- **Remove reminder** — only when a reminder is on (member page only; a reminder hides the row from the lists).
- **Open member** — lists only (the member page already is the member).
- Back / swipe down / the X close the whole sheet; opening it again starts on the first step.
- The list changes at once (Assess soon row jumps to the top of Overdue; Remind me later row disappears); if the call fails the change is
  undone with a plain sentence toast ("Couldn't save this. Try again." when there is no server answer); the lists are read again afterwards.

## S7 Member page — `/admin/members/<memberId>` (slot `components/pages/member/DueBlock.tsx`)
- Section **Assessments**: one line per turned-on assessment (setup order): name, ONE status badge in words — first that applies:
  "Assess soon" · "Reminder on 20 Oct" · "Never recorded" · "Overdue 34 days" · "Due today / tomorrow / in 5 days" · "Next due 12 Dec" — and chips
  of the due measurements when there are some; a "⋯" per line (spoken name "More for <assessment>").
- Sheet choices as above: Record assessment · Assess soon / Remove Assess soon · Remind me later › · Remove reminder (when a reminder is on). No "Open member".
- Archived and ended members show the block too. No main action here (the frame's "Record assessment" stays).
- States: loading = grey rows; empty = "No assessments yet."; error = "Couldn't load this." [Try again] in the block only.
