# Screens touched — member-records/assessments (Stream D)

Permission for every screen below: the shared login (any signed-in visitor; the page guard sends everyone else to Login).
"Today" = the device's day (the gym and its phones share one zone); the server stays the judge (`DATE_IN_FUTURE`).

## Round A (admin, frontend-dev) — S10 Record assessment

### S10 Record assessment — `/admin/members/[memberId]/assess?type=<assessmentId>&date=<YYYY-MM-DD>`
Reached from: member page "Record assessment" (no `type`), Home due rows / Edit in S11 (`type` and `date` set). 720 px wide on desktop.
Drawn in the browser only (grey form shapes first, same as the route's loading) because the date starts as today.
- **Header**: back arrow at the left (the close button, spoken "Back"), title = assessment name ("Body composition"), second line = member's full name. Main action (right of the header from 1024 px, bar on the bottom edge on phones, tab bar hidden): **Save & next date** (secondary) and **Save** (primary). Both stay tappable with problems; both off while saving ("Saving…" + spinner on the one tapped).
- **Date** field (the phone's date picker, nothing after today selectable) starting as today, or the `date` in the address. **About** checkbox beside it.
  - A date after today: "That date is in the future. Pick today or an earlier day." under the field; Save refuses.
  - A date before the join date: amber line "This is before Surya joined (1 Jun 2025)"; can still be saved.
  - Empty date (after Save & next date): Save puts the cursor in Date and says "Pick a date" under it.
  - **Edit · 12 Mar** badge under the date when that date already has this assessment and its values are shown in the form (estimated: "Edit · ≈ Dec 2025").
- **Paper column** chips **Q1 · Q2 · Q3 · Q4**: set the date to join date + 0 / 3 / 6 / 9 months (month end clamped) and tick About. The chip shows chosen only while date and About still match it.
- **Fields**, one per measurement in setup order, label above:
  - Number: decimal keypad, unit inside at the right, **±** button inside at the left (only when the lower check limit is empty or below 0, e.g. Flexibility). Accepts "." or ",", rounds to the measurement's decimals.
  - Time (min:sec): two boxes, minutes and seconds, number keypad; "2:02" pasted fills both. Seconds above 59 → "Enter seconds from 0 to 59"; minutes above 599 → "Enter minutes from 0 to 599"; Save refuses until fixed.
  - Keypad key says **Next** on every field and **Done** on the last one.
  - Label ends " · due" when the measurement is due (needs the due list, E32; no tag and no error while E32 does not answer).
  - Under the field: left **Last 95.5 kg · 12 Sep** (estimated: "Last 1:50 · ≈ Dec 2025"; nothing when no earlier value); right the live change **▼ −1.5 kg better** / **▲ +0:12 better** / "No change" (arrow + amount + "better"/"worse"; no word when the measurement has no direction).
  - Typed something that is not a number: "Enter a number like 95.5" (after leaving the field, and on Save).
  - After leaving a field: amber **Please check — last time 8.0** when the value jumps more than 30% from last time (exactly 30% is fine) or is outside the measurement's min/max (text adds "usually between 10 and 60"). Never blocks.
  - Emptying a field that holds a saved value: right-hand line **Will be removed** until Save.
  - Previous and change lines disappear while another date's data is loading.
- **Save** order of checks: date picked and not future → no Time box out of range → every number readable (cursor jumps to the first problem) → at least one value ("Enter at least one value", under the fields above the bar) → if any value is flagged, the **Check these values** sheet.
- **Check these values** sheet (bottom sheet on phones, centred dialog from 1024 px): one line per flagged field ("Visceral fat 17.5 (last time 8.0)"), buttons **Go back** (closes, nothing sent) and **Save anyway**.
- **Save** success: toast "Saved 9 results for Surya" (count of values written), then back to where the entry started (the page before in the app's history; opened directly → the member page). The device draft for that date is removed.
- **Save & next date** success: same toast, form stays: member and assessment kept, date emptied and focused, values and About cleared.
- **Failed Save** (no connection, timeout, server error): the form stays filled; line above the bar "Not saved — check the connection and tap Save again". Tapping Save again sends the same save (one assessment, never two). A refusal the server explains (for example `DATE_IN_FUTURE`) shows its friendly sentence in the same place.
- **Saved assessment on the picked date** (also when the page opens on a date that has one): nothing typed → its values load, "Edit · date" badge. Values already typed → question **"Results are already saved for 12 Mar. Open the saved one?"** [Keep mine] [Open]. Keep mine keeps what was typed and leaves the saved values that were not typed alone.
- **Typed values follow a date change** (a fresh entry moved to another day keeps its numbers; a saved assessment's values stay with it).
- **Draft on this device** (local storage, values and About only, per member + assessment + date, dropped after 7 days): saved after every change. Opening the form for a date with a draft shows **"Restore unsaved results from 10:42?"** [Discard] [Restore] above the form (Restore fills the fields; Discard removes the draft). Cleared by Save and by Discard; emptying every box removes it; an assessment opened and left unchanged keeps no draft. Blocked storage (private mode): no drafts, the form works.
- **Leave question** (only when something is typed or changed): "Leave without saving? Your entries stay as a draft." [Stay] [Leave]. Shown for the back arrow in the header, any other link of the app (side bar on desktop), the browser's Back button, and as the browser's own prompt when closing or reloading the tab. Leave goes where the person was heading; Stay keeps everything. A form with nothing typed leaves without any question.
- **Loading**: grey shapes in the form's layout. **Failed load**: "Couldn't load this." [Try again] (unknown member or assessment: "We couldn't find that. It may have been removed.", no retry). An assessment with no measurements turned on: "This assessment has no measurements turned on."

### Choose assessment — `/admin/members/[memberId]/assess` (no `type`)
- Header "Record assessment" with the member's name; below an empty box "Pick an assessment to record." with **Choose assessment**; the **Record for Surya** sheet opens by itself (bottom sheet on phones, centred dialog from 1024 px).
- Rows: the turned-on assessments in setup order, each with its status word when the due list answers: "Overdue 34 days", "Due in 5 days", "Due today", "Due tomorrow", "Next due 12 Dec", "Never recorded", "Assess soon", "Reminder on 20 Oct". While E32 does not answer: no status words, no message.
- Tap a row → the form for that assessment (address gets `?type=`; Back from the form returns to where the entry started, not to this sheet). Closing the sheet without choosing leaves the empty box; **Choose assessment** opens it again. No assessments turned on: "No assessments are turned on. Turn one on in Settings."
- Failed load of the list: "Couldn't load this." [Try again] inside the sheet. Unknown member: "We couldn't find that. It may have been removed."

## Round B (admin, frontend-dev) — S11 All assessments and the member page's Recent block

### S11 All assessments — `/admin/members/[memberId]/assessments?type=<assessmentId>&open=<assessmentId>`
Reached from: member page button "All assessments" (no params), a Recent row (`open` set). 720 px wide on desktop. Same shared login as above.
- **Header**: back arrow (spoken "Back") to the member page, title "All assessments", second line = member's full name (shown once the member loads). No main action in the header.
- **Filter chips** under the header: **All** + one chip per turned-on assessment, setup order; the chosen chip is filled. Kept in the address as `?type=` (replaces, no new Back step); All removes it. An assessment that is turned off but named in `?type=` also gets its chip. While the assessments load: three grey chips. Failed load of them: "Couldn't load this." [Try again] in the chips' place, the rows still work.
- **Rows**, newest first: line 1 the date ("12 Sep 2026", "12 Sep" this year, "≈ Dec 2025" when estimated), line 2 the assessment name, at the right "15 results" / "1 result". 64 px rows; long names are cut with …, no sideways scroll at 360 px. The first 25 load; **Show more** adds the next 25 (button shows "Loading…" while it loads; a failed page shows "Couldn't load this." [Try again] under the rows).
- **Empty**: no assessments at all "No assessments yet."; a filter with none "Nothing recorded for Fitness test yet.". **Failed load of the rows**: "Couldn't load this." [Try again]. **Unknown member**: "We couldn't find that. It may have been removed." (no chips, no rows).
- **Loading** (route and first load): header, three grey chips, 8 grey rows.
- **Row tap** or **`?open=<id>`**: ONE sheet (bottom sheet on phones, centred dialog from 1024 px). `?open=` opens it once and is taken out of the address, so a reload or Back from Edit does not reopen it; a malformed id opens nothing.
  - Sheet title = assessment name, second line "12 Sep 2026 · 15 results" (≈ when estimated). Body: one line per saved value in setup order, name left, value right in the mono font with its unit ("95.5 kg", "24.0 %"; Time as "2:02" / "1:05:30" with no unit). No values: "No results are saved on this assessment.".
  - Footer: **Edit** (main) and **Delete**. Edit closes the sheet and opens S10 at `/admin/members/[memberId]/assess?type=<assessment>&date=<its date>` ("Edit · date" badge there). Back from S10 (or after its Save) returns to S11 with the sheet closed.
  - **Delete** swaps the sheet's content (same sheet, no second one) for: "Delete Body composition from 12 Mar 2025?" / "9 results will be removed." with **Cancel** (focused) and **Delete assessment**. Cancel returns to the values; a double tap on Delete does not confirm by accident. While deleting: "Deleting…" with a spinner, both buttons off. Success: toast "Deleted.", sheet closes, the row is gone from the list, the member page Recent block and Home due dates update. Failure: line under the question ("Not deleted — check the connection and try again." or the server's sentence), the buttons stay; an assessment already deleted elsewhere: "We couldn't find that. It may have been removed." and the list refreshes.
  - While the values load: three grey rows (title and count already shown when the sheet came from a row). Failed load: "Couldn't load this." [Try again]; unknown, deleted or another member's assessment: "We couldn't find that. It may have been removed." (no retry).
  - Browser/phone Back, the × and swipe-down each close the whole sheet in one step.
- Not built (no screen in the spec): moving a date (E29).

### Member page (S7) — Recent block — `/admin/members/[memberId]`
- Section **Recent**: the latest 3 assessments, newest first, rows as in S11 (date, name, "15 results"); a row opens S11 with that assessment's sheet open. No "See all" link here (the page's own **All assessments** button is the way).
- Empty: "No assessments yet." Loading: three grey rows. Failed load: "Couldn't load this." [Try again] in the block only (Try again shows grey rows until the answer is in); the rest of the member page works. After Save, Edit or Delete of an assessment the block shows the change.
