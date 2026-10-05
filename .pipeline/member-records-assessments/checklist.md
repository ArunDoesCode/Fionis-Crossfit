# member-records/assessments · manual test checklist

Spec: `docs/specs/member-records/assessments.md` v2 (BR-REC-12, 19…21, 73…92 + build clarifications D1…D21) + `ux.md` v1 (BR-REC-120…140 on S10, S11, their sheets and the member page's Recent block).
Written from the spec rules and the build's screen notes (URLs, words and roles only). The server rules (E25…E30: limits, upsert, race, change log) and the pure modules (number and time parsing, rounding, change line, please-check rule, paper columns, draft store, save body) have automated tests;
this list is for what no test reaches: the screens and sheets, the keypad and keyboard on a real phone, Back and history, drafts in the browser, the leave question, closing the tab, the offline banner, widths, themes, zoom and screen readers
(no DOM test library yet, #9, so every sheet and layout rule is manual).
Tags: `[G]` golden path · `[N]` negative path · `[API]` a `curl` check of the same rule · `[slow]` needs real waiting · `[note]` the spec is silent or two texts differ, tell the owner, not a fail ·
`[later: due list]` needs Stream E (due list, Home rows, E32): do it after due-list is merged, not now · `[later: progress]` needs the report card / export stream.
Time (estimate): sections 1…15 about 120 minutes on Desktop + Phone (DevTools); section 16 about 30 minutes on a real phone; section 17 about 45 minutes; section 18 when Stream E is merged.
Words: "Measurement" in the app = table `metrics`. The table called `measurements` holds the **results** (values). Do not mix them up in the SQL below.
"Today" = the device's day; the gym's own day (Reminders & gym time zone, default Asia/Kolkata) is the server's judge. Test on a computer whose clock is in the gym's zone, and not around midnight.
Every saving step uses **its own date** (given in the step) so records never collide. "**Reset**" = run `wipe_data; seed_data` (about 10 seconds).

## 0. Setup (once)

- [ ] Dev DB up and rebuilt: `cd backend && docker compose up -d && bun run db:reset` (wipes the local dev DB, pushes the schema, seeds settings, the login-lock row and the catalog; refuses a non-local host).
  The Postgres on port 5433 is shared by every worktree: if another session uses database `gym`, make your own first (`docker exec gym-postgres createdb -U postgres gym_assess_dev`), put it in `backend/.env` as `DATABASE_URL=postgres://postgres:postgres@localhost:5433/gym_assess_dev`, then run `DB_RESET_CONFIRM=gym_assess_dev bun run db:reset` (`db:reset` refuses any database name other than `gym` or `*_test` unless you repeat the name like this).
- [ ] One login, after `db:reset`: `cd backend && bun run bootstrap-admin --username owner --password Gym-pass-1`. Test login below: `owner` / `Gym-pass-1`.
- [ ] Backend `cd backend && bun run dev` (port 4000, `APP_ORIGIN=http://localhost:3000`). Frontend `cd frontend && bun run dev` (port 3000; `frontend/.env.local` has `API_URL=http://localhost:4000/api`).
- [ ] Devices: **Desktop** (Chrome, window >= 1024 px), **Phone** (a real Android phone and a real iPhone for section 16; DevTools device mode 360 px elsewhere), **Tablet** (real, or DevTools 800 px portrait and 1180 px landscape). For a real phone open `http://<laptop-ip>:3000` and put that address in `backend/.env` as `APP_ORIGINS_EXTRA=http://<laptop-ip>:3000` (else every save answers 403); restart the backend.
- [ ] Shell helpers: paste the block under this list into a terminal opened in a scratch folder (not in the repo; the cookie jar `jar.txt` lands there; zsh or bash). `db` runs SQL inside the Docker Postgres, so no local `psql` is needed; `DBNAME` must be the same database as `DATABASE_URL` in `backend/.env`. Needs `jq`.
- [ ] Sign in once as `owner` on Desktop (`/login`); `login Gym-pass-1` once for the `curl` steps. If a helper prints `UNAUTHORIZED` later, run `login Gym-pass-1` again (the terminal session lasts about 15 minutes).
- [ ] Then run `seed_data` once. Check: `rows "Surya Pratap"` → five rows (see the table). Run `curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' $APP/api/members/$(mem "Surya Pratap")/due` → **501** until the due-list stream is merged (the choose sheet then shows no status words and fields no "due" tags, and no error, D11).

```
APP=http://localhost:3000; O="Origin: $APP"; J="Content-Type: application/json"; DBNAME=gym
db() { docker exec -i gym-postgres psql -U postgres -d $DBNAME -v ON_ERROR_STOP=1 "$@"; }   # or: db() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }
login() { curl -si -c jar.txt -X POST $APP/api/auth/login -H "$O" -H "$J" -d "{\"username\":\"${2:-owner}\",\"password\":\"$1\",\"remember\":true}" | head -1; }
ago() { db -At -c "select (now() at time zone 'Asia/Kolkata')::date - $1"; }          # ago 3 = the date 3 days ago
mem() { db -At -c "select id from members where full_name = '$1'"; }                  # member id by name
tid() { curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100&includeInactive=true" | jq -r --arg t "$1" '.data[] | select(.name==$t) | .id'; }
mid() { curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100&includeInactive=true" | jq -r --arg t "$1" --arg m "$2" '.data[] | select(.name==$t) | .metrics[] | select(.name==$m) | .id'; }
new_member() {  # new_member "<name>" <yyyy-mm-dd joined on>: a member with an Annual membership that started today
  db -q -v n="$1" -v j="$2" <<'SQL'
insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on)
select :'n', '98450 ' || lpad((10000 + floor(random() * 89999))::int::text, 5, '0'), '', '1990-01-01', 'male', :'j'::date
where not exists (select 1 from members where full_name = :'n');
update members set phone_digits = regexp_replace(phone, '\D', '', 'g') where full_name = :'n';
insert into membership_periods (member_id, plan, start_on, end_on)
select m.id, 'annual', (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 364
from members m where m.full_name = :'n'
  and not exists (select 1 from membership_periods p where p.member_id = m.id);
SQL
}
rec() {  # rec "<member>" "<assessment>" <yyyy-mm-dd> <estimated true|false> "<Measurement>=<value>" ...   (Time values in seconds; "=null" removes)
  local c m t d e an kv id vals="[]"
  c="$(curl -s -b jar.txt "$APP/api/assessment-types?pageSize=100&includeInactive=true")"; m="$(mem "$1")"; an="$2"; d="$3"; e="$4"; shift 4
  t="$(jq -r --arg t "$an" '.data[] | select(.name==$t) | .id' <<<"$c")"
  for kv in "$@"; do
    id="$(jq -r --arg t "$an" --arg m "${kv%%=*}" '.data[] | select(.name==$t) | .metrics[] | select(.name==$m) | .id' <<<"$c")"
    [ -n "$id" ] || { echo "no measurement ${kv%%=*} in $an"; return 1; }
    vals="$(jq -c --arg id "$id" --argjson v "${kv#*=}" '. + [{metricId:$id, value:$v}]' <<<"$vals")"
  done
  curl -s -b jar.txt -X POST $APP/api/assessments -H "$O" -H "$J" -d "{\"memberId\":\"$m\",\"typeId\":\"$t\",\"date\":\"$d\",\"isEstimated\":$e,\"values\":$vals}" | jq -c '.data // .'
}
rows() {  # rows "<member>": one line per saved assessment, newest first
  db -c "select a.assessed_on as date, t.name as assessment, a.is_estimated as estimated, count(v.*) as results from assessments a join members m on m.id = a.member_id join assessment_types t on t.id = a.type_id left join measurements v on v.assessment_id = a.id where m.full_name = '$1' group by 1, 2, 3 order by 1 desc"
}
stored() {  # stored "<member>" "<assessment>" <yyyy-mm-dd>: every stored value of that assessment
  db -c "select x.name, v.value from measurements v join assessments a on a.id = v.assessment_id join metrics x on x.id = v.metric_id join assessment_types t on t.id = a.type_id join members m on m.id = a.member_id where m.full_name = '$1' and t.name = '$2' and a.assessed_on = '$3' order by x.sort_order"
}
changes() {  # the change log of assessments, newest 10
  db -c "select id, action, left(entity_id, 8) as assessment, (before is null) as no_before, (after is null) as no_after, after->>'date' as date, after->>'isEstimated' as estimated from audit_log where entity = 'assessment' order by id desc limit 10"
}
wipe_data() { db -q -c "delete from measurements; delete from assessments;"; }
seed_data() {
  new_member "Surya Pratap" 2025-06-01; new_member "Meera Nair" 2025-08-31; new_member "Lata Joshi" 2026-06-15
  new_member "Anil Archived" 2025-01-15; new_member "Bulk Binder" 2023-12-01
  db -q -c "update members set archived_at = now() where full_name = 'Anil Archived' and archived_at is null"
  rec "Surya Pratap" "Body composition" 2025-09-30 false "Height=176" "Weight=97" "Visceral fat=9"
  rec "Surya Pratap" "Body composition" 2026-03-05 false "Height=176" "Weight=95.5" "BMI=30.8" "Body fat=24" "Visceral fat=8" "Resting metabolism=1850" "Body age=41" \
    "Subcutaneous fat — whole body=22.1" "Subcutaneous fat — arms=20.5" "Subcutaneous fat — trunk=24" "Subcutaneous fat — legs=21" \
    "Skeletal muscle — whole body=36.2" "Skeletal muscle — arms=34" "Skeletal muscle — trunk=33.5" "Skeletal muscle — legs=38"
  rec "Surya Pratap" "Body composition" "$(ago 3)" false "Height=176.5"
  rec "Surya Pratap" "Fitness test" 2025-12-01 true "Push-ups=25" "Plank=100" "Fran=270"
  rec "Surya Pratap" "Fitness test" 2026-08-10 false "Push-ups=30" "Hang time=95" "Pull-ups=5" "Squats in 1 min=40" "Plank=110" "Deadlift=100" "Back squat=90" \
    "Chest press=60" "Shoulder press=40" "Flexibility=-5" "5K run=1800" "Filthy 50=1500" "Fran=245" "CrossFit total=290"
  rec "Anil Archived" "Body composition" 2025-02-10 false "Weight=80" "Body fat=22"
  db -q <<'SQL'
insert into assessments (member_id, type_id, assessed_on)
select m.id, t.id, d::date from members m
join assessment_types t on t.name = 'Body composition'
cross join generate_series('2024-01-01'::date, '2024-10-17'::date, interval '10 days') d
where m.full_name = 'Bulk Binder' on conflict do nothing;
insert into assessments (member_id, type_id, assessed_on)
select m.id, t.id, v.d from members m
join assessment_types t on t.name = 'Fitness test'
cross join (values ('2025-01-01'::date), ('2025-02-01'::date), ('2025-03-01'::date)) v(d)
where m.full_name = 'Bulk Binder' on conflict do nothing;
insert into measurements (assessment_id, metric_id, member_id, measured_on, value)
select a.id, x.id, a.member_id, a.assessed_on, case x.name when 'Body fat' then 20 else 90 end
from assessments a
join members m on m.id = a.member_id and m.full_name = 'Bulk Binder'
join metrics x on x.type_id = a.type_id and x.name in ('Weight', 'Body fat', 'Plank')
on conflict do nothing;
SQL
}
```
`seed_data` makes five members and saves most results through the real save endpoint (E26), so it is safe to run again after `wipe_data`. Members come with an Annual membership that started today (so Home and the due list include them).
| Member | Joined | Holds |
|---|---|---|
| **Surya Pratap** | 1 Jun 2025 | Body composition: 30 Sep 2025 (3 results: Height 176, Weight 97, Visceral fat 9) · 5 Mar 2026 (all 15: Height 176, Weight 95.5, BMI 30.8, Body fat 24, Visceral fat 8, Resting metabolism 1850, Body age 41, sub-fat 22.1 / 20.5 / 24 / 21, muscle 36.2 / 34 / 33.5 / 38) · 3 days ago (1: Height 176.5). Fitness test: ≈ Dec 2025, estimated (3: Push-ups 25, Plank 1:40, Fran 4:30) · 10 Aug 2026 (all 14, among them Push-ups 30, Plank 1:50, Fran 4:05, Flexibility −5) |
| **Meera Nair** | 31 Aug 2025 | nothing yet: month-end paper columns, a date before joining, the binder entry |
| **Lata Joshi** | 15 Jun 2026 | nothing: paper columns that land in the future, the empty states |
| **Anil Archived** | 15 Jan 2025 | archived; Body composition 10 Feb 2025 (2: Weight 80, Body fat 22) |
| **Bulk Binder** | 1 Dec 2023 | paging: 30 Body composition (every 10 days from 1 Jan 2024, 2 results each) + 3 Fitness test (1 Jan, 1 Feb, 1 Mar 2025, 1 result each) |

Seeded measurement facts used below: Weight kg, 1 decimal, Lower is better, check range 30 to 250 · Height cm, No direction, 120 to 220 · Visceral fat level, Lower, 1 to 30 · Resting metabolism kcal, 0 decimals, Higher · Push-ups reps, Higher, 0 to 200 · Flexibility cm, check range −30 to 60 · Plank, Hang time Higher, 0 to 15:00 · Fran Lower, 1:30 to 30:00 · Time fields: Hang time, Plank, 5K run, Filthy 50, Fran.
Find a member in the app with Members → search "Surya". Today in the text below is written as **today**; dates like "5 Mar" drop the year when it is this year (BR-REC-127).

## 1. Choose assessment (BR-REC-73, 84, 138; D4, D11, D12)

- [ ] **1.1** [G] Phone: Members → Surya Pratap → tap **Record assessment** (the member page's main action) → address `/admin/members/<id>/assess`. For a moment grey form shapes show (the choose screen's code loads when needed), then header "Record assessment" with "Surya Pratap", an empty box "Pick an assessment to record." with **Choose assessment**, and the sheet **"Record for Surya"** opens by itself: bottom sheet on a phone, centred dialog from 1024 px. Rows **Body composition**, **Fitness test** in setup order; no status words and no error text (E32 answers 501, D11). The tab bar is hidden. (BR-REC-73, 120, 138)
- [ ] **1.2** [G] Close the sheet without choosing: X, Esc (desktop), swipe down (phone), Back (browser Back / Android Back / iOS edge swipe). Each closes the sheet once and leaves the empty box on the page (the first Back must not leave the page). **Choose assessment** opens it again. (BR-REC-138)
- [ ] **1.3** [G] Tap **Body composition** → the form; the address now has `?type=<id>`; Date is today. Browser Back → the **member page** (not the sheet, not the empty box): "back to where the entry started". (BR-REC-84, D12)
- [ ] **1.4** [G] Open the form straight from the address (new tab): `echo "$APP/admin/members/$(mem "Surya Pratap")/assess?type=$(tid "Body composition")"` → the form for Body composition, Date today, no sheet. Add `&date=2026-03-05` → the form opens on 5 Mar 2026 (section 8). (BR-REC-73, D11)
- [ ] **1.5** [N] Only turned-on assessments: Settings → Assessments → Fitness test → Edit → On off → Save. Record for Surya now lists **only Body composition**. Turn Body composition off too → the sheet says **"No assessments are turned on. Turn one on in Settings."** Turn both on again. (D4, D11)
- [ ] **1.6** [N] A turned-off assessment's history stays editable (D4): turn Fitness test off again; open `…/assess?type=<Fitness id>&date=2026-08-10` (use `tid "Fitness test"`) → the saved assessment opens with its 14 values and can be edited; the same address with `date=2026-09-01` → **"This assessment has no measurements turned on."** (no fields). Turn Fitness test On again.
- [ ] **1.7** [N] Unknown member: `/admin/members/00000000-0000-0000-0000-000000000000/assess` → "We couldn't find that. It may have been removed." with no Try again. On a real member add `?type=00000000-0000-0000-0000-000000000000` → the same sentence.
- [ ] **1.8** [N] Failed load: DevTools → Network → "Block request URL" `*assessment-types*`, open Record assessment → inside the sheet "Couldn't load this." with **Try again**; unblock, tap it → the rows appear. (BR-REC-131)
- [ ] **1.9** [note] `…/assess?type=abc` (not an id): the spec is silent. Tell the owner what shows (anything but a blank page or a crash is acceptable).

## 2. The form S10: layout, loading, fields (BR-REC-73, 20, 120, 121, 129, 134, 139; D4)

- [ ] **2.1** [G] Phone, Surya → Record assessment → Body composition. Header: back arrow (spoken "Back"), title "Body composition", second line "Surya Pratap". Date = today, **About** unticked, chips **Q1 Q2 Q3 Q4** ("Paper column"). **15 fields** in setup order: Height, Weight, BMI, Body fat, Visceral fat, Resting metabolism, Body age, Subcutaneous fat — whole body / arms / trunk / legs, Skeletal muscle — whole body / arms / trunk / legs. Label above each field, unit inside the box at the right (BMI has none). On the bottom edge **Save & next date** (quiet) and **Save** (strong); the tab bar is hidden; no Reset button. (BR-REC-73, 120, 121, 134)
- [ ] **2.2** [G] Hard reload (Cmd+Shift+R) with Network "Slow 3G": grey form shapes in the real layout first (same places as the fields), no full-page spinner, then the form with Date = today. The DevTools console shows **no red errors** (no hydration warning) while you open the form, now and in later sections. (BR-REC-129)
- [ ] **2.3** [G] Fitness test form: **14 fields**; the five Time ones (Hang time, Plank, 5K run, Filthy 50, Fran) show **two small boxes, minutes and seconds**, the others a single box with the unit inside. Flexibility has a **±** button inside at the left; Weight has none. (BR-REC-75, D17)
- [ ] **2.4** [G] Desktop >= 1024 px: the form is at most 720 px wide and centred even at 1920 px; each row reads label · input · last value · change on one line; **Save & next date** and **Save** sit at the right of the header (no bar at the bottom). The side bar is there. (BR-REC-121, 139)
- [ ] **2.5** [N] No measurements: Settings → Assessments → **Add assessment** `Strength test` (Repeat 6 weeks) → Save. Record assessment → pick it → **"This assessment has no measurements turned on."**, no fields.
- [ ] **2.6** [G] Off measurement: Settings → Body composition → **BMI** → On off → Save. Today's Body composition form has **14 fields, no BMI**. Open `…/assess?type=<Body composition id>&date=2026-03-05` (a saved assessment that holds a BMI value) → **BMI is shown with 30.8** (an old record stays editable). Turn BMI On again. (D4)

## 3. Number fields (BR-REC-76, 77; D3, D17)

Use Surya, Body composition, Date **1 Sep 2026** (type the date or `…&date=2026-09-01`).

- [ ] **3.1** [G] Type Weight `94,56` (comma), Body fat `23,5`, Resting metabolism `1860.5`, Body age `40,4` → leave each box (no error) → Save → toast "Saved 4 results for Surya". `stored "Surya Pratap" "Body composition" 2026-09-01` → Weight **94.600**, Body fat **23.500**, Resting metabolism **1861.000**, Body age **40.000** (rounded to each measurement's decimals, half away from zero). `[note]` does the box text change to the rounded value when you leave it? Tell the owner. (BR-REC-76)
- [ ] **3.2** [N] Not a number: in Weight type `abc` (desktop only; a phone keypad blocks letters), then in other boxes `1e3`, `95.5.5`, `9 5`, `-`, `.` → after leaving each box the line **"Enter a number like 95.5"** shows under it; tap Save → the same line, the cursor jumps to the **first** such box, nothing is sent (Network tab stays quiet). Fix the boxes → the lines go. (BR-REC-76)
- [ ] **3.3** [N] Too big after rounding: Body age `999999999.6` → "Enter a number like 95.5". `999999999.4` is accepted (rounds to 999999999). (D3)
- [ ] **3.4** [G] Fitness test, Date `3 Sep 2026`, Flexibility: type `5`, tap **±** → `-5`; tap again → `5`; with the box empty **±** gives `-`, then `3,2` → `-3,2` → Save → `stored "Surya Pratap" "Fitness test" 2026-09-03` shows Flexibility **−3.200**. Desktop can type `-` directly. Weight and Push-ups have no **±** (their lower check limits are 30 and 0). (D17)
- [ ] **3.5** [G] Zero is a value, not blank: Meera Nair → Record assessment → Fitness test → Date `1 Sep 2026` → Push-ups `0` only → Save → "Saved 1 result for Meera"; `stored "Meera Nair" "Fitness test" 2026-09-01` → Push-ups **0.000**. (BR-REC-77)
- [ ] **3.6** [G] Only filled boxes are saved: Surya, Body composition, Date `2 Sep 2026`, type only Weight `94` → Save → "Saved 1 result for Surya"; `rows "Surya Pratap"` → that date has 1 result. (BR-REC-77)
- [ ] **3.7** **Reset.**

## 4. Time fields (BR-REC-12, 75; D3, D17)

Surya, Fitness test. Each step below uses its own date.

- [ ] **4.1** [G] Date `1 Sep 2026`: Plank minutes `2`, seconds `02` → under it "Last 1:50 · 10 Aug" and "▲ +0:12 better" → Save → `stored "Surya Pratap" "Fitness test" 2026-09-01` → Plank **122.000**. (BR-REC-12, 81)
- [ ] **4.2** [N] Seconds above 59: minutes `2`, seconds `75` → after leaving the box **"Enter seconds from 0 to 59"**; Save refuses (nothing is sent); `60` the same, `59` is fine. `[note]` the rule table's example text says "Seconds must be 0 to 59"; the later clarification D17 and the screen use "Enter seconds from 0 to 59": the box must show the latter. (BR-REC-75, D17)
- [ ] **4.3** [N] Minutes above 599: minutes `600` → **"Enter minutes from 0 to 599"**; Save refuses. `599` with seconds `59` is accepted: Hang time, Date `2 Sep 2026` → Save → the "Check these values" sheet (it is far above the usual range) → **Save anyway** → stored **35999.000**. (BR-REC-75, 82, D3)
- [ ] **4.4** [G] Blank counts as zero when the other box has digits: Date `3 Sep 2026`, Plank minutes `2`, seconds empty → 2:00 (stored 120); Hang time seconds `45`, minutes empty → 0:45 (stored 45; it shows "Please check", Save → Save anyway). Both boxes empty → nothing recorded for that field. `stored` agrees. (D17)
- [ ] **4.5** [G] Paste: copy `2:02` somewhere, paste it into the **minutes** box → minutes 2, seconds 02. `[note]` paste into the **seconds** box: the spec only says "pasting 2:02 fills both"; tell the owner what happens. (BR-REC-75)
- [ ] **4.6** [G] An hour or more: Date `4 Sep 2026`, Plank minutes `65`, seconds `30` → Save (check sheet → Save anyway) → `stored` Plank **3930.000**. The saved value shows as **1:05:30** wherever it is read (S11 sheet in 13.6; the next form's "Last" line). (BR-REC-75)
- [ ] **4.7** **Reset.**

## 5. Last time and change (BR-REC-20, 81, 123; D5, D15)

- [ ] **5.1** [G] Surya, Body composition, Date today: Weight shows **"Last 95.5 kg · 5 Mar"** at the left under the box, Height **"Last 176.5 cm · <the date 3 days ago>"** (previous = the latest value before this date from any assessment), Visceral fat "Last 8.0 level · 5 Mar". Meera Nair (nothing saved): **no** "Last" lines. (BR-REC-20, 81, D5)
- [ ] **5.2** [G] Type Weight `94` → right-hand **"▼ −1.5 kg better"** (a real minus sign); `97` → **"▲ +1.5 kg worse"**; `95.5` → **"No change"**; clear the box → the line goes. Height (No direction) `177` → "▲ +0.5 cm" with **no** better/worse word. Body fat `24.5` → "▲ +0.5 % worse". Resting metabolism `1900` → "▲ +50 kcal better". The last and change lines use the mono (digits) font. (BR-REC-81, 123, D15)
- [ ] **5.3** [G] Time: Fitness test, Fran (Lower is better, last 4:05): `4` min `00` sec → "▼ −0:05 better"; `5` min `10` sec → "▲ +1:05 worse"; Plank `2` min `02` sec → "▲ +0:12 better". (BR-REC-81, D15)
- [ ] **5.4** [G] Back-filling uses the date: change Date to **30 Dec 2025** → Weight "Last 97.0 kg · 30 Sep 2025" (not the 95.5 of 2026); type `96` → "▼ −1.0 kg better"; Visceral fat "Last 9.0 level · 30 Sep 2025"; BMI shows **no** "Last" line (nothing before). (BR-REC-81)
- [ ] **5.5** [G] Estimated last value: Fitness test, Date **15 Jan 2026** → Plank "Last 1:40 · **≈ Dec 2025**" (the 10 Aug 2026 value is later and ignored); Date 10 Nov 2025 → no "Last" lines at all. (BR-REC-80, 81)
- [ ] **5.6** [G] A value on the same date never counts as last: `…&date=2026-03-05` (Body composition) → Weight "Last 97.0 kg · 30 Sep 2025", not itself. (D5)
- [ ] **5.7** [G] Network "Slow 3G", change the Date → the Last and change lines disappear while the other date loads, then come back for the new date; no stale line stays. (screens)

## 6. Please check (BR-REC-21, 82, 125; D14)

Reset first. Surya, Body composition unless said otherwise.

- [ ] **6.1** [G] Visceral fat (last 8.0): type `17.5` → no warning while typing; leave the box → an amber line with a warning icon and words **"Please check — last time 8.0"**; change to `8.5` and leave → the line goes. It never blocks. (BR-REC-21, 82)
- [ ] **6.2** [N] Exactly 30% is fine: Visceral fat `10.4` (+30%) and `5.6` (−30%) → **no** warning; `10.5` and `5.5` → warning. Fitness test, Push-ups (last 30): `39` → none, `40` → warning. If `10.4` or `5.6` warns, that is a bug (D14). (D14)
- [ ] **6.3** [G] Range: Meera (nothing saved, so no jump check), Body composition: Weight `20` → "Please check" with the usual range ("usually between 30 and 250"); `30` and `250` → no warning (equal is fine); `251` → warning. Fitness test, Plank `20` min `00` sec → warning (above 15:00). Surya Weight `20` → one line carrying both reasons (jump from 95.5 and below the range). (D14)
- [ ] **6.4** [G] No last value, no jump check: Meera Weight `200` (in range) → no warning. (BR-REC-82)
- [ ] **6.5** [G] Two odd values, one sheet: Surya Date `1 Sep 2026`, Visceral fat `17.5` and Weight `140` → Save → ONE sheet **"Check these values"** listing both fields with the typed value and "last time …" (for example "Visceral fat 17.5 (last time 8.0)") (bottom sheet on a phone, centred dialog from 1024 px) with **Go back** and **Save anyway**. Go back → sheet closes, nothing sent (Network), the values stay. Save again → Save anyway → toast "Saved 2 results for Surya". A value that is no longer flagged is not listed. (BR-REC-82, 138)
- [ ] **6.6** [G] Untouched saved values are not checked again: reopen `…&date=2026-09-01`, change only Height to `177` → Save → **no** check sheet although Visceral fat 17.5 is still odd; toast "Saved 1 result for Surya". (D2, screens)
- [ ] **6.7** [API] The server never blocks: `rec "Surya Pratap" "Body composition" 2026-09-05 false "Visceral fat=500"` → `saved: 1`. (BR-REC-82)

## 7. Date, About and paper columns (BR-REC-19, 79, 80, 83; D1, D16)

Reset first.

- [ ] **7.1** [G] Phone: the Date box opens the phone's own picker and days after today cannot be picked; pick a day → the form for it loads once, after a short pause (no flicker, no second load). Desktop: type a future date → **"That date is in the future. Pick today or an earlier day."** under the field; Save refuses (no request in Network); fix the date → the line goes. (BR-REC-83, D1)
- [ ] **7.2** [G] Typing a year on a desktop keyboard (R-6): in Surya's Body composition form type Weight `94`; click the year part of Date and type `2`,`0`,`2`,`5` at normal speed (the part shows 0002, 0020, 0202 on the way) → **no** `entry-form` request in the Network tab and no reload of the form while the year is unfinished (a year below 1000 is never taken on a pause); Weight `94` stays the whole time and the form does not flicker. Once the year is finished (2025) the form is taken after a pause of about 0.3 s, or at once when you press Tab / click out of the box: exactly **one** `entry-form` request. The Q chips (7.3) and Save & next date change the date at once, with no pause. (R-6)
- [ ] **7.3** [G] Paper chips, Surya (joined 1 Jun 2025): **Q1** → Date 1 Jun 2025 and About ticked; **Q2** → 1 Sep 2025; **Q3** → 1 Dec 2025; **Q4** → 1 Mar 2026 (in the Fitness test form Q3 lands on its saved ≈ Dec 2025 assessment, section 8). Chips change the date at once (no wait). The chosen chip is filled only while Date and About still match it: change the day by one, or untick About → no chip is chosen. (BR-REC-79, D16)
- [ ] **7.4** [G] Month end: Meera Nair (joined 31 Aug 2025): **Q2** → 30 Nov 2025, **Q3** → 28 Feb 2026, **Q4** → 31 May 2026. (BR-REC-79, D16)
- [ ] **7.5** [N] A chip in the future: Lata Joshi (joined 15 Jun 2026): **Q2** → 15 Sep 2026 is fine; **Q3** → 15 Dec 2026 shows the future line and Save refuses (until 15 Dec 2026; after that **Q4**, 15 Mar 2027, until then). (D16, BR-REC-83)
- [ ] **7.6** [N] Before the join date: Meera, Body composition, Date **15 Aug 2025** → amber **"This is before Meera joined (31 Aug 2025)"**; type Weight `90` → Save works → `rows "Meera Nair"` shows 2025-08-15. Lata, Date 1 Jun 2026 → "This is before Lata joined (15 Jun)" (no year, this year). The warning never blocks. (BR-REC-83, D1)
- [ ] **7.7** [G] About: Surya, Body composition, Date `1 Dec 2025`, tick **About**, Weight `96` → Save → `rows "Surya Pratap"` shows that date `estimated = t`; reopen that date → badge **"Edit · ≈ Dec 2025"**. (BR-REC-79, 80)
- [ ] **7.8** [G] Date from the address: `…&date=2026-03-05` opens on that date; `…&date=2099-01-01` opens a form with the future line (the date is only checked when you save, D1).
- [ ] **7.9** [N] Empty date: pick a date, then clear the Date box (desktop: select it, Delete) or use Save & next date (9.5) → tap **Save** → the cursor goes to Date and **"Pick a date"** shows under it. Nothing is sent.

## 8. A date that already has the assessment (BR-REC-74, 19, 80)

Reset first.

- [ ] **8.1** [G] Surya, Body composition, Date today, nothing typed → change Date to **5 Mar 2026** → the saved 15 values load and the badge **"Edit · 5 Mar"** shows under the date. Fitness test → Date 1 Dec 2025 → Plank 1:40, Fran 4:30, Push-ups 25 and the badge **"Edit · ≈ Dec 2025"**. (BR-REC-74, 80)
- [ ] **8.2** [G] A page opened on a saved date (`…&date=2026-03-05`) shows the values and the badge at once, no question. (BR-REC-74)
- [ ] **8.3** [G] **Keep mine.** Body composition, Date today, type Weight `94` → change Date to 5 Mar 2026 → the question **"Results are already saved for 5 Mar. Open the saved one?"** with **Keep mine** and **Open**, shown once. Tap **Keep mine** → Weight 94 stays → Save → "Saved 1 result for Surya"; `stored "Surya Pratap" "Body composition" 2026-03-05` → Weight **94.000**, and Visceral fat still **8.000** (what you did not type is left alone). (BR-REC-74, D2)
- [ ] **8.4** [G] **Open.** **Reset.** Type Weight `94` on today → Date 5 Mar 2026 → **Open** → your typed value is gone, the saved values show with the badge. (BR-REC-74)
- [ ] **8.5** [G] A date without a saved assessment asks nothing and your typed numbers move with the date ("typed values follow a date change"): type Weight `94`, change Date to 6 Mar 2026 → no question, Weight still `94`. A saved assessment's own values stay with it. (screens)

## 9. Saving, Save & next date, where you land (BR-REC-77, 78, 84, 86, 88; D2, D6, D12)

Reset first.

- [ ] **9.1** [G] Member page → Record assessment → Fitness test → Date today → Plank `2`/`02` and Push-ups `32` → **Save** → toast **"Saved 2 results for Surya"** (no "Are you sure?" first, BR-REC-133) and you are back on the **member page** (where the entry started). `rows "Surya Pratap"` has a new row today with 2 results and the Recent block shows it first without a reload. (BR-REC-84)
- [ ] **9.2** [G] Singular and first name: Body composition, Date `2 Sep 2026`, Weight `94` only → "Saved 1 result for Surya". For Meera Nair the toast says "for Meera". (BR-REC-84)
- [ ] **9.3** [N] Nothing typed → **Save** → **"Enter at least one value"** under the fields above the bar; nothing is sent; typing a value makes the line go. (BR-REC-78)
- [ ] **9.4** [N] Order of checks: clear the Date box (desktop: select it, Delete); type `abc` in Weight and tap **Save** → "Pick a date" in Date first; pick a date → Save → the cursor goes to Weight with "Enter a number like 95.5"; in the Fitness test form, Plank seconds `75` and `abc` in Flexibility both wrong → the Time box is named first. (screens)
- [ ] **9.5** [G] **Binder entry, 4 dates in a row.** Meera → Record assessment → Fitness test → **Q1** (31 Aug 2025) → Push-ups `0`, Plank `1`/`30` → **Save & next date** → toast "Saved 2 results for Meera"; the form stays: Fitness test and Meera kept, **Date empty with the cursor in it**, values and About cleared. **Q2** → Push-ups `50` (no "Please check": the last value is 0), Plank `1`/`45` → Save & next date. **Q3** → Plank `2`/`00` → Save & next date. **Q4** → Plank `2`/`10` → **Save** → toast, back on the member page. `rows "Meera Nair"` → four rows 2025-08-31, 2025-11-30, 2026-02-28, 2026-05-31, all `estimated = t`, results 2, 2, 1, 1. One column from the member page = Record assessment, Fitness test, Q chip, (type), Save & next date: **4 taps + typing**. (BR-REC-79, 84, 140, D12)
- [ ] **9.6** [G] Pointers: an edit that writes no value says "Saved." not a count (About only, 10.5); a Save with nothing changed sends nothing (10.9); a same number retyped is not a change (10.10).
- [ ] **9.7** [G] Where Save lands: started from the member page → the member page (9.1); opened by pasting the address into a new tab (nothing before it) → after Save the **member page**. The header back arrow also goes back to where you started (not to the choose sheet). Started from a Home row → Home: see 18.3. (BR-REC-84, D12)
- [ ] **9.8** [N] No connection: Meera, Body composition, Date `10 Sep 2026`, Weight `90` → DevTools → Network → Offline → Save → the line **"Not saved — check the connection and tap Save again"** above the bar and, within 2 s, the offline banner; the form stays filled. Back online → tap Save **once** → "Saved 1 result for Meera"; `rows "Meera Nair"` → exactly **one** row for 2026-09-10. (BR-REC-86, 132)
- [ ] **9.9** [N] Server error: Date `11 Sep 2026`, Weight `91` → stop the backend (Ctrl+C), tap Save → the same line, values kept; restart the backend → Save → saved, one row for that date. (BR-REC-86)
- [ ] **9.10** [N] Saving twice never makes two: Network "Slow 3G", Date `12 Sep 2026`, Weight `92`, double-tap **Save** quickly → "Saving…" with a spinner on the button you tapped and **both** buttons off; the Network tab shows **one** `POST /api/assessments`. After it finishes, right-click that request → Replay XHR (a lost reply) → answered 200; `rows "Meera Nair"` still one row for 2026-09-12. (BR-REC-86, D6)
- [ ] **9.11** [slow] A sentence from the server: before 16:30 India time, Settings → Reminders & gym → Time zone `Pacific/Pago_Pago` (the gym's day is then one day behind your device's) → Save the settings. Open the form for **today**, Weight `90` → Save → in the same place the friendly **"That date is in the future. Pick today or an earlier day."**, never `DATE_IN_FUTURE`. Put the zone back to `Asia/Kolkata` and Save. (BR-REC-83, 128)
- [ ] **9.12** [API] The race: `(rec "Lata Joshi" "Fitness test" 2026-09-02 false "Plank=100" & rec "Lata Joshi" "Fitness test" 2026-09-02 false "Plank=101" & wait)` → one answer `created:true`, the other `created:false`; `rows "Lata Joshi"` → one row. (BR-REC-86, D6)

## 10. Editing a saved assessment (BR-REC-77, 78, 92; D2, D7, D12, D19)

Reset first.

- [ ] **10.1** [G] Surya, Body composition, `…&date=2026-03-05`: change Weight `95.5 → 95` only → Save → toast **"Saved 1 result for Surya"**. Network: the `POST` body's `values` holds **one** entry (the changed one), not 15. `stored "Surya Pratap" "Body composition" 2026-03-05` → Weight 95.000, the other 14 as seeded. (D2)
- [ ] **10.2** [G] An untouched value is never re-rounded: `db -c "update measurements v set value = 24.25 from assessments a, metrics x where a.id = v.assessment_id and x.id = v.metric_id and x.name = 'Body fat' and a.assessed_on = '2026-03-05' and a.member_id = (select id from members where full_name = 'Surya Pratap')"`, reload the form → Body fat shows **24.25** (every digit, although the setting is 1 decimal). Change Weight only → Save → `stored` → Body fat still **24.250**, not 24.3. (D2, setup C9)
- [ ] **10.3** [G] Clear a saved value: empty Visceral fat → the right-hand line **"Will be removed"** until Save (type a number again → the line goes; empty it again). Save → `rows` → 14 results and Visceral fat is gone from `stored`. `[note]` the toast: the spec says "Saved." for an edit that writes no value; tell the owner whether it says "Saved." or a count for a clear-only edit. (BR-REC-77, D12)
- [ ] **10.4** [N] Empty every saved box (all fields cleared, nothing typed) → Save → **"Enter at least one value"**, nothing sent, the assessment still has its values (remove a whole assessment with Delete, 13.10). Leave one box filled instead and the save is accepted; the emptied ones are removed. (BR-REC-78, D2)
- [ ] **10.5** [G] About only: open 5 Mar 2026, tick **About**, nothing else → Save → the `POST` has `values: []` and `isEstimated: true`; toast **"Saved."** (not "Saved 0 results"), back where you started; `rows` → that date `estimated = t`, still 15 results; `changes` shows one new `assessment.save` row. Untick, Save → `f` again. (D2, D12)
- [ ] **10.6** [G] Change log: run `changes`. One `assessment.save` row per Save above; first saves have `no_before = t`, edits have both `f`; nothing for refused or cancelled saves. Latest row detail: `db -c "select before, after from audit_log where entity = 'assessment' order by id desc limit 1"` → `date`, `isEstimated` and `values` by measurement id. (BR-REC-92, D7)
- [ ] **10.7** [G] Fix a typo from last year: Date `2025-09-30`, Weight `97 → 96.5` → Save. `db -c "select before->'values'->>'$(mid "Body composition" Weight)' as was, after->'values'->>'$(mid "Body composition" Weight)' as now from audit_log where entity = 'assessment' order by id desc limit 1"` → **was 97, now 96.5**. (BR-REC-92)
- [ ] **10.8** [G] Estimated flag: open 1 Dec 2025 (Fitness test, estimated), change a value, About still ticked → `rows` still `t`; untick About, Save → `f`. (D2)
- [ ] **10.9** [G] [API] **Save with nothing changed saves nothing.** Open 5 Mar 2026 (saved, About as it is), change nothing (not a box, not About, not the date). Note the newest change-log number first: `db -At -c "select max(id) from audit_log"`. Tap **Save** → **no** `POST` in Network, toast **"Saved."**, back where you started; run the `max(id)` query again → the **same number** (no change-log row was written). Open it again and tap **Save & next date** instead → the same toast and no `POST`; the form stays with Date empty and focused and the boxes cleared; `max(id)` still the same. (D2, D12, BR-REC-92)
- [ ] **10.10** [G] **The same number typed another way is not a change.** Use Body fat on 5 Mar after 10.2 (stored 24.25, the box shows `24.25`). Type `24,25` over it (and `24.25 ` with a space at the end) and leave the box → no "Will be removed", no "Please check"; tap ← → **no leave question**; Save → no `POST`, "Saved." (like "95,55" over a stored 95.55). Now type `24.26` → ← asks the leave question (Stay); Save → `POST` with only Body fat, "Saved 1 result for Surya", `stored` → Body fat **24.300** (rounded to the setting). `24` or `25` over 24.25 are changes too. (D2, D19)
- [ ] **10.11** [G] **Leave question on a saved assessment** (D19): open 5 Mar, tick **About** only → ← asks (Stay); untick About → ← asks nothing; change one value → ← asks; set it back to the saved number → ← asks nothing; the draft stays after Leave (11.6).

## 11. Drafts on this device (BR-REC-85; D13)

Reset first. DevTools → Application → Local Storage open for the app.

- [ ] **11.1** [G] Surya, Body composition, open `…&date=2026-09-05` (the date in the address, so a reload comes back to it): type Weight `94` and Visceral fat `8,5`, tick About, do not Save, reload the page → above the form **"Restore unsaved results from 10:42?"** (the time you typed) with **Discard** and **Restore**. **Restore** fills Weight `94`, Visceral fat `8,5` (as typed) and About. Reload again without Save → asked again; after Restore or Discard it does not come back until you reopen the form. (BR-REC-85, D13)
- [ ] **11.2** [G] The stored draft: one key `assess-draft:v1:<memberId>:<typeId>:2026-09-05`; its JSON holds only `savedAt`, `isEstimated` and `values` (measurement id → the typed text; Time → seconds). No token, name or phone anywhere in it or in other keys. (BR-REC-85, D13)
- [ ] **11.3** [G] Cleared by Discard (key gone), by Save (type values, Save → key gone), by **Save & next date** (that date's key gone), by emptying every box (key gone), and **not created** when you open a saved assessment and leave it unchanged. (D12, D13)
- [ ] **11.4** [G] A draft belongs to member + assessment + date: the Surya Body composition 5 Sep draft is not offered for Meera, for Fitness test, or for another date.
- [ ] **11.5** [G] Seven days: with a draft stored, run in the DevTools console `k = Object.keys(localStorage).find(x => x.startsWith('assess-draft:v1:')); d = JSON.parse(localStorage[k]); d.savedAt = Date.now() - 8*24*3600*1000; localStorage[k] = JSON.stringify(d)` then open any form → no restore offer and the key is gone. With `7*24*3600*1000 - 60000` instead it is still offered. (BR-REC-85, Q5)
- [ ] **11.6** [G] Leave keeps the draft: type a value, tap ←, **Leave** (12.1), open the same member, assessment and date → Restore is offered. (D19)
- [ ] **11.7** [N] Blocked storage: in the console run `Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError") }`, then open a form and type values → no error screen, the form works, **Save** works, no key is stored. Reload to undo. (D13)

## 12. Leaving the form: question, Back, closing the tab (BR-REC-90; D19)

Reset first.

- [ ] **12.1** [G] Type a value → tap the header ← → **"Leave without saving? Your entries stay as a draft."** with **Stay** and **Leave**. **Stay**: still on the form with everything kept. **Leave**: goes back to where you started; reopen the form → Restore is offered. (BR-REC-90)
- [ ] **12.2** [G] Browser Back (desktop Back button, Android Back, iOS edge swipe) → the same question. After **Stay**, press Back again → asked again (no loop, no extra history entries, the address unchanged). After **Leave** you are on the previous page and Forward does not land on a broken form. (BR-REC-90, D19)
- [ ] **12.3** [G] Desktop: with typed values click **Members** in the side bar → the question; **Leave** goes to Members; Stay keeps the form. (D19)
- [ ] **12.4** [G] Closing or reloading the tab with typed values → the browser's own "Leave site?" prompt (desktop Chrome); with nothing typed no prompt. `[note]` mobile browsers often show no prompt: tell the owner what a phone does. (D19)
- [ ] **12.5** [G] Nothing typed → ← leaves at once, no question; also after only changing the Date or opening and closing the Date picker on a fresh form. (BR-REC-90)
- [ ] **12.6** [G] Saved assessment (`…&date=2026-03-05`): change one value → ← asks; type the saved value back → ← asks nothing; tick **About** only → ← asks; untick it → ← asks nothing (D19, 10.11).
- [ ] **12.7** [G] **A date move is not a leave** (D19): on `…&date=2026-03-05` type Weight `94`, then change Date to **6 Mar 2026** → **no** leave question, the form for 6 Mar opens without your Weight (a saved assessment's values stay with it; the numbers are not carried to the new date); press ← → no question (nothing typed for 6 Mar). Open `…&date=2026-03-05` again → **"Restore unsaved results from …?"** offers Weight `94`: DevTools → Local Storage key `…:2026-03-05` holds it. `[note]` D19 says the typed values stay "in that date's draft"; this reads as the date you left (5 Mar). Tell the owner if the values show up under 6 Mar instead.
- [ ] **12.8** [G] After a successful **Save** you leave without any question; after **Save & next date** the form is clean, so ← asks nothing either. (BR-REC-84)

## 13. S11 All assessments and its sheet (BR-REC-19, 80, 88, 89, 92, 133; D9, D10, D18)

Reset first.

- [ ] **13.1** [G] Surya's member page → **All assessments** → `/admin/members/<id>/assessments`. Header: back arrow (spoken "Back") to the member page, title "All assessments", second line "Surya Pratap", no main action. Chips **All** (filled), **Body composition**, **Fitness test**. Rows newest first, each 64 px: line 1 the date, line 2 the assessment, at the right the count: `<3 days ago>` Body composition **1 result** · `10 Aug` Fitness test **14 results** · `5 Mar` Body composition **15 results** · **≈ Dec 2025** Fitness test **3 results** · `30 Sep 2025` Body composition **3 results**. (BR-REC-80, 89, 127)
- [ ] **13.2** [G] Filter: tap **Fitness test** → only its 2 rows, address `?type=<id>`; **All** removes `?type`. The filter does not add Back steps: choose Fitness, Body composition, Fitness, then Back once → you are on the member page. (D18)
- [ ] **13.3** [G] Paging, Bulk Binder → All assessments: the first **25** rows, then a full-width **Show more** ("Loading…" while it loads) adds the other 8 (33) and the button goes. Newest first: 1 Mar 2025, 1 Feb 2025, 1 Jan 2025, then 17 Oct 2024 and every 10 days back; no repeats, no gaps. Filter Body composition → 25 + Show more → 5 more (30); Fitness test → 3 rows, "1 result" each, no button. (BR-REC-89, D10)
- [ ] **13.4** [G] Empty and unknown: Lata Joshi → "No assessments yet."; Anil Archived with the Fitness test chip → "Nothing recorded for Fitness test yet."; `/admin/members/00000000-0000-0000-0000-000000000000/assessments` → "We couldn't find that. It may have been removed." with no chips and no rows.
- [ ] **13.5** [N] Loading and failures: Network "Slow 3G", reload → the header, three grey chips and 8 grey rows. Block `*/api/assessments?*` → "Couldn't load this." with **Try again** where the rows go (chips still work). Block `*assessment-types*` → the same sentence in the chips' place while the rows still show. Bulk Binder: block `*page=2*`, tap Show more → "Couldn't load this." [Try again] under the rows; unblock, tap it → the rows load. (BR-REC-129, 131)
- [ ] **13.6** [G] Tap the `5 Mar` row → ONE sheet (bottom sheet on a phone, centred dialog from 1024 px): title **"Body composition"**, second line the date and "15 results"; one line per saved value in setup order, name left, value right in the mono font with its unit ("176.0 cm", "95.5 kg", "24.0 %", BMI "30.8" with no unit). The Fitness test sheet shows Time values as **"1:50"** (Plank), "4:05" (Fran) and, after `rec "Surya Pratap" "Fitness test" 2026-09-04 false "Plank=3930"`, "1:05:30" (open that row), with no unit. Footer **Edit** (main) and **Delete**, and no "Move" or "Change date" control (E29 has no screen, D21, #32). Network "Slow 3G": the title and count show at once, then three grey rows, then the values. (BR-REC-89, 127, D18)
- [ ] **13.7** [G] The sheet closes in one step with ×, swipe down, Esc and browser Back / Android Back; the page behind stays on S11 (the first Back must not leave S11). (BR-REC-138)
- [ ] **13.8** [G] **Edit** → the sheet closes and S10 opens at `/assess?type=…&date=2026-03-05` with **"Edit · 5 Mar"**. Back → S11 with the sheet closed (not reopened). Edit a value, Save → back on S11, sheet closed, the row's count correct. (D18)
- [ ] **13.9** [G] `?open=`: on Surya's member page tap a **Recent** row (14.2) → S11 opens with that assessment's sheet; the address has **no** `open=` any more (reload does not reopen it; Back from Edit does not either). Typing `?open=abc` by hand opens nothing. An id of another member (`curl -s -b jar.txt "$APP/api/assessments?memberId=$(mem 'Surya Pratap')" | jq -r '.data[0].id'`, put into **Meera's** `/assessments?open=<id>`) → the sheet says "We couldn't find that. It may have been removed." with no retry. (D18)
- [ ] **13.10** [G] **Delete.** Open the `30 Sep 2025` row → **Delete** → the **same sheet** turns into **"Delete Body composition from 30 Sep 2025?"** / **"3 results will be removed."** with **Cancel** (focused) and **Delete assessment**; no second sheet or dark layer. Cancel → the values again. Delete again, **double-click Delete quickly** → only the question shows, nothing is deleted (no `DELETE` in Network). Network "Slow 3G", tap **Delete assessment** once → "Deleting…" with a spinner and both buttons off → toast **"Deleted."**, the sheet closes, the row is gone, the member page's Recent block is current. `rows` and `stored` no longer have it; `changes` → `assessment.delete` with `no_after = t`. (BR-REC-19, 88, 92, 133, D7, D9)
- [ ] **13.11** [N] Delete fails: open a row's Delete question, DevTools → Offline, tap **Delete assessment** → under the question **"Not deleted — check the connection and try again."**; both buttons stay; back online → Delete assessment works. (screens)
- [ ] **13.12** [N] Deleted elsewhere: open a row's sheet → Delete question; in the terminal `curl -s -b jar.txt -X DELETE $APP/api/assessments/<id> -H "$O"` (id from `curl -s -b jar.txt "$APP/api/assessments?memberId=$(mem 'Surya Pratap')"`) → tap **Delete assessment** → **"We couldn't find that. It may have been removed."** and the row disappears after the list refreshes.
- [ ] **13.13** [note] The year in dates: rows, the Recent block and "Edit ·" drop the year for this year ("5 Mar", BR-REC-127). Write down what the sheet's second line and the delete question show for a date in this year (the spec's example question has the year, "12 Mar 2025"); the owner decides if both are fine.

## 14. Member page, Recent block (D18)

- [ ] **14.1** [G] Surya's member page: section **Recent** with the latest **3**, newest first, as in S11: `<3 days ago>` · Body composition · 1 result, `10 Aug` · Fitness test · 14 results, `5 Mar` · Body composition · 15 results. There is **no "See all" link** in the block; the page's **All assessments** button is the way. (BR-REC-89)
- [ ] **14.2** [G] A row opens S11 with that assessment's sheet open (13.9).
- [ ] **14.3** [G] Lata Joshi: **"No assessments yet."**
- [ ] **14.4** [N] Network "Slow 3G", reload → three grey rows in the block while the rest of the page shows. Block `*pageSize=3*`, reload → **"Couldn't load this."** with **Try again** in the block only; the rest of the page works; unblock, Try again → grey rows, then the rows. (BR-REC-129, 131)
- [ ] **14.5** [G] Always current: save, edit and delete an assessment, go to the member page each time → the block shows the change with no reload. (D18)
- [ ] **14.6** [G] Estimated dates: run `rec "Meera Nair" "Fitness test" 2026-05-31 true "Plank=130"; rec "Meera Nair" "Fitness test" 2026-02-28 true "Plank=120"; rec "Meera Nair" "Fitness test" 2025-11-30 true "Plank=105"` → Meera's block: **≈ May 2026** · Fitness test · 1 result, **≈ Feb 2026**, **≈ Nov 2025**; the same "≈ …" in her S11 list and sheet. (BR-REC-80)

## 15. Archived members, the server agrees (BR-REC-19, 77, 78, 81, 83, 87, 92; D21)

- [ ] **15.1** [G] Archived member: Members → **Archived** chip → Anil Archived → Record assessment works end to end (choose, form, Save, All assessments, Delete), and the member stays archived afterwards. (members BR-REC-58, assessments Who can do what)
- [ ] **15.2** [API] Last value with later data present: `curl -s -b jar.txt "$APP/api/members/$(mem 'Surya Pratap')/entry-form?typeId=$(tid 'Body composition')&date=2025-12-30" | jq -c '.data.metrics[] | select(.name=="Weight") | .previous'` → `{"value":97,"on":"2025-09-30","isEstimated":false}`, not the 2026 value. (BR-REC-81)
- [ ] **15.3** [API] Saving again edits: `rec "Meera Nair" "Body composition" 2025-12-30 false "Weight=94"` then `rec "Meera Nair" "Body composition" 2025-12-30 false "Weight=93.5" "Visceral fat=8"` → `created:true` then `created:false`; `rows "Meera Nair"` one row for that date. (BR-REC-19)
- [ ] **15.4** [API] Refusals: `rec "Meera Nair" "Body composition" $(db -At -c "select (now() at time zone 'Asia/Kolkata')::date + 1") false "Weight=90"` → 400 `DATE_IN_FUTURE`; `rec "Meera Nair" "Body composition" 2026-09-20 false` → 400 `NO_VALUES`; `rec "Meera Nair" "Fitness test" 2026-09-21 false "Plank=40000"` → 400 `VALIDATION_ERROR` "Use 0 to 35,999 seconds"; none of them leaves a row (`rows`) or a change-log row (`changes`). (BR-REC-78, 83)
- [ ] **15.5** [API] Remove one value: `rec "Surya Pratap" "Body composition" 2026-03-05 false "Weight=null"` → `saved:0, removed:1`; the day still has its other values. (BR-REC-77)
- [ ] **15.6** [API] Moving a date has an API but no screen (D21, issue #32): nowhere in S10, S11 or its sheet can you move an assessment to another date; the API: `curl -s -b jar.txt -X PATCH $APP/api/assessments/<id> -H "$O" -H "$J" -d '{"date":"2026-03-06"}'` (an id as in 13.12) → 200 and the values moved; onto a date that already holds this assessment → 409 `ASSESSMENT_DATE_TAKEN`; later than today → 400 `DATE_IN_FUTURE`. `[note]` the BR-REC-87 sentence ("There's already a Body composition on 15 Mar 2025 — open it instead") is not shown anywhere yet; no screen moves an assessment.
- [ ] **15.7** [G] After the walk-through `changes` has one row per successful save and delete and none for refusals, reads or cancelled forms; `session_id` equals the login's session. (BR-REC-92)

## 16. Real phone: keypad, keyboard, history (BR-REC-75, 76, 85, 90, 91, 122, 123, 132)

Reset first. Android Chrome and iPhone Safari, signed in at `http://<laptop-ip>:3000`.

- [ ] **16.1** [G] Keypad: tap Weight → a number keypad with a "." (or ",") key and no letters; tap a minutes or seconds box → a digits-only keypad; Date opens the phone's date picker with later days greyed. Flexibility has the **±** button next to the keypad (the iPhone decimal pad has no minus). (BR-REC-75, 76, 91, D17)
- [ ] **16.2** [G] Keyboard key: on every box the action key says **Next** (Android: an arrow); on the **last** field (Skeletal muscle — legs) it says **Done**. Tap Next → focus moves to the **next field in order**; in a Time field from minutes to seconds and on to the next field. `[note]` the iPhone decimal pad has **no** return key (an iOS limit): Safari's ▲▼ bar above the keypad is the way to move on; write down how it felt. (BR-REC-91, D17)
- [ ] **16.3** [G] **15 values without touching the screen** (Android): Surya, Body composition, today; type and press Next 15 times: `176.5` `94` `30.2` `23.5` `8` `1860` `40` `21.8` `20` `23.5` `20.5` `36.5` `34.2` `33.8` `38.2`. No "Please check" shows; start a stopwatch when the form opens and stop at Save → "Saved 15 results for Surya" in **under 2 minutes**. (BR-REC-91, summary)
- [ ] **16.4** [G] Save stays visible above the keyboard: with the keyboard open on the last field and on Weight, **Save** and **Save & next date** are still visible and tappable (iPhone Safari and Android Chrome); the box you type in is not hidden behind the bar; the page returns to normal when the keyboard closes. (BR-REC-91, 121)
- [ ] **16.5** [G] Time boxes: minutes `2`, seconds `02`; paste `2:02` into minutes (copy it from Notes) → both filled. `[note]` does focus jump from minutes to seconds by itself? Tell the owner.
- [ ] **16.6** [G] Draft: type three values, lock the phone for a minute, unlock; then swipe the browser tab away, open the same address again → **"Restore unsaved results from …?"** → Restore fills them. (BR-REC-85)
- [ ] **16.7** [G] Leave: with typed values press Android Back / swipe from the iOS edge → the question; Stay stays, Leave leaves; reopen → Restore offered. `[note]` closing the tab on a phone shows no browser prompt; tell the owner. (BR-REC-90)
- [ ] **16.8** [G] Offline: airplane mode, tap Save → "Not saved — check the connection and tap Save again", banner within 2 s, values kept; back online, tap Save once → one record (`rows`). (BR-REC-86, 132)
- [ ] **16.9** [G] Fingers: Q1…Q4, About, ±, Save & next date next to Save, Stay / Leave, Go back / Save anyway, Keep mine / Open: no mistaps with a thumb. The iPhone does **not** zoom in when you focus Weight, a minutes box or Date (16 px text). (BR-REC-122, 123)
- [ ] **16.10** [G] Rotate to landscape and back with typed values: values stay, no layout break.

## 17. Look, feel, words, access (ux BR-REC-120…140, on S10, S11, the sheets and the Recent block)

- [ ] **17.1** [G] Words (BR-REC-126, 128): read every label, hint, error, toast and spoken name on S10, the choose sheet, the check sheet, the question sheets, S11, its sheet and the Recent block. Allowed: Assessment, Measurement, About, Paper column, Please check, Last, Will be removed, Save & next date, draft. Not allowed: "metric", "datatype", "interval", "estimated", "plausibility", status numbers, codes in capitals (`NO_VALUES`, `DATE_IN_FUTURE`, `VALIDATION_ERROR`, `NOT_FOUND`, `ASSESSMENT_DATE_TAKEN`, `METRIC_NOT_IN_TYPE`). Every refusal you caused showed one plain sentence next to the field or as a short toast.
- [ ] **17.2** [G] **Phone 360 px**: no sideways scroll on the form (all 15 fields; long labels such as "Subcutaneous fat — whole body" wrap or cut, the Last and change lines do not overlap the box, the two Time boxes fit), the choose sheet, the Restore line, "Please check" lines, the check sheet, the leave question, S11 with a 40-character assessment name (Settings → add `abcdefghijabcdefghijabcdefghijabcdefghij`), its sheet and delete question, and the Recent block. (BR-REC-139, 135)
- [ ] **17.3** [G] Tablet 800 px portrait: bottom tab bar on S11 and hidden in the form, sheets are bottom sheets. Tablet 1180 px landscape / Desktop 1280 px: side bar, dialogs centred, Save buttons at the right of the header. Desktop 1920 px: form and S11 at most 720 px, centred. (BR-REC-120, 121, 138, 139)
- [ ] **17.4** [G] One strong button per place: S10 **Save** is the strong one and **Save & next date** the quiet one; the S11 sheet has **Edit** strong and **Delete** quiet; in a question sheet one strong button. Never two strong buttons in view. (BR-REC-121)
- [ ] **17.5** [G] **44 px targets** (DevTools: select the element, Computed tab; also thumb-test): Q1…Q4, the About box, the ± button, the minutes and seconds boxes, Save & next date, Save, header back, Show more, filter chips, Restore / Discard, Stay / Leave, Go back / Save anyway, Keep mine / Open, Cancel / Delete assessment, the sheet ×; at least 44 x 44 px with 8 px between neighbours; S11 rows 64 px, Recent rows at least 56 px; inputs and buttons 48 px tall. (BR-REC-122)
- [ ] **17.6** [G] Text: inputs 16 px, hints and second lines 14 px, nothing below 12 px; "Last…" and change lines and the sheet's values in the mono font so digits line up (right-aligned). (BR-REC-123)
- [ ] **17.7** [G] **Dark theme** (Settings → Theme → Dark): walk the form (amber Please check line, error lines, the Edit badge, Will be removed, the Restore line, better/worse lines), the choose sheet, the check sheet, the leave and delete questions, S11 with its sheet, the Recent block and the toasts. Everything readable. Run axe (browser extension) on the form (once with the check sheet open), S11 (once with the sheet open) and the member page in **light and dark** → 0 contrast issues, 0 serious. (BR-REC-124, 136)
- [ ] **17.8** [G] Grey-scale (DevTools → Rendering → "Emulate vision deficiency: achromatopsia"): the Please check line (icon + words), "Will be removed", better / worse (arrow + word), the Edit badge, error lines and the chosen Q chip are still obvious without colour. (BR-REC-125)
- [ ] **17.9** [G] **200 % text zoom**: desktop browser zoom 200 %, and on a phone the largest text size / Display Zoom. The form, S11 and every sheet: no sideways scrolling, no clipped text, sheets scroll inside themselves and their buttons can be reached; the bottom bar never covers the box you are typing in. (BR-REC-137)
- [ ] **17.10** [G] Keyboard only (Desktop): Tab goes Date, About, Q1…Q4, the fields in order, Save & next date, Save; the focus ring is always visible; Space or Enter ticks About and picks a chip; Esc closes a sheet; focus returns to the control that opened it; Tab does not leave an open dialog. `[note]` what Enter does inside a Number box on a desktop (jump to the next field or Save?): the spec only defines the phone key; tell the owner. (BR-REC-137)
- [ ] **17.11** [G] **Screen reader** — VoiceOver (iPhone Safari), TalkBack (Android Chrome), NVDA or VoiceOver on Desktop. Check: each field reads its label and unit; the Last and change lines are read with the word "better" / "worse"; after a failed Save the error is read with its field ("Weight, Enter a number like 95.5"); the Please check line is announced when it appears; Time boxes are told apart ("Plank, minutes" / "seconds"); the ± button and the header back arrow ("Back") have spoken names; Q chips read chosen / not chosen; About reads its state; the Restore line is read; sheets read their title and move focus in; toasts are announced ("Saved 9 results for Surya", "Deleted."); an S11 row reads date, assessment and count. (BR-REC-137, 134)
- [ ] **17.12** [G] Reduce motion on in the system → sheets and toasts appear without sliding. (BR-REC-137)
- [ ] **17.13** [G] Offline (DevTools → Offline) on the form and inside the S11 sheet: within 2 s a thin banner says **"You're offline — changes can't be saved right now"**; typed values stay; it goes away on reconnect. (BR-REC-132)
- [ ] **17.14** [G] Every part with a loading, empty or error state showed the right one (1.8, 2.2, 13.4, 13.5, 14.3, 14.4): grey shapes in the real layout, one plain sentence, "Couldn't load this." + **Try again** only in its own place. (BR-REC-129, 130, 131)
- [ ] **17.15** [G] Tap budgets (BR-REC-140): back-fill one paper column = Record assessment, assessment, Q chip, (type), Save & next date: **4 taps + typing** (9.5). Home row to the form: 18.3.

## 18. Later — when the other streams are merged `[later]`

Run `seed_data` again first (Reset); today = 4 Oct 2026 in the examples, the day counts move with the day.

- [ ] **18.1** [later: due list] Choose sheet words (BR-REC-73): Surya → Record assessment → **"Record for Surya"** rows **Body composition — Overdue N days** (last values 5 Mar and the 3-days-ago Height; N counts from 5 Apr 2026) and **Fitness test — Due in 6 days** (last 10 Aug + 2 months = 10 Oct). Meera / Lata (nothing recorded): the word for "never recorded". `[note]` write down what the sheet shows for them (the word list has "Never recorded"; the due rules make them overdue from the join date). After the E32 answers, no word is missing and no error shows.
- [ ] **18.2** [later: due list] Due tags: Surya's Body composition form → every label except **Height** (recorded 3 days ago, not due) ends " · due"; Meera's form → all fields due. `[note]` Fitness test (due in 6 days): do its labels carry the tag? The spec says "due ones carry a tag"; tell the owner. (BR-REC-73)
- [ ] **18.3** [later: due list] **Home row → form in 1 tap.** Home → Overdue → the row **"Surya Pratap · Body composition"** → one tap → the form with Body composition already picked, Date today, no choose sheet, due tags. Type 3 of the due values → Save → toast and you are back on **Home** (where you started). (BR-REC-73, 84, 102, 140)
- [ ] **18.4** [later: due list] Due dates update at once (BR-REC-88): after 18.3 the Home row **stays** with 3 fewer chips (no reload needed). Save the remaining due values from the row → the row leaves Overdue. Then All assessments → open that assessment → Delete → Home shows the row **due again** with its chips back, without a reload. The choose sheet's words follow each save and delete at once too.
- [ ] **18.5** [later: due list] The member page's Assessments block shows the new status after every save and delete (e.g. "Next due …" after saving, "Overdue …" after the delete).
- [ ] **18.6** [later: progress] **≈ and CSV** (BR-REC-80): an estimated date shows as "≈ Dec 2025" on the report card, and the exported CSV has `estimated = yes` for it (Meera's three estimated Fitness tests from 14.6, Surya's ≈ Dec 2025).
- [ ] **18.7** [later: progress] What you edited, cleared or deleted here is what the report card and gym progress read (10.1, 10.3, 13.10): the changed Weight, no Visceral fat for the cleared day, nothing for the deleted assessment.

## Coverage

| BR | Section(s) | BR | Section(s) | BR | Section(s) |
|---|---|---|---|---|---|
| 12 | 4, 5 | 19 | 7, 8, 9, 10, 13, 15 | 20 | 5 |
| 21 | 6 | 73 | 1, 2, 18 | 74 | 8 |
| 75 | 4, 16 | 76 | 3, 16 | 77 | 3, 9, 10, 15 |
| 78 | 9, 10, 15 | 79 | 7, 9 | 80 | 5, 7, 8, 13, 14, 18 |
| 81 | 5, 15 | 82 | 4, 6 | 83 | 7, 9, 15 |
| 84 | 1, 9, 12, 18 | 85 | 11, 12, 16 | 86 | 9, 16 |
| 87 | 15 (API only, D21, #32) | 88 | 13, 18 | 89 | 13, 14 |
| 90 | 10, 12, 16 | 91 | 16 | 92 | 10, 13, 15 |
| ux 120…139 | 1, 2, 13, 17 | 133 | 9, 13 | 140 (tap budgets) | 9, 17, 18 |
| D2 (changed fields only, no-op Save, About only) | 10 | D12 ("Saved.", Save & next date) | 9, 10 | D19 (leave question, date move) | 10, 12 |
| D21 (E29 API only) | 13, 15 | R-6 (date settles) | 7 | other D1…D18, D20 | 1…15 |
