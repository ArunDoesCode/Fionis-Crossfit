# member-records/setup · manual test checklist

Spec: `docs/specs/member-records/setup.md` v2 (BR-REC-10, 11, 13, 14, 60…72 + build clarifications C1…C13) + `ux.md` v1 (BR-REC-120…140 on S14, S15, S16).
Written from the spec rules and the build's screen notes (URLs, words and roles only). The server rules (E07…E15, limits, locks, races, change log) have automated tests;
this list is for what no test reaches: the three screens, the two edit sheets, the two confirmations, locked fields, widths, themes, zoom and screen readers
(no DOM test library yet, #9, so every sheet and layout rule is manual).
Tags: `[G]` golden path · `[N]` negative path · `[API]` a `curl` check of the same rule · `[slow]` needs real waiting · `[note]` the spec is silent, tell the owner, not a fail ·
`[later]` belongs to another stream's screen (entry form, Home, report card): do it when that stream is merged, not now.
Time (estimate): sections 1…12 about 75 minutes on Desktop + Phone; section 13 about 45 minutes with the real devices.
Words: "Measurement" in the app = table `metrics`. The table called `measurements` holds the **results** (values). Do not mix them up in the SQL below.

## 0. Setup (once)

- [ ] Dev DB up and rebuilt: `cd backend && docker compose up -d && bun run db:reset` (wipes the local dev DB, pushes the schema, seeds settings, the login-lock row and the catalog; refuses a non-local host).
  The Postgres on port 5433 is shared by every worktree: if another session uses database `gym`, make your own first (`docker exec gym-postgres createdb -U postgres gym_setup_dev`), put it in `backend/.env` as `DATABASE_URL=postgres://postgres:postgres@localhost:5433/gym_setup_dev`, then run `db:reset`.
- [ ] One login: `cd backend && bun run bootstrap-admin --username owner --password Gym-pass-1`. Test login below: `owner` / `Gym-pass-1`.
- [ ] Backend `cd backend && bun run dev` (port 4000, `APP_ORIGIN=http://localhost:3000`). Frontend `cd frontend && bun run dev` (port 3000; `frontend/.env.local` has `API_URL=http://localhost:4000/api`).
- [ ] Devices: **Desktop** (Chrome, window >= 1024 px), **Phone** (real phone, or DevTools device mode 360 px), **Tablet** (real, or DevTools 800 px portrait and 1180 px landscape). **A** and **B** = two different browser profiles (or a real phone and the desktop) when a step says "another device".
- [ ] Shell helpers: paste the block under this list into a terminal opened in a scratch folder (not in the repo; the cookie jar `jar.txt` lands there). `db` runs SQL inside the Docker Postgres, so no local `psql` is needed; `DBNAME` must be the same database as `DATABASE_URL` in `backend/.env`. Needs `jq` for the API steps.
- [ ] Sign in once as `owner` on Desktop (`/login`); `login Gym-pass-1` once for the `curl` steps.

```
APP=http://localhost:3000; O="Origin: $APP"; J="Content-Type: application/json"; DBNAME=gym
db() { docker exec -i gym-postgres psql -U postgres -d $DBNAME -v ON_ERROR_STOP=1 "$@"; }   # or: db() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }
login() { curl -si -c jar.txt -X POST $APP/api/auth/login -H "$O" -H "$J" -d "{\"username\":\"${2:-owner}\",\"password\":\"$1\",\"remember\":true}" | head -1; }
# Give one measurement a stored result for a made-up member (created on first use). Safe to run twice.
give_result() {  # give_result "<assessment>" "<measurement>" <value> <yyyy-mm-dd>
  db -v t="$1" -v m="$2" -v v="$3" -v d="$4" <<'SQL'
insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on)
select 'Setup Check Member', '98450 12345', '9845012345', '1990-01-01', 'male', '2026-01-01'
where not exists (select 1 from members where full_name = 'Setup Check Member');
insert into assessments (member_id, type_id, assessed_on)
select (select id from members where full_name = 'Setup Check Member'), id, :'d'::date
from assessment_types where name = :'t'
on conflict do nothing;
insert into measurements (assessment_id, metric_id, member_id, measured_on, value)
select a.id, x.id, a.member_id, a.assessed_on, :'v'::numeric
from assessments a
join assessment_types t on t.id = a.type_id and t.name = :'t'
join metrics x on x.type_id = t.id and x.name = :'m'
where a.member_id = (select id from members where full_name = 'Setup Check Member')
  and a.assessed_on = :'d'::date
on conflict do nothing;
SQL
}
```
Each `give_result` prints `INSERT 0 1` lines (a second identical run prints `INSERT 0 0`).


### How to get a measurement with results (no Stream D screen needed)
The assessments stream (record a result) is not built yet, so results are put in by hand. A measurement "has results" as soon as one row in table `measurements` points at it.
Run these **when section 7 tells you to** (not earlier: sections 2…6 need measurements without results; to go back to "no results" run `bun run db:reset` again):
```
give_result "Body composition" "Weight"   82.5 2026-09-01
give_result "Fitness test"     "Deadlift" 100  2026-09-01
give_result "Fitness test"     "Fran"     245  2026-09-01      # 245 seconds = 4:05
db -c "select t.name as assessment, x.name, v.value from measurements v join metrics x on x.id = v.metric_id join assessment_types t on t.id = x.type_id order by 1, 2"
```
→ three rows: Weight 82.5, Deadlift 100, Fran 245. After this: **Weight, Deadlift, Fran have results**; everything else (Height, Push-ups, Squats in 1 min, and every measurement you add) has none.
Reload the page after running them: the screens learn about results the next time the list is read (BR-REC-72).

## 1. Settings hub S14 (BR-REC-136, 120, 126, 139) — who: the shared login

- [ ] **1.1** [G] Phone: tap Settings in the bottom tab bar → `/admin/settings`. Header "Settings", no back arrow, no main action button. Rows in this order, each with a `>` at the right and a short second line: **Assessments** ("What you measure and how often"), **Reminders & gym** ("Gym name, time zone and reminder days"), **Account** ("Password and sign out"), **Export data** ("Download your records"). Under them **Theme** with three chips **System / Light / Dark**.
- [ ] **1.2** [G] Tap each row: Assessments → `/admin/settings/assessments`; Reminders & gym → `/admin/settings/general`; Account → `/admin/settings/account`; Export data → `/admin/settings/export` (a 404 page is accepted until the progress stream is merged). Back returns to the hub each time. Rows are at least 56 px tall.
- [ ] **1.3** [G] New browser profile, nothing saved: the **System** chip is the chosen one.
- [ ] **1.4** [G] Tap **Dark** → the whole app turns dark at once (hub, tab bar, then another page). **Light** → light. Reload → the choice stays. Open the app in the other profile → it is not affected (remembered per device). (BR-REC-136)
- [ ] **1.5** [G] Choose **System**, then switch the device's own light/dark setting (phone settings, or DevTools → Rendering → "Emulate prefers-color-scheme") → the app follows without a reload. (BR-REC-136)
- [ ] **1.6** [G] With Dark saved, reload the hub three times (once with DevTools CPU "6x slowdown"): no chip shows as chosen while the page opens, then Dark. It never flashes System or Light first. `[note]` very fast; a screen recording helps.
- [ ] **1.7** [G] Desktop >= 1024 px: left side bar with the gym name, Home / Members / Reports / Settings (Settings marked) and Sign out; the hub list is centred and at most 720 px wide even at 1920 px. Under 1024 px: no side bar, bottom tab bar with Settings marked. (BR-REC-120, 139)
- [ ] **1.8** [N] Signed out, open `/admin/settings`, `/admin/settings/assessments`, `/admin/settings/general` → each goes to Login; after signing in you land on that page.

## 2. Assessment list S15 `/admin/settings/assessments` (BR-REC-10, 13, 66, 68, 72, 129, 130, 131)

- [ ] **2.1** [G] After `db:reset`: header back arrow → Settings, title "Assessment setup", main action **Add assessment** (phone: a bar above the tab bar; >= 1024 px: right of the header; it appears once the list has loaded). Two rows in this order: **Body composition** "Every 1 month", **Fitness test** "Every 2 months". No Off badge. (BR-REC-10, 13, 121)
- [ ] **2.2** [G] Tap a row → `/admin/settings/assessments/<id>`; the back arrow returns to the list. Rows are at least 56 px tall.
- [ ] **2.3** [G] Each row has **Move up** and **Move down** at the right; **Move up** is off on the first row, **Move down** on the last. A tap on one of them does not open the row.
- [ ] **2.4** [G] Loading: DevTools → Network "Slow 3G", reload → five grey rows in the real layout (same height and place as real rows), no full-page spinner. (BR-REC-129)
- [ ] **2.5** [N] Load error: DevTools → Network → "Block request URL" `*assessment-types*`, reload → "Couldn't load this." with **Try again** where the rows would be; header and back arrow still work. Unblock, tap Try again → the rows appear. (BR-REC-131)
- [ ] **2.6** [G] Empty and refill (dev DB only; no results exist yet): `db -c "delete from measurements; delete from assessments; delete from metrics; delete from assessment_types;"` and reload → one sentence "No assessments yet." (at most one action). Then `cd backend && bun run seed` → printed `typesCreated: 2, metricsCreated: 29, settingsCreated: false`; reload → Body composition and Fitness test are back (the seed fills an empty catalog only). (BR-REC-68, 130)

## 3. Add assessment sheet (BR-REC-61, 13, 134, 138, 129)

- [ ] **3.1** [G] Tap **Add assessment**. Phone and 800 px tablet: a **bottom sheet**, tab bar hidden. >= 1024 px: a **centred dialog**. Fields in one column, label above: **Name \***, **Repeat every \*** (number `1`) with chips **Weeks / Months** (**Months** chosen), buttons **Cancel** and **Save**. No Reset button.
- [ ] **3.2** [N] Name empty, 1 character, 41 characters, or only spaces → Save → "Use 2 to 40 characters" under Name and focus jumps to Name. Exactly 2 and exactly 40 characters raise no message. The message also shows when you leave the field. (BR-REC-61)
- [ ] **3.3** [N] Repeat every empty, `0`, `25` → "Use 1 to 24"; `1` and `24` raise none. With Name **and** Repeat both wrong, Save jumps to Name first. (BR-REC-61, 134)
- [ ] **3.4** [N] Name `body composition` (also `BODY COMPOSITION` and `  Body composition  `) → Save → "That name is already used. Pick a different name." under Name; the sheet stays open and keeps what you typed; no toast; nothing added. (BR-REC-61, C2)
- [ ] **3.5** [G] Network "Slow 3G". Name `  Strength test  `, `6`, **Weeks** → Save, double-tapping it quickly → the button reads "Saving…" with a spinner and is off; the sheet closes, toast "Assessment added.", **Strength test** is the **last** row with "Every 6 weeks" and no Off badge. The Network tab shows **one** `POST /api/assessment-types` and the list has **one** new row (a second request would answer "That name is already used."). `db -c "select name, interval_count, interval_unit, is_active, sort_order from assessment_types order by sort_order"` → third row `Strength test | 6 | week | t | 3` (name trimmed). (BR-REC-61, 13, 129, C2, C7)
- [ ] **3.6** [G] Cancel, X, Esc (desktop), swipe down (phone) and Back (browser Back, Android Back button, iOS edge swipe) each close the sheet once and leave you on the list; nothing is saved. Reopen **Add assessment** → empty form again (Months chosen, `1`).

## 4. One assessment `/admin/settings/assessments/[typeId]` (BR-REC-10, 13, 63, 65, 69, 131)

- [ ] **4.1** [G] Open **Body composition**: back arrow → list; title "Body composition"; **Edit** at the right of the header; main action **Add measurement**; under it "Repeat every 1 month". **15** rows (7 single ones + 4 Subcutaneous fat + 4 Skeletal muscle), each: name, then `unit · Higher is better`: Weight → "kg · Lower is better"; Height → "cm · No direction"; BMI has no unit so its line is only "Lower is better"; Resting metabolism → "kcal · Higher is better". (BR-REC-10, 63, 69)
- [ ] **4.2** [G] Open **Fitness test**: "Repeat every 2 months"; **14** rows; the Time ones (Hang time, Plank, 5K run, Filthy 50, Fran) show "min:sec" as the unit, e.g. Fran "min:sec · Lower is better"; no row has an own-repeat line yet. (BR-REC-10, 13)
- [ ] **4.3** [G] Seeded report-table place (BR-REC-65): tap **Skeletal muscle — arms** → Report table shows **In a group**, Group `Skeletal muscle %`, Part **Arms**; **Subcutaneous fat — legs** → group `Subcutaneous fat %`, **Legs**; **Weight** → **None**. Close each with Cancel. Eight rows carry a place.
- [ ] **4.4** [N] Not found: open `/admin/settings/assessments/00000000-0000-0000-0000-000000000000`, then `/admin/settings/assessments/abc` → "This assessment was not found." and a **Back to assessments** button that goes to the list.
- [ ] **4.5** [G] Empty assessment: open **Strength test** (made in 3.5) → "Repeat every 6 weeks" and "No measurements yet." (one sentence, **Add measurement** still there). (BR-REC-130)
- [ ] **4.6** [G] Loading: "Slow 3G", reload a detail page → the repeat line plus five grey rows. Load error: block `*assessment-types*`, reload → "Couldn't load this." + **Try again**; unblock, Try again → the rows appear. (BR-REC-129, 131)

## 5. Edit assessment sheet (BR-REC-61, 66, 70, 133, 138)

Use **Strength test** (6 weeks, no measurements yet) unless said otherwise. It has no results, so only the repeat question can appear.

- [ ] **5.1** [G] Tap **Edit** (in the detail header). The sheet is titled "Edit assessment": **Name \*** (filled), **Repeat every \*** (`6`, **Weeks** chosen), an **On** switch with the line "Turn off to hide this assessment and its measurements. Results stay.", buttons Cancel / Save.
- [ ] **5.2** [G] Nothing changed → Save → the sheet just closes: no `PATCH` in the Network tab, no question, no toast needed. Also: change the repeat to `8` and back to `6`, then Save → the same (nothing differs from what is stored, so no question).
- [ ] **5.3** [G] Rename only (`Strength test` → `Strength check`) → Save → **no question**, the sheet closes, toast "Changes saved.", the header title is the new name. Change the case only (`strength CHECK`) → saves fine (your own name). Rename back to `Strength test`. (BR-REC-61)
- [ ] **5.4** [N] Rename to another assessment's name (`fitness test`) → "That name is already used. Pick a different name." under Name; the sheet stays open; no toast. 1 and 41 characters give "Use 2 to 40 characters" as in Add.
- [ ] **5.5** [G] **The repeat question.** Change `6` to `8` (Weeks), tap Save → the **same sheet** (title still "Edit assessment") now shows **"Change the repeat?"** and **"This changes due dates for all members."** with **Cancel** and **Change repeat**; the form is hidden. No second sheet or second dark layer on top. (BR-REC-70, 133)
- [ ] **5.6** [G] Changing only the unit (Weeks → Months, number unchanged) also asks. Changing only the name or only the On switch asks nothing (5.3, 8.4). (BR-REC-70)
- [ ] **5.7** [G] **Cancel keeps typed values.** In the form type a new Name (`Strength test 2`) **and** repeat `8`, Save → question → **Cancel** → back on the form with **both** typed values still there and keyboard focus on **Save** (screen reader says "Save"). Nothing saved: `db -c "select name, interval_count from assessment_types where name like 'Strength%'"` still shows the old values. (BR-REC-70)
- [ ] **5.8** [G] Save again → question → **Change repeat** → "Saving…" with a spinner and **both** buttons off while it runs (Slow 3G) → the sheet closes, toast "Changes saved.", the detail shows "Repeat every 8 weeks", the list row "Every 8 weeks"; the same after a reload; DB shows `8 | week` and the new name. Rename back to `Strength test` and repeat to `6 weeks` (asks again, confirm). (BR-REC-70, 72)
- [ ] **5.9** [N] **A double tap does not confirm.** Network tab open. Change the repeat, then tap/click **Save twice very quickly** (do it 5 times; also press Enter twice quickly in the Repeat number field) → the question appears and **stays**; **no** `PATCH` request goes out. Wait a second, tap **Change repeat** once → exactly one `PATCH`. (BR-REC-70)
- [ ] **5.10** [G] **Back closes the sheet once.** Open the list, tap Strength test (detail), tap **Edit**, change the repeat, Save → question. Press Back (browser Back / Android Back / iOS edge swipe) → the **whole sheet** closes (not just the question), you are still on the **detail** page, nothing saved. Press Back once more → the list. Repeat with swipe down (phone), the X and Esc (desktop): each closes the whole sheet. Repeat at the form step (no question yet): Back closes the sheet once. Repeat after a Cancel at the question: still one Back closes it. (BR-REC-70, 138)
- [ ] **5.11** [N] **Name taken at the confirm step.** Change the repeat **and** set Name to `fitness test` → Save → question → **Change repeat** → the sheet goes back to the **form** with "That name is already used. Pick a different name." under Name and your typed values kept; nothing saved. Fix the name → Save → question → Change repeat → saved. (BR-REC-61, 70)
- [ ] **5.12** [API] The repeat is live at once: right after the confirm in 5.8 (before you restore the old value) `curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100" | jq '.data[] | select(.name=="Strength test") | {intervalCount, intervalUnit}'` shows the new value. (BR-REC-70)
- [ ] **5.13** [G] Cancel closes the sheet and saves nothing. `[note]` After Cancel/Esc with half-typed values, reopening Edit should show the saved values; the spec is silent, tell the owner if it keeps the half-typed ones.

## 6. Measurement sheet: adding (BR-REC-10, 62, 63, 64, 65, 69, C3, C12)

Use **Strength test** (empty) for the adds below unless said otherwise.

- [ ] **6.1** [G] Tap **Add measurement**. One column in this order: **Name \***, **Kind \*** (chips **Number / Time**), **Unit**, **Decimals** (chips **0 / 1 / 2**), **Better** (chips **Higher / Lower / No direction**), **Please check below** and **Please check above** (with "A result outside this range gets a second look."), **Repeat every** (chips **Same as assessment / Own repeat**), **Report table** (chips **None / In a group**), **Cancel / Save**. **No On switch** (a new measurement is always On). Bottom sheet on phone and 800 px, dialog from 1024 px. (C12, BR-REC-134, 138)
- [ ] **6.2** [N] Name empty, 1, 41 characters, only spaces → "Use 2 to 40 characters"; Save with a problem jumps to the first problem field. (BR-REC-62)
- [ ] **6.3** [N] Unit with 13 characters → "Use at most 12 characters"; 12 characters or empty are fine. (BR-REC-62)
- [ ] **6.4** [N] Number range: below `50`, above `10` → "Below must be smaller than above"; below `10`, above `10` → same; only one side filled, or negative numbers (`-30`) → fine. (BR-REC-62)
- [ ] **6.5** [G] **Burpees example.** Name `Burpees 1 min`, Kind **Number**, Unit `reps`, Decimals **0**, Better **Higher** → Save → toast "Measurement added." and the new row is **last**: "reps · Higher is better", no Off badge. `db -c "select name, unit, datatype, decimals, better, is_active, sort_order from metrics where name = 'Burpees 1 min'"` → `reps | number | 0 | higher | t | 1`. (BR-REC-10, C7)
- [ ] **6.6** [G] **Units are labels only** (BR-REC-69): add `Sled push`, Number, Unit `lb`, Higher → row "lb · Higher is better"; the DB unit is `lb`; `db -c "select unit, count(*) from metrics group by 1 order by 1"` shows the other units' counts unchanged (kg count the same as before); no value anywhere changed.
- [ ] **6.7** [G] **No direction** (BR-REC-63): add `Reach`, Number, Unit `cm`, Better **No direction** → row "cm · No direction".
- [ ] **6.8** [G] **Time fields** (BR-REC-62, C3): add `Row 500m`, tap **Time**. **Unit and Decimals disappear**, replaced by the line "Time is always shown as min:sec."; the check range becomes **minutes and seconds boxes** with the line "A result outside this range gets a second look. Use minutes and seconds." Better **Lower**, below `1` min `30` sec, above `20` min `0` sec → Save → row "min:sec · Lower is better". `db -c "select datatype, unit, decimals, plausible_min, plausible_max from metrics where name = 'Row 500m'"` → `duration | min:sec | 0 | 90.000 | 1200.000` (seconds). (BR-REC-62, 153, C3)
- [ ] **6.9** [N] Time range: below `10` min, above `5` min → "Below must be smaller than above"; equal values → same. A Time measurement with the range boxes empty saves fine.
- [ ] **6.10** [G] **Switching Kind empties unit and range.** New sheet: Number, Unit `kg`, below `5`, above `10` → tap **Time** → no unit shown, range boxes empty; tap **Number** again → Unit and range are empty (not brought back). Cancel.
- [ ] **6.11** [G] **Own repeat.** New sheet, **Own repeat** → shows **Own repeat number \*** and chips **Weeks / Months**; the number empty, `0`, `25` → "Use 1 to 24". Name `Plank hold`, Number, `3` + **Months** → Save: **no question is asked when adding**; the row has an extra line "Repeat every 3 months". DB `interval_count | interval_unit` = `3 | month`. Choosing **Same as assessment** hides the number again. (BR-REC-14, 70)
- [ ] **6.12** [N] **Report table.** **In a group** shows **Group \*** ("For example Skeletal muscle %.") and **Part \*** chips **Whole body / Arms / Trunk / Legs**. Group `Test group %` and no part → Save → "Set both the report group and part, or neither", focus jumps to the problem; Group `A` → "Use 2 to 40 characters". Group `Test group %` + **Legs** → saves; DB `table_group = 'Test group %'`, `table_part = 'legs'`. A new sheet left on **None** stores both empty. (BR-REC-65, 62)
- [ ] **6.13** [N] Name taken in the **same** assessment: add `weight` to **Body composition** → "That name is already used. Pick a different name." under Name, the sheet stays open. Add `Weight` to **Strength test** → saves (another assessment is fine). (BR-REC-62, C2)
- [ ] **6.14** [N] One tap, one try: add `Tap test` (Number) with Slow 3G and a quick double-tap on Save → "Saving…", one `POST /api/assessment-types/<id>/metrics`, one new row, no "That name is already used" afterwards. (BR-REC-129)
- [ ] **6.15** [G] Cancel / X / Esc / swipe down / Back each close the sheet once, nothing is saved; a new **Add measurement** opens empty.

## 7. A measurement with results (BR-REC-11, 64, 70, 71, C3, C4, C9)

- [ ] **7.0** Run the three `give_result` lines from "How to get a measurement with results" in section 0, then reload the Settings pages. (Weight, Deadlift, Fran now have results; Height, Push-ups, Squats in 1 min and the ones you added do not.)
- [ ] **7.1** [G] **Locked kind and unit.** Fitness test → **Deadlift**: **Kind is plain text** ("Number"), not chips, with the note "Kind and unit are locked because this measurement already has results."; **Unit** is a greyed field showing `kg` that you cannot change. Name, Decimals, Better, Please check, Repeat, Report table and On stay editable. Compare **Push-ups** (no results): Kind chips and Unit are editable. (BR-REC-11)
- [ ] **7.2** [G] Fitness test → **Fran** (Time with results): Kind is plain text with the same note; the unit part shows "Time is always shown as min:sec."; the range boxes show `1` min `30` sec and `30` min `0` sec. (BR-REC-11, C3)
- [ ] **7.3** [G] **Rename is safe.** Deadlift → `Deadlift (barbell)` → Save: toast (expected "Changes saved."), the row is renamed, no question. `db -c "select x.name, v.value from measurements v join metrics x on x.id = v.metric_id where x.type_id = (select id from assessment_types where name = 'Fitness test')"` → the result `100.000` is still there under the new name. Rename back. (BR-REC-11)
- [ ] **7.4** [G] **Decimals later only changes how values are shown.** Deadlift Decimals **1 → 2** → Save (no question). The stored result is still `100.000` (same query). Set Decimals back to **1**. (BR-REC-64, C9)
- [ ] **7.5** [API] The server agrees: `ID=$(curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100" | jq -r '.data[].metrics[] | select(.name=="Deadlift") | .id')` then `curl -si -b jar.txt -X PATCH $APP/api/metrics/$ID -H "$O" -H "$J" -d '{"unit":"lb"}' | head -1` → 409 and body `code: METRIC_LOCKED`; with `{"unit":"kg"}` → 200 (the stored value again is fine); with `{"name":"Deadlift"}` → 200. (BR-REC-11, C4)
- [ ] **7.6** [N] **A lock arrives from another device.** Open **Squats in 1 min** (no results: Kind chips and Unit editable) and leave the sheet open. In the terminal: `give_result "Fitness test" "Squats in 1 min" 40 2026-09-15`. In the open sheet change Unit `reps` → `count` → Save → a toast with a plain sentence (no `METRIC_LOCKED`, no code), nothing saved, the catalog is read again; close and reopen the sheet → Kind and Unit are now locked and the unit is still `reps`. (BR-REC-11)
- [ ] **7.7** [G] **The "better" question.** Body composition → **Weight** (has results): Better **Lower → Higher** → Save → the **same sheet** shows **"Change which is better?"** and **"Best results and leaderboards will change for past results."** with **Cancel** and **Change it**; the form is hidden, not cleared. (BR-REC-71, 133)
- [ ] **7.8** [G] **Cancel keeps typed values.** Before Save also type a new Name (`Weight x`); at the question tap **Cancel** → back on the form with Better still **Higher**, the new name still typed, focus on **Save**; `db -c "select better from metrics where name = 'Weight'"` still `lower`. Save again → **Change it** → "Saving…" with both buttons off → toast; the row now says "kg · Higher is better". Change it back to **Lower** (asks again) and the name back. (BR-REC-71)
- [ ] **7.9** [N] A double tap does not confirm and Back closes the sheet once: do 5.9 and 5.10 again on this question ("Change which is better?"): quick double Save → question stays, no `PATCH`; Back at the question → whole sheet closes, you stay on the detail page, one more Back → the list. (BR-REC-71, 138)
- [ ] **7.10** [N] Name taken at the confirm step: Weight → change Better **and** set Name to `Height` → Save → question → **Change it** → back on the **form** with "That name is already used. Pick a different name." under Name, typed values kept. (BR-REC-62, 71)
- [ ] **7.11** [G] Also asks when going to **No direction** on a measurement with results (any change of Better does). Changing Better on **Push-ups** (no results) from **Higher** to **Lower** → Save → **no question**, saved; change it back. (BR-REC-71)
- [ ] **7.12** [G] **Own repeat on a measurement.** Fran → Repeat **Own repeat** `3` **Months** → Save → **"Change the repeat?" / "This changes due dates for all members."** [Cancel] [Change repeat] → confirm → toast; the Fran row gets "Repeat every 3 months". Edit again: `3` → `4` asks again; **Same as assessment** asks again and after confirming the extra line is gone; DB `interval_count`, `interval_unit` both empty again. (BR-REC-14, 70)
- [ ] **7.13** [G] **Both at once.** Weight: Better **Higher** and Own repeat `2` **Months** → Save → **one** question **"Save these changes?"** with **both** sentences ("This changes due dates for all members." and "Best results and leaderboards will change for past results."), Cancel and a confirm button. Cancel keeps everything typed; confirm saves both (row "kg · Higher is better" + "Repeat every 2 months"). Restore Better **Lower** and **Same as assessment** (each asks). (BR-REC-70, 71)
- [ ] **7.14** [G] **Nothing else asks.** Change only name, decimals, check range, report table, On switch, or Unit on a measurement **without** results → saved with no question and toast. Nothing changed → Save just closes, no `PATCH`. (BR-REC-133)
- [ ] **7.15** [G] **Only changed fields are sent.** Network tab, rename Weight only → the `PATCH /api/metrics/<id>` body is just `{"name": "..."}`; change Decimals only → just `{"decimals": ...}`. Rename back. (BR-REC-62)
- [ ] **7.16** [G] **Time without results.** `Row 500m` (6.8) → Kind chips with **Time** chosen, the Time line, range boxes `1:30` and `20:00`. Change below to `2` min `0` sec → Save → `plausible_min` = `120.000`. Switch Kind to **Number** → Unit and range are empty and Decimals chips appear → Save → row shows only "Lower is better", DB `datatype = number`, `unit` empty. Switch back to **Time** → Save → DB `duration | min:sec | 0`. (BR-REC-11, C3)

## 8. Off and On (BR-REC-66, 133, C5)

- [ ] **8.1** [G] **Measurement off.** Open `Burpees 1 min` (6.5) → **On** off → Save → no question, toast; the row **stays in the list** with a grey **Off** badge that has the word "Off". DB `is_active = f`. The sheet has an On switch when editing. (BR-REC-66)
- [ ] **8.2** [API] Hidden from entry: `curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100" | jq '[.data[].metrics[].name] | index("Burpees 1 min")'` → `null`; with `&includeInactive=true` → a number, and that measurement has `isActive: false`. (BR-REC-66, C5)
- [ ] **8.3** [G] Turn it **On** again → badge gone, same place in the list.
- [ ] **8.4** [G] **Assessment off.** Strength test → **Edit** → On off → Save → **no question**, toast "Changes saved."; the list row has an **Off** badge, still in setup order; the detail header has the **Off** badge and "This assessment is off. It is hidden from new entries and Home; results stay."; its measurements are still listed and keep **their own** state (the one you turned off in 8.1 still shows Off, the others none). (BR-REC-66, C5)
- [ ] **8.5** [API] With Strength test off, the default catalog (as 8.2) has no "Strength test" and none of its measurements; with `includeInactive=true` it is there with `isActive: false` and each measurement keeps its own `isActive`. (BR-REC-66, C5)
- [ ] **8.6** [G] Turn Strength test **On** again → measurements are exactly as before (the one turned off earlier is still Off). (C5)
- [ ] **8.7** [N] Off names still count: with Strength test **off**, **Add assessment** `strength test` → "That name is already used. Pick a different name."; an off measurement's name is also refused when adding in the same assessment. (BR-REC-61, 62)
- [ ] **8.8** [G] Results stay: turn **Fitness test** off, `db -c "select count(*) from measurements"` → still 4 (the three from section 7 plus the one from 7.6); turn it **On** again. (BR-REC-66)
- [ ] **8.9** [G] **Nothing is deleted**: no Delete button or menu on any screen or sheet in S14, S15, S16; "Off" is the only way out. (BR-REC-66)

## 9. Move up / Move down (BR-REC-67, 122)

- [ ] **9.1** [G] List (Body composition, Fitness test, Strength test): the buttons are spoken "Move up, Fitness test" etc.; **Move up** is off on the first row and **Move down** on the last. Buttons are 44 x 44 px with 8 px between them.
- [ ] **9.2** [G] Tap **Move down** on the first row → the new order shows **at once**, no waiting; reload → it stays. `db -c "select name, sort_order from assessment_types order by sort_order"` → numbers 1, 2, 3 in the shown order. The tap did not open the row.
- [ ] **9.3** [G] **Two quick taps both count.** Make Body composition first, then tap **Move down** on the first row and straight away **Move down** on the second row (the same assessment, now second) → it ends **third**; after a reload still third; the Network tab shows two `PUT /api/assessment-types/order` calls.
- [ ] **9.4** [N] **A failed save puts the old order back.** Load the list, stop the backend (Ctrl+C in its terminal), tap **Move down** → the order changes at once, then returns to the old order with a toast saying something went wrong (screens: "Something went wrong on our side. Please try again."; another plain sentence is fine, never a code). Restart the backend; the DB order is unchanged.
- [ ] **9.5** [G] Fitness test → move **Fran** up twice so it is above **5K run** → at once, kept after reload; `db -c "select name, sort_order from metrics where type_id = (select id from assessment_types where name = 'Fitness test') order by sort_order"` → 1…n with no gaps, Fran above 5K run. The first row has Move up off and the last Move down off. (BR-REC-67)
- [ ] **9.6** [G] Off rows can be moved too (an Off measurement or assessment) and keep their Off badge. Restore your orders afterwards.
- [ ] **9.7** [API] The default catalog shows the same order: `curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100" | jq '[.data[].name]'`. (BR-REC-67)

## 10. Reminders & gym S16 `/admin/settings/general` (BR-REC-60, C1, C13, 129, 131)

- [ ] **10.1** [G] Header: back arrow → Settings, title "Reminders & gym", main action **Save** (header from 1024 px; phone: a bar at the bottom edge with the tab bar hidden). Section **Gym**: **Gym name \*** ("Printed on report cards.") `Fionis CrossFit`, **Time zone** (the phone's own picker, "Decides what "today" means.") `Asia/Kolkata`. Section **Reminders**: **Due soon \*** `7` ("An assessment shows as Due soon this many days before its date."), **Ends soon \*** `14` ("A membership shows as Ends soon this many days before it ends."). 720 px wide at 1920 px. No Reset button. (BR-REC-60, 134, 139)
- [ ] **10.2** [N] Gym name empty, 1 character, 61 characters → "Use 2 to 60 characters" when you leave the field and on Save; 2 and 60 characters pass. (C1)
- [ ] **10.3** [N] Due soon `45` → "Use 0 to 30 days" (the spec example); `31` and `-1` fail; `0` and `30` pass; `7.5` → "Use a whole number of days". (BR-REC-60)
- [ ] **10.4** [N] Ends soon `61` → "Use 0 to 60 days"; `0` and `60` pass; `7.5` → "Use a whole number of days". (BR-REC-60)
- [ ] **10.5** [N] Save with several problems (Gym name wrong **and** Due soon `45`) → focus jumps to the **first** problem field (Gym name); no `PATCH` is sent. (BR-REC-134)
- [ ] **10.6** [G] Time zone: the picker lists every time zone name (Asia/Kolkata, Europe/London, UTC …); pick `Europe/London`.
- [ ] **10.7** [G] Save with Gym name `  Fionis Test  ` (spaces around), Due soon `10`, Time zone `Europe/London` → the button reads "Saving…" while it runs (Slow 3G) → toast "Settings saved."; the Network `PATCH /api/settings` body holds **only the three changed fields** (not Ends soon). Reopen the screen: `Fionis Test` (spaces gone), `10`, `Europe/London`, Ends soon still `14`. `db -c "select * from gym_settings"` agrees. (BR-REC-60, C1)
- [ ] **10.8** [G] Save again with nothing changed → still "Settings saved.". Put the defaults back (`Fionis CrossFit`, `Asia/Kolkata`, `7`, `14`) and Save.
- [ ] **10.9** [G] Loading: "Slow 3G", reload → grey shapes for four fields. Load error: block `*settings*`, reload → "Couldn't load this." + **Try again** and **no Save button** until it loads; unblock → Try again → the form and Save appear. (BR-REC-129, 131)
- [ ] **10.10** [API] The server refuses bad values: `curl -si -b jar.txt -X PATCH $APP/api/settings -H "$O" -H "$J" -d '{"timezone":"Mars/Olympus"}' | head -1` → 400 (`VALIDATION_ERROR`); `{"upcomingLeadDays":45}` → 400 "Use 0 to 30 days"; `{"timezone":"Asia/Kolkata"}` → 200. The DB row is unchanged after the refused ones. (BR-REC-60, C1)
- [ ] **10.11** [G] **Opening never writes** (C13): `db -c "delete from gym_settings"`, reload `/admin/settings/general` → the form shows `Fionis CrossFit`, `Asia/Kolkata`, `7`, `14`; `db -c "select count(*) from gym_settings"` → **0**. Change Due soon to `8` and Save → count **1**, and `db -c "select count(*) from audit_log where action = 'settings.update'"` is one higher than before this Save (the first Save creates the row and its change-log row). Put `7` back. (BR-REC-60, C13)

## 11. Another device sees the change on its next open (BR-REC-72, 160)

Two devices signed in: **A** and **B**.

- [ ] **11.1** [G] B opens **Assessment setup** (note the rows). A adds an assessment `Mobility` (3.1…3.5 style). B leaves the screen (Settings tab) and opens **Assessments** again → `Mobility` is there with no manual reload and no sign-out. (BR-REC-72)
- [ ] **11.2** [G] Network tab on B (filter `assessment-types`): reopen the list with nothing changed → the request is answered **304** and the list shows at once; after a change made on A → the next open answers **200** with the new data. (BR-REC-72)
- [ ] **11.3** [API] `curl -si -b jar.txt "$APP/api/assessment-types?pageSize=100" | grep -i '^etag\|^HTTP'` → 200 and an `ETag`; the same with `-H 'If-None-Match: <that etag>'` → 304 with no body; after any save in the app the old tag answers 200 with a new tag. Same for `$APP/api/settings`. (BR-REC-72, 160)
- [ ] **11.4** [G] A adds the measurement `Burpees 2 min` to Fitness test; B opens that assessment from the list → the row is there. A turns a measurement off → B's next open shows its **Off** badge. A renames an assessment → B's next open shows the new name. (BR-REC-72)
- [ ] **11.5** [G] A changes **Due soon** to `9` on Reminders & gym → B reopens that screen → `9`. Put it back to `7`. (BR-REC-72)
- [ ] **11.6** [note] A screen B already has open does not have to change by itself ("the next time it opens"); if it does, fine.
- [ ] **11.7** [G] Repeat 11.1 with a real phone as B and the desktop as A (and the other way round).

## 12. Seed twice, change log (BR-REC-68; C10)

- [ ] **12.1** [G] Rename **Hang time** to `Hang time test` in the app (Fitness test). Terminal: `cd backend && bun run seed` → printed `typesCreated: 0, metricsCreated: 0, settingsCreated: false`. Reload → the name is still `Hang time test` and there is **no second** "Hang time"; `db -c "select count(*) from assessment_types"` and `... from metrics` are unchanged. Rename back. (BR-REC-68)
- [ ] **12.2** [G] After the walk-through: `db -c "select action, session_id, before, after from audit_log where action ~ '^(settings|assessment_type|metric)\.' order by id"` → `settings.update` for each Reminders & gym save, `assessment_type.create` / `.update` / `.reorder`, `metric.create` / `.update` / `.reorder` (turning On/Off is `.update`); `before` / `after` hold only the changed fields; `session_id` equals the signed-in login's session (`db -c "select id from auth_sessions where revoked_at is null"`); there is **no row** for the refused saves (name already used, bad values) or for the 304 reads. (BR-REC-158 via C10)

## 13. Look, feel, words, access (ux BR-REC-120…140, on S14, S15, S16 and their sheets)

- [ ] **13.1** [G] Words (BR-REC-126, 128): read every label, hint, error, toast and spoken name on all five screens and the sheets. Allowed: Assessment, Measurement, Number / Time (min:sec), Higher is better / Lower is better / No direction, Repeat every, Due soon, Ends soon, Please check, Turn off, Off. Not allowed: "metric", "datatype", "interval", "duration", "deactivate", "type", status numbers, codes in capitals (`NAME_TAKEN`, `METRIC_LOCKED`, `VALIDATION_ERROR`). Every server refusal you caused above showed one plain sentence next to the field or as a short toast.
- [ ] **13.2** [G] **Phone 360 px**: no sideways scroll on the hub, list, detail, S16 and in every sheet and question (Add / Edit assessment, measurement sheet, both questions). Add an assessment and a measurement named `abcdefghijabcdefghijabcdefghijabcdefghij` (40 characters, no spaces) → the row wraps or cuts the text, the **Move up / Move down** buttons stay visible and 44 px, the Off badge is not squeezed out, and a long page title does not push **Edit** off the screen. (BR-REC-139, 122)
- [ ] **13.3** [G] **Tablet 800 px portrait**: bottom tab bar, sheets are bottom sheets, **Add assessment** in the bar above the tabs. **Tablet 1180 px landscape / Desktop 1280 px**: side bar, dialogs centred, **Add assessment** / **Add measurement** / **Save** (S16) at the right of the header. (BR-REC-120, 121, 138)
- [ ] **13.4** [G] **Desktop 1920 px**: hub and S16 at most 720 px wide, centred; the S15 list and detail at most 1080 px, centred (never edge to edge). (BR-REC-139)
- [ ] **13.5** [G] One main action per screen: hub none; S15 list **Add assessment**; S15 detail **Add measurement** (**Edit** is a small header control, not a second big button); S16 **Save**; in a sheet **Save** is the strong button, **Cancel** is quiet. Never two strong buttons in view. (BR-REC-121)
- [ ] **13.6** [G] The tab bar is hidden while a form or sheet is open (S16 and every sheet). On a real phone focus **Gym name** and **Name** in a sheet: the keyboard opens, the field stays visible and **Save** can still be reached. (BR-REC-120, 134)
- [ ] **13.7** [G] **44 px targets** (DevTools: select the element, the box in the Computed tab, or hover it; also thumb-test on a real phone): Move up / Move down, every chip (Weeks / Months, Number / Time, 0 / 1 / 2, Higher / Lower / No direction, Same as assessment / Own repeat, None / In a group, Whole body / Arms / Trunk / Legs), the **On** switch row, Cancel / Save / Change repeat / Change it, the sheet's X, the theme chips. At least 44 x 44 px (a chip drawn smaller still has a 44 px hit area), 8 px between neighbours; list rows at least 56 px; inputs and buttons 48 px tall. (BR-REC-122)
- [ ] **13.8** [G] Text: inputs 16 px (a real iPhone does **not** zoom when you focus Name, Unit, the number fields, Gym name, Due soon or the time zone picker); hints and second lines 14 px; nothing below 12 px. (BR-REC-123)
- [ ] **13.9** [G] **Dark theme** (hub → Dark): walk the hub, list and detail (with Off badges), both assessment sheets, the measurement sheet (locked and unlocked), the three questions, the toasts and S16 with errors. Everything readable; the dimmed Move button and the greyed locked Unit look off but can still be read; the Off badge is grey **with the word**. Run axe (browser extension) on the hub, list, detail (once with the measurement sheet open) and S16 in **light and dark** → 0 contrast issues, 0 serious. (BR-REC-124, 136)
- [ ] **13.10** [G] Grey-scale (DevTools → Rendering → "Emulate vision deficiency: achromatopsia"): Off badge, error lines, the chosen chip and the locked field are still obvious without colour. (BR-REC-125)
- [ ] **13.11** [G] **200 % text zoom**: desktop browser zoom 200 %, and on a phone the largest text size / Display Zoom. Hub, list, detail, S16, every sheet and every question: no sideways scrolling, no clipped text, the sheet scrolls inside itself and **Cancel / Save / Change repeat / Change it** can still be reached; the S16 **Save** bar does not cover a field. (BR-REC-137)
- [ ] **13.12** [G] Keyboard only (Desktop): Tab reaches every control in a sensible order, the focus ring is always visible (rows, Move buttons, chips, switch, sheet buttons); Enter opens a row; Space or Enter picks a chip and flips the switch; **Esc** closes the sheet and, at a question, the **whole** sheet; focus goes back to the control that opened the sheet; Tab does not leave the open dialog. (BR-REC-137)
- [ ] **13.13** [G] **Screen reader** — VoiceOver (iPhone Safari), TalkBack (Android Chrome), and NVDA or VoiceOver on Desktop. Check: hub rows read name + second line, theme chips read name and chosen / not chosen; list rows read the name and "Every 2 months", the Off badge reads "Off"; the buttons read **"Move up, Fitness test"** / **"Move down, Fitness test"** and the off ones read as dimmed or unavailable; every sheet field reads its label, its hint and — after a failed Save — its error ("Name, Use 2 to 40 characters"); chips read which one is chosen; the **On** switch reads label, state and its hint; the locked Kind note and the greyed Unit are read; the sheet X has a spoken name. (BR-REC-137, 134, 122)
- [ ] **13.14** [G] **The alert question is read out.** Screen reader on, Edit assessment, change the repeat, Save → **"Change the repeat? This changes due dates for all members."** is spoken as soon as the question appears, without you moving focus, and once. Same for **"Change which is better? Best results and leaderboards will change for past results."** (7.7) and **"Save these changes?"** with both sentences (7.13). After **Cancel**, focus is on Save and the form is read normally. (BR-REC-137, 70, 71)
- [ ] **13.15** [G] Toasts are announced when they show: "Changes saved.", "Assessment added.", "Measurement added.", "Settings saved.", and the failure toasts of 7.6 and 9.4. (BR-REC-137)
- [ ] **13.16** [note] After **Move up / Move down** the spec does not say what is announced; tell the owner what you hear (silence is acceptable).
- [ ] **13.17** [G] Reduce motion on in the system → sheets and toasts appear without sliding. (BR-REC-137)
- [ ] **13.18** [G] Offline (DevTools → Offline) on S16 and inside a sheet: within 2 s a thin banner says "You're offline — changes can't be saved right now"; typed values stay; it goes away on reconnect. (BR-REC-132)
- [ ] **13.19** [G] Every list or screen that has a loading, empty or error state showed the right one (2.4…2.6, 4.5, 4.6, 10.9): grey shapes in the real layout, one plain sentence, "Couldn't load this." + **Try again** only in its own place. (BR-REC-129, 130, 131)

## 14. Later — when the other streams are merged `[later]`

- [ ] **14.1** [later: assessments] The entry form lists `Burpees 1 min` once added (BR-REC-10); an Off measurement and every measurement of an Off assessment are not offered (BR-REC-66); the order is the one set in section 9 (BR-REC-67); typing `95.56` into Weight (Decimals 1) stores `95.6`, and changing Weight's Decimals to 2 later shows old values with two decimals while the stored values stay (BR-REC-64); a unit `lb` is shown as typed with no maths (BR-REC-69).
- [ ] **14.2** [later: due list] Fitness test `2 → 3 months` (5.5…5.8): Home / due list move members out of Overdue **at once** (BR-REC-70); Fran with an own repeat of 3 months inside the 2-month assessment is due on its own date (BR-REC-14); Fitness test Off → no fitness rows on Home (BR-REC-66).
- [ ] **14.3** [later: progress] The report card still shows Fran after Fran is turned Off (BR-REC-66); `Skeletal muscle %` + **Arms** appears as row Arms, column Skeletal muscle % (BR-REC-65); Height (No direction) shows a change such as +1 cm with no "better" word, no best and no leaderboard (BR-REC-63).
- [ ] **14.4** [later: assessments] Another device's entry form shows `Burpees 1 min` the next time it opens (BR-REC-72).

## Coverage

| BR | Section(s) | BR | Section(s) | BR | Section(s) |
|---|---|---|---|---|---|
| 10 | 2, 3, 4, 6, 14 | 11 | 7, 8 | 13 | 2, 3, 4, 5 |
| 14 | 6, 7, 14 | 60 | 10 | 61 | 3, 5, 8 |
| 62 | 6, 7, 8 | 63 | 4, 6, 14 | 64 | 7, 14 |
| 65 | 4, 6, 14 | 66 | 8, 14 | 67 | 9, 14 |
| 68 | 2, 12 | 69 | 4, 6, 14 | 70 | 5, 6, 7, 14 |
| 71 | 7 | 72 | 2, 11, 14 | ux 120…140 | 1, 3, 10, 13 |
| C13 (E07 never writes) | 10 | C10 (change log) | 12 | C3, C4, C5 | 6, 7, 8 |
