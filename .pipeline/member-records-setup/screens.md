## S14 + S15 + S16 — setup admin (frontend-dev, Stream C)

Permission for all three: the shared login (any signed-in visitor; the page guard sends everyone else to Login). All words are from the word list (BR-REC-126); server answers go through the dictionary (`messageForCode`).

### S14 Settings hub — `/admin/settings`
- Header "Settings" (no back arrow, no main action: every row leads somewhere). 720 px wide on desktop.
- Rows, each with a `>` at the right and a short second line: **Assessments** ("What you measure and how often") → S15; **Reminders & gym** ("Gym name, time zone and reminder days") → S16; **Account** ("Password and sign out") → `/admin/settings/account`; **Export data** ("Download your records") → `/admin/settings/export` (built by the progress stream; a 404 until then is accepted).
- **Theme** with three chips: **System** (chosen the first time), **Light**, **Dark**. Choosing one changes the whole app at once and is remembered on this device; System follows the phone (BR-REC-136). Nothing is shown as chosen for a moment while the page opens.
- States: no data is loaded here, so there is no loading, empty or error state of its own.

### S15 Assessment setup, the list — `/admin/settings/assessments`
- Header: back arrow to Settings, title "Assessment setup", main action **Add assessment** (bar above the tabs on phones, right of the header from 1024 px; shown once the list has loaded).
- One row per assessment, on **and off**, in setup order: name, "Every 2 months" (or "Every 1 month", "Every 6 weeks"), an **Off** badge (grey, with words) when it is turned off. Tapping the row opens that assessment (S15 detail).
- At the right of each row **Move up** and **Move down** (44 px buttons, 8 px apart, spoken as "Move up, <name>"); Move up is off on the first row, Move down on the last. A tap shows the new order at once and saves it; if saving fails the old order comes back with a toast ("Something went wrong on our side. Please try again."). Two quick taps both count.
- **Add assessment** sheet (bottom sheet on phones, dialog from 1024 px): **Name** \*, **Repeat every** \* (a number) with chips **Weeks / Months** (Months is chosen, number 1); buttons **Cancel** and **Save** (Save stays tappable; "Saving…" with a spinner while it runs; no Reset).
  - empty or 1 or 41+ characters in Name → "Use 2 to 40 characters" under Name; Repeat every empty, 0 or above 24 → "Use 1 to 24"; Save with a problem jumps to the first problem field.
  - a name that another assessment already has (any case, also an off one) → "That name is already used. Pick a different name." under Name, the sheet stays open.
  - success → the sheet closes, toast "Assessment added.", the new assessment is last in the list and On.
- States: loading = five grey rows in the real layout; empty = "No assessments yet."; load error = "Couldn't load this." with **Try again**. The list is read again every time the screen opens (BR-REC-72).

### S15 Assessment setup, one assessment — `/admin/settings/assessments/[typeId]`
- Header: back arrow to the list, title = the assessment's name, **Edit** at the right, main action **Add measurement**. Under it "Repeat every 1 month" (and an **Off** badge plus "This assessment is off. It is hidden from new entries and Home; results stay." when it is off).
- One row per measurement, on and off, in setup order: name; "unit · Higher is better" (a blank unit, like BMI, is left out; Time shows "min:sec"); an own repeat on its own line "Repeat every 3 months"; **Off** badge when turned off; **Move up / Move down** as in the list. Tapping the row opens the measurement sheet.
- A `typeId` that is not in the catalog → "This assessment was not found." with a **Back to assessments** button. Empty assessment → "No measurements yet."
- **Edit** sheet: **Name** \*, **Repeat every** \* + **Weeks / Months**, **On** switch ("Turn off to hide this assessment and its measurements. Results stay.").
  - changing the repeat (number or unit) and tapping Save turns the **same sheet** into the question **"Change the repeat?" / "This changes due dates for all members."** [Cancel] [Change repeat] (BR-REC-70; one sheet, never a second one on top, so there is one Back entry); the form is hidden but not cleared. Cancel returns to the form with every typed value and focus on Save; Change repeat saves ("Saving…" with a spinner while it runs, both buttons off). **Back** (phone Back, browser Back, swipe down or the X) at the question closes the whole sheet, like Back at the form. A server answer "name already used" at the question returns to the form with the message under Name. Changing only the name or the On switch asks nothing. Nothing changed → the sheet just closes.
  - success → sheet closes, toast "Changes saved."; the name rule and "That name is already used…" are the same as in Add (an own name, or the same name in another case, is fine).
- **Measurement sheet** (Add measurement / Edit measurement), one column:
  - **Name** \* (2 to 40; "That name is already used. Pick a different name." when this assessment already has it).
  - **Kind** \*: chips **Number / Time**. When the measurement already has results (editing) Kind is shown as plain text with "Kind and unit are locked because this measurement already has results." and **Unit** is a greyed field.
  - **Unit** (up to 12 characters, may be empty; "Use at most 12 characters") and **Decimals** chips **0 / 1 / 2** (Number only). For **Time** both are replaced by the line "Time is always shown as min:sec."
  - **Better** chips **Higher / Lower / No direction**.
  - **Please check below** and **Please check above**: number fields (Number) or minutes + seconds boxes (Time, saved as seconds); line "A result outside this range gets a second look." (Time: "… Use minutes and seconds."). Below not smaller than above → "Below must be smaller than above". Switching Kind empties unit and range.
  - **Repeat every**: chips **Same as assessment / Own repeat**; Own repeat shows **Own repeat number** \* and chips **Weeks / Months**.
  - **Report table**: chips **None / In a group**; In a group shows **Group** \* ("For example Skeletal muscle %.") and **Part** \* chips **Whole body / Arms / Trunk / Legs**. Group without a part → "Set both the report group and part, or neither".
  - **On** switch (editing only; a new measurement is always On).
  - **Cancel / Save**. Save with a problem jumps to the first problem field. A Time or Number measurement added → toast "Measurement added." and it is last in the list.
  - Editing: changing the own repeat asks "Change the repeat?" (as above: the same sheet turns into the question; Cancel keeps every typed value; Back closes the whole sheet). Changing **Better** on a measurement **with results** asks **"Change which is better?" / "Best results and leaderboards will change for past results."** [Cancel] [Change it] (BR-REC-71); both changes at once = one question "Save these changes?" with both sentences. Changing Better on a measurement without results asks nothing. Nothing else asks.
  - Only the changed fields are sent; nothing changed → the sheet just closes. A server "locked" answer (someone added results on another device) is a toast with the dictionary text; the catalog is read again.
- States: loading = repeat line + five grey rows; load error = "Couldn't load this." + **Try again**.

### S16 Reminders & gym — `/admin/settings/general`
- Header: back arrow to Settings, title "Reminders & gym", main action **Save** (header from 1024 px; bar on the bottom edge on phones with the tab bar hidden, because it is a form). 720 px wide.
- Section **Gym**: **Gym name** \* ("Printed on report cards."), **Time zone** (the phone's own picker with every time zone name; "Decides what "today" means.").
- Section **Reminders**: **Due soon** \* (days; "An assessment shows as Due soon this many days before its date.") and **Ends soon** \* (days; "A membership shows as Ends soon this many days before it ends.").
- Checks when a field is left and on Save: Gym name 2 to 60 characters ("Use 2 to 60 characters"; spaces around are removed); Due soon 0 to 30 ("Use 0 to 30 days"; 45 fails); Ends soon 0 to 60 ("Use 0 to 60 days"); a fraction → "Use a whole number of days". Save with a problem jumps to the first problem field; no Reset button.
- Save: only the changed fields are sent; "Saving…" in the button while it runs; toast "Settings saved." Saving with nothing changed also says "Settings saved." Reopening the screen (or another device) shows the saved values.
- States: loading = grey form shapes (four fields); load error = "Couldn't load this." + **Try again** (no Save button until it loads).
