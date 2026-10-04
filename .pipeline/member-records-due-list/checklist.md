# member-records/due-list · manual test checklist

Spec: `docs/specs/member-records/due-list.md` v2 (BR-REC-15…18, 93…105 + build clarifications C1…C13) + `ux.md` v1 (BR-REC-122, 125…127, 129…133, 137, 138, 140 on S2 Home, S3 Due list, the row sheet and the member page "Assessments" block).
Written from the spec rules and `screens.md` (URLs, words and roles only). The server rules (E31…E34: order, paging, limits, 404s, change log, races, override ending) have automated tests; this list is for what no test reaches: the screens, the sheet, the toasts, the loading / empty / error shapes, widths, themes, zoom and screen readers (no DOM test library yet, #9).
Tags: `[G]` golden path · `[N]` negative path · `[SQL]` a shell helper stands in for something the app cannot do yet (it writes the same rows a saved assessment would) · `[slow]` needs real waiting · `[note]` the spec is silent or unclear, tell the owner, not a fail · `[needs D]` needs stream D (assessments: the Record assessment form) merged; where a SQL stand-in exists the item says so, and section 15 repeats the real-form version.
Time (estimate): sections 1…13 about 100 minutes on Phone + Desktop; section 14 about 45 minutes with the real devices; section 15 about 20 minutes once D is merged.
Words: "Assessment" in the app = table `assessment_types`, "measurement" = table `metrics`. The table called `measurements` holds the **results** (values). Do not mix them up in the SQL below.
No `curl` is needed: every check is on a screen plus a one-line SQL look. "Phone" = a real phone, or DevTools device mode at 360 px. "Desktop" = Chrome, window 1280 px or wider.

## 0. Setup (once)

- [ ] **0.1** Dev DB up and rebuilt: `cd backend && docker compose up -d && bun run db:reset` (wipes the local dev DB, pushes the schema, seeds settings, the login-lock row and the assessment catalog; refuses a non-local host). Do **not** run `seed:perf` now: it adds 1,000 members and buries the Case rows (optional, 10.8).
  The Postgres on port 5433 is shared by every worktree. This worktree's database is the last part of `DATABASE_URL` in `backend/.env` (probably `gym_due`); keep it in mind for `DBNAME` below.
- [ ] **0.2** One login: `cd backend && bun run bootstrap-admin --username owner --password Gym-pass-1`. Login below: `owner` / `Gym-pass-1`.
- [ ] **0.3** Backend `cd backend && bun run dev` (API port **4005**; `backend/.env` has `PORT=4005` and `APP_ORIGIN=http://localhost:3005`). Frontend `cd frontend && PORT=3005 bun run dev` (web port **3005**; `frontend/.env.local` has `API_URL=http://localhost:4005/api`). Open `http://localhost:3005`.
- [ ] **0.4** Devices: **Desktop**, **Phone** (real phone on the same Wi-Fi needs the Mac's address in `APP_ORIGINS_EXTRA` in `backend/.env` and an API restart; if the page loads but nothing reacts, Next is blocking the LAN address in dev, so use DevTools device mode and do the real-phone pass in section 14). `[note]` tell the owner which one you used.
- [ ] **0.5** Shell helpers: paste the block under this list into a terminal opened in a scratch folder (not in the repo). `db` runs SQL inside the Docker Postgres, so no local `psql` is needed; `DBNAME` must be the same database as `DATABASE_URL` in `backend/.env`. Nothing prints when a helper works.
- [ ] **0.6** Sign in as `owner` on Desktop and on Phone (`/login`). Home is `/admin`.
- [ ] **0.7** Optional, for DevTools throttling and blocking steps: Chrome → DevTools → Network → "Slow 3G" and "Block request URL" (right-click a request, or the three-dot "Network request blocking" panel).

```
APP=http://localhost:3005; DBNAME=gym_due     # DBNAME = the last part of DATABASE_URL in backend/.env
db() { docker exec -i gym-postgres psql -U postgres -d $DBNAME -v ON_ERROR_STOP=1 "$@"; }   # or: db() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }
GYMTODAY="(now() at time zone coalesce((select timezone from gym_settings limit 1), 'Asia/Kolkata'))::date"   # the gym's "today" (Settings time zone)
day()   { db -tA -c "select $GYMTODAY + ($1)"; }                       # day 0 = today, day -5 = 5 days ago, day 7 = in a week
mon()   { db -tA -c "select ($GYMTODAY + interval '$1 month')::date"; } # mon 1 = same day next month
since() { db -tA -c "select $GYMTODAY - date '$1'"; }                  # days from a date to today
last_for() { db -tA -c "select (($GYMTODAY + ($3)) - make_interval(${2}s => $1))::date"; }   # last_for 1 month 7 = the last-measured date that makes a 1-month repeat fall due 7 days from today (-3 = 3 days ago)
pretty() { db -tA -c "select to_char(date '$1', 'FMDD FMMon') || case when extract(year from date '$1') <> extract(year from $GYMTODAY) then to_char(date '$1', ' YYYY') else '' end"; }   # 2026-10-11 -> "11 Oct" (year only when not this year)
mid() { db -tA -c "select id from members where full_name = '$1'"; }
tid() { db -tA -c "select id from assessment_types where name = '$1'"; }
mk() {   # mk "<name>" [joined N days ago, default 124] [membership end, days from today, default 300; none = no membership]
  local today; today=$(day 0)
  db -q -v n="$1" -v t="$today" -v j="${2:-124}" -v e="${3:-300}" <<'SQL'
with new as (
  insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on)
  select :'n', left(p, 5) || ' ' || right(p, 5), p, '1990-01-01', 'male', :'t'::date - (:'j')::int
  from (select '9' || lpad(floor(random() * 1e9)::bigint::text, 9, '0') as p) x
  where not exists (select 1 from members where full_name = :'n')
  returning id
)
insert into membership_periods (member_id, plan, start_on, end_on)
select id, 'monthly', :'t'::date + (:'e')::int - 29, :'t'::date + (:'e')::int from new where :'e' <> 'none';
SQL
}
rec() {   # rec "<member>" "<assessment>" <yyyy-mm-dd> "<Name|Name>"  (or "*" = every measurement that is on, or "-Name|Name" = all except those). Same effect as saving an assessment on that date.
  db -q -v m="$1" -v t="$2" -v d="$3" -v ms="$4" <<'SQL'
insert into assessments (member_id, type_id, assessed_on)
select (select id from members where full_name = :'m'), id, :'d'::date
from assessment_types where name = :'t'
on conflict (member_id, type_id, assessed_on) do update set updated_at = now();
insert into measurements (assessment_id, metric_id, member_id, measured_on, value)
select a.id, x.id, a.member_id, a.assessed_on, 50
from assessments a
join assessment_types t on t.id = a.type_id and t.name = :'t'
join metrics x on x.type_id = t.id and x.is_active
  and case when :'ms' = '*' then true
           when left(:'ms', 1) = '-' then not (x.name = any (string_to_array(substr(:'ms', 2), '|')))
           else x.name = any (string_to_array(:'ms', '|')) end
where a.member_id = (select id from members where full_name = :'m') and a.assessed_on = :'d'::date
on conflict do nothing;
SQL
}
kase() {   # kase "<member>" "<assessment>" "<Name|Name|*>" <date|none> [membership end offset]: everything recorded today, except the listed measurements of <assessment>, which get <date> (none = never recorded)
  mk "$1" 124 "${5:-300}"
  for t in "Body composition" "Fitness test"; do
    if [ "$t" != "$2" ]; then rec "$1" "$t" "$(day 0)" "*"
    elif [ "$3" = "*" ]; then [ "$4" = none ] || rec "$1" "$t" "$4" "*"
    else rec "$1" "$t" "$(day 0)" "-$3"; [ "$4" = none ] || rec "$1" "$t" "$4" "$3"
    fi
  done
}
archive() { db -q -v n="$1" <<'SQL'
update members set archived_at = now() where full_name = :'n';
SQL
}
remind_to() { db -q -c "update due_overrides set until_on = date '$2' where kind = 'snooze' and member_id = (select id from members where full_name = '$1')"; }   # moves a reminder's end day (to test "back on that day" without waiting)
ov() { db -c "select m.full_name, t.name as assessment, o.kind, o.set_on, o.until_on from due_overrides o join members m on m.id = o.member_id join assessment_types t on t.id = o.type_id order by 1, 2"; }   # every Assess soon / reminder now
bulk() {   # bulk <n>: n more members who never had an assessment (each is Overdue for both assessments: 2n rows)
  local today; today=$(day 0)
  db -q -v n="$1" -v t="$today" <<'SQL'
with new as (
  insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on)
  select 'Bulk ' || lpad(i::text, 3, '0'), left(p, 5) || ' ' || right(p, 5), p, '1990-01-01', 'female', :'t'::date - 60 - i
  from generate_series(1, :'n'::int) i,
       lateral (select '8' || lpad(floor(random() * 1e9)::bigint::text, 9, '0') as p) x
  where not exists (select 1 from members where full_name = 'Bulk ' || lpad(i::text, 3, '0'))
  returning id
)
insert into membership_periods (member_id, plan, start_on, end_on)
select id, 'annual', :'t'::date - 30, :'t'::date + 300 from new;
SQL
}
```
All dates in this list are relative to the gym's today, so you can run it on any day: the numbers below (3 days, 124 days, "Due in 7 days") hold on any day. The one exception: when a date such as `day 7` falls on the 29th to 31st of a month, a 1-month helper date can land a day or two off (month-end maths, BR-REC-94). If one word on screen is off by a day or two and that is the only difference, repeat that step on another day. The helpers read the time zone saved in Settings, so they follow it if you change it in 13.7.
Where a step says `pretty "$(day 7)"` (or `day`, `mon`, `since`), run that command in the terminal and use what it prints (e.g. `11 Oct`): the screen shows exactly that.
**Home shows only the first 5 rows of each section.** Rows further down are reached with **See all** (the Due list); the row, the **⋯** sheet and the toasts work the same there. Steps say "Home" when the row is among the first 5 and "Due list" when it is not.
Reset to a clean start at any time with `cd backend && bun run db:reset` and `bun run bootstrap-admin ...` again.

## 1. First look: an empty gym (BR-REC-101, 130, 104) — do this BEFORE section 2

- [ ] **1.1** [G] Phone, Home `/admin`, no members yet. Sections in this order: **Overdue**, **Due soon**, then the membership sections (**Memberships ending**, **Recently ended**). Overdue shows no number and no "See all", one line **"Nobody is overdue."**; Due soon shows one line **"Nobody is due soon."**; no button inside the two sections. (BR-REC-101, 130)
- [ ] **1.2** [G] Open `/admin/due`: title "Due list" with a back arrow to Home; tabs **Overdue** and **Due soon** (Overdue chosen); chips **All**, **Body composition**, **Fitness test** (All chosen). Overdue tab: "Nobody is overdue."; Due soon tab: "Nobody is due soon." (BR-REC-104, 130)
- [ ] **1.3** [N] `/admin/due?tab=bogus` shows the Overdue tab; `/admin/due?type=not-an-id` shows **All** chosen and no error; `/admin/due?tab=soon` opens on Due soon.

## 2. Make the people (BR-REC-15, 95 — the set-up behind section 4)

Paste this block (it takes about 20 seconds; silent when it works). Every member joined 124 days ago and has a running membership unless said; **everything not named is recorded today**, so only the named measurement is ever due. Fran has its own repeat of 3 months and Visceral fat its own repeat of 2 weeks (the "Fran" and "2-week item" of the spec examples). Due soon is 7 days, Body composition repeats every 1 month, Fitness test every 2 months (the Setup defaults).
```
db -q -c "update metrics set interval_count = 3, interval_unit = 'month' where name = 'Fran'"
db -q -c "update metrics set interval_count = 2, interval_unit = 'week' where name = 'Visceral fat'"
kase "Case 01" "Body composition" "Weight" "$(last_for 1 month 7)"
kase "Case 02" "Body composition" "Weight" "$(last_for 1 month -3)"
kase "Case 03" "Fitness test" "Fran" "$(last_for 2 month 7)"
kase "Case 04" "Fitness test" "Pull-ups" none
kase "Case 05" "Body composition" "Weight" 2026-01-31
kase "Case 06" "Body composition" "Visceral fat" "$(last_for 2 week 1)"
kase "Case 07" "Body composition" "Weight" "$(last_for 1 month 0)"
kase "Case 08" "Body composition" "Weight|Body fat" "$(last_for 1 month -3)"
rec "Case 08" "Body composition" "$(last_for 1 month 5)" "Body fat"
kase "Case 09" "Body composition" "Height|Weight|BMI|Body fat|Resting metabolism" "$(last_for 1 month -10)"
kase "Case 10" "Body composition" "Weight" "$(last_for 1 month -3)" -2
kase "Case 11" "Body composition" "Weight" "$(last_for 1 month -3)" 5
kase "Case 12" "Fitness test" "*" "$(day 0)"
kase "Case 13" "Body composition" "Weight" "$(last_for 1 month -5)"
kase "Case 14" "Body composition" "Body age" none
kase "Case 15" "Fitness test" "*" "$(last_for 2 month -20)"
kase "Case 16" "Body composition" "Weight" "$(last_for 1 month -3)"
archive "Case 16"
mk "Case 17" 124
kase "Case 18" "Body composition" "Weight" "$(last_for 1 month -1)"
```
Case numbers 01…16 are the 16 due examples of the spec (same numbers). 17 (nothing ever recorded) and 18 (due yesterday) are extra, for the member page and for "1 day".

- [ ] **2.1** [G] `db -tA -c "select count(*) from members"` → `18`. Home (leave Home and come back, no reload needed): **Overdue 12**, **Due soon 3**. If the numbers differ, stop and re-run from `db:reset` (the rest of the numbers depend on it).
- [ ] **2.2** [note] A member name such as "Case 11" is what you look for in every list. In the lists the name sits on the first line, the assessment name under it.

## 3. Home S2: layout, rows, order (BR-REC-16, 96, 97, 101, 105, 139)

- [ ] **3.1** [G] Phone Home: Overdue title with the count **12** and **See all >** at the right; the **first 5** rows; then Due soon with **3** and **See all >** and its 3 rows; then the membership sections. The tab bar (Home, Members, Reports, Settings) is at the bottom.
- [ ] **3.2** [G] The first 5 Overdue rows, top to bottom: **Case 05**, **Case 04**, **Case 14**, **Case 17** (Body composition), **Case 17** (Fitness test). (Most days overdue first; the four 124-day rows by name A-Z, then Case 17's two assessments in setup order.) (BR-REC-97)
- [ ] **3.3** [G] Row anatomy, Case 05: name; under it the assessment name **Body composition**; chip **[Weight]**; at the right the words **"Overdue "** + the number from `since 2026-02-28` + **" days"**; at the far right a **⋯** button. The row is at least 56 px tall. (BR-REC-16, 105)
- [ ] **3.4** [G] Case 17 (Body composition): chips show the first few, then a **+N** chip; shown chips + N = **15**. Case 17 (Fitness test): shown + N = **14**. On a narrow phone fewer chips may show; the sum is what counts. (BR-REC-16)
- [ ] **3.5** [G] **See all** on Overdue → `/admin/due?tab=overdue`: 12 rows, top to bottom: Case 05 (the biggest number), Case 04, Case 14, Case 17, Case 17 (124 days each), Case 15 (20), Case 09 (10), Case 13 (5), then Case 02, Case 08, Case 11 (3 each, A-Z), then **Case 18 reading "Overdue 1 day"** (singular). Numbers never go up as you read down. (BR-REC-97, 105)
- [ ] **3.6** [G] Due soon tab: **Case 07 "Due today"**, **Case 06 "Due tomorrow"**, **Case 01 "Due in 7 days"** (soonest first). Someone due today is here, not in Overdue. (BR-REC-96, Q3)
- [ ] **3.7** [G] Desktop >= 1024 px: Home in two columns, the two due sections on the left, the membership sections on the right; content centred and at most 1080 px wide, also at 1920 px. (BR-REC-139)
- [ ] **3.8** [note] Memberships ending should list Case 11 (ends in 5 days) and Recently ended Case 10 (ended 2 days ago); those two sections belong to the members stream. Tell the owner if either is missing.

## 4. The 16 due examples as screens (BR-REC-15…18, 93…96, 98, 99, 105)

Each item names where to look. Items marked "(changes data)" move the people, so do them in order. After a SQL step, leave Home and come back (no manual reload needed: every due list is read fresh on each visit, C13).

- [ ] **4.1** Case 1 [G] **Case 01** is in **Due soon** (not Overdue): chip [Weight], words **"Due in 7 days"**. (Weight due in 7 days; BR-REC-96)
- [ ] **4.2** Case 2 [G] **Case 02** is in **Overdue**: chip [Weight], **"Overdue 3 days"**. (BR-REC-105)
- [ ] **4.3** Case 3 [G] **Case 03** is in **neither** list: Fran was last done about 7 weeks ago and has its own 3-month repeat, so it is not due (with the assessment's 2 months it would be "Due in 7 days"; 13.2 proves that). Its member page (open it from Home search "Case 03") shows Fitness test as "Next due ..." about 5 weeks away. (BR-REC-14, 15)
- [ ] **4.4** Case 4 [G] **Case 04** is in Overdue: second line **Fitness test**, chip **[Pull-ups]**, **"Overdue 124 days"** (never recorded: due on the join date, no interval added). (BR-REC-15, 105)
- [ ] **4.5** Case 5 [G] **Case 05** (Weight last 31 Jan 2026): Overdue, the number of days equals `since 2026-02-28`, because 31 Jan + 1 month = 28 Feb. A number 2 or 3 smaller means the month clamp is wrong. (BR-REC-94)
- [ ] **4.6** Case 6 [G] **Case 06** in Due soon: chip **[Visceral fat]**, **"Due tomorrow"** (a 2-week item last done 13 days ago). (BR-REC-94, 127)
- [ ] **4.7** Case 7 [G] **Case 07** in Due soon: **"Due today"**, and **not** in Overdue. (Q3)
- [ ] **4.8** Case 8 [G] **Case 08**: **one** row in Overdue (not a second one in Due soon): **"Overdue 3 days"**, chips **[Weight] [Body fat]** (Weight due 3 days ago, Body fat in 5 days). One row per member per assessment. (BR-REC-16)
- [ ] **4.9** Case 9 (changes data) [G] **Case 09** in Overdue, chips (setup order) Height, Weight, BMI, Body fat, Resting metabolism (first few + "+N", total 5), **"Overdue 10 days"**. Now `[SQL]` "3 of 5 saved today": `rec "Case 09" "Body composition" "$(day 0)" "Height|Weight|BMI"` → leave Home, come back: the row **stays** with **2 chips** (Body fat, Resting metabolism), still "Overdue 10 days". Then `rec "Case 09" "Body composition" "$(day 0)" "Body fat|Resting metabolism"` → the row is **gone**. `[needs D]` the real form version is 15.2. (BR-REC-16)
- [ ] **4.10** Case 10 [G] **Case 10** (membership ended 2 days ago, Weight overdue) is **in no due list** (Home, Due list, both tabs). Its member page (Home search "Case 10") still shows the **Assessments** block with Body composition "Overdue 3 days". (BR-REC-17, 103)
- [ ] **4.11** Case 11 [G] **Case 11** (membership ends in 5 days, "Ends soon") **is** in Overdue, "Overdue 3 days". (BR-REC-17)
- [ ] **4.12** Case 12 (changes data) [G] Nothing is due for **Case 12**, so no row exists. Open its member page (Home search "Case 12"): Fitness test reads "Next due" + `pretty "$(mon 2)"`. Tap that line's **⋯** → **Assess soon** → toast **"Marked Assess soon."**, the line's words become **"Assess soon"**. Home: Overdue has one more row, **first in the list**: "Case 12", "Fitness test", **"Assess soon"**, chips = **all 14 fitness items** (shown + N = 14; Fran is among them even though it is not due). (BR-REC-98, 97)
- [ ] **4.13** Case 13 (changes data) [G] On the **Due list** (See all): **Case 13** in Overdue, "Overdue 5 days". Its **⋯** → **Remind me later ›** → **Pick a date** → `day 16` (a date about 2 weeks out, like "20 Oct") → **Set reminder** → toast "Reminder set for " + `pretty "$(day 16)"` + "."; the row **disappears at once**, also from `/admin/due`. `ov` shows the reminder. Then `[SQL]` `remind_to "Case 13" "$(day 1)"` → Home again: still hidden (hidden until the day before the end date); `remind_to "Case 13" "$(day 0)"` → Home again: **Case 13 is back**, "Overdue 5 days" (on the end day it is back). Its member page no longer says "Reminder on". (BR-REC-18, 99, C7)
- [ ] **4.14** Case 14 (changes data) [G] **Case 14** in Overdue: chip **[Body age]**, "Overdue 124 days". Settings → Assessments → Body composition → **Body age** → switch **On** off → Save. Home: **Case 14's row is gone**, and **Case 17's Body composition** chips now total **14** (Body age is never a chip). Turn Body age **On** again: both are back. (BR-REC-95)
- [ ] **4.15** Case 15 [G] Done in 8.1…8.4 (Assess soon, a back-filled save keeps it, a save dated today ends it).
- [ ] **4.16** Case 16 [G] **Case 16** (archived, Weight overdue 3 days) is in **no due list**. Its member page still shows the Assessments block: Body composition "Overdue 3 days" (the page answers for every member). (BR-REC-17, 103)

## 5. Assess soon from a row (BR-REC-18, 97, 98, 100, 102, 133; C4, C12)

- [ ] **5.1** [G] Phone Home: tap **⋯** on **Case 14** (3rd Overdue row, chip [Body age]). A **bottom sheet** opens: title **"Case 14"**, under it **"Body composition"**; choices **Record assessment**, **Assess soon**, **Remind me later ›**, **Open member**. No "Remove" choice. (BR-REC-102, 138)
- [ ] **5.2** [G] Tap **Assess soon**: the sheet closes, toast **"Marked Assess soon."**, **no** "Are you sure?". The row jumps to the **top of Overdue at once** (no wait): words **"Assess soon"**, chips = every Body composition measurement (shown + N = **15**, before it was just [Body age]), the count stays the same. (BR-REC-98, 133)
- [ ] **5.3** [G] Order: Assess soon rows come first (Case 14, then Case 12 from 4.12; the one with the earlier due date first), then the normal order (Case 05 ...). Leave Home and come back: same. `ov` → Case 14, Body composition, `flag`, set_on today, no until_on. (BR-REC-97)
- [ ] **5.4** [G] **⋯** on the flagged Case 14: the choice now reads **Remove Assess soon** (not "Assess soon"). Tap it → toast **"Removed."**; the row goes back to its normal place (3rd) with **"Overdue 124 days"** and chip [Body age]. `ov` has no Case 14 row.
- [ ] **5.5** [G] Assess soon on someone who is only **Due soon**: Home Due soon, **Case 01 ⋯ → Assess soon**. The row **leaves Due soon** and appears in **Overdue at the top** with "Assess soon" and 15 chips (an Assess soon row is never in Due soon, whatever its dates). **⋯ → Remove Assess soon** → back in Due soon, "Due in 7 days". (BR-REC-18, C4)
- [ ] **5.6** [G] Archived: open Case 16's member page (Home search "Case 16"), Body composition **⋯ → Assess soon** → toast and the line says "Assess soon"; Home Overdue does **not** get a new row (archived stay off the lists). **⋯ → Remove Assess soon** to clean up. (BR-REC-17, C9)
- [ ] **5.7** [G] Audit: `db -c "select action, count(*) from audit_log where action like 'due_override.%' group by 1"`; do one Assess soon and look again: `due_override.set` is one higher; do one Remove: `due_override.clear` is one higher. (BR-REC-158 via C9)

## 6. Remind me later (BR-REC-18, 99; C7, C8)

`[note]` The three quick choices and the limits of **Pick a date** are worked out on the **device** from its own calendar day (decision D-021), while the list words ("Overdue 3 days") come from the server's gym day (BR-REC-93). Run this section on a device set to the gym's time zone (India). From another zone the dates can be one day off near midnight; that is the known choice, not a fail, but tell the owner.

- [ ] **6.1** [G] Due list: **Case 11 ⋯ → Remind me later ›**: the **same sheet** shows a second step (no second sheet on top): a **Back** control and the choices **1 week**, **2 weeks**, **1 month**, each with its date (`pretty "$(day 7)"`, `pretty "$(day 14)"`, `pretty "$(mon 1)"`), and **Pick a date**. (C12)
- [ ] **6.2** [G] **Back** returns to the first step. Close the sheet with the X, with Back (browser/Android) or by swiping down: the **whole** sheet closes. Open **⋯** again: it starts on the **first** step. (BR-REC-138)
- [ ] **6.3** [G] **1 week** (Case 11): sheet closes, toast **"Reminder set for " + `pretty "$(day 7)"` + "."**, the row **disappears at once**; Overdue count down by one; `/admin/due` has no Case 11 either (hidden everywhere). `ov` → `snooze`, until_on = `day 7`. (BR-REC-99)
- [ ] **6.4** [G] **2 weeks** (Case 08, one row with two chips): same; until_on = `day 14`.
- [ ] **6.5** [G] **1 month** (Case 18): same; until_on = `mon 1` (the same day next month; 31 Jan + 1 month would be 28 Feb). (BR-REC-94, 99)
- [ ] **6.6** [N] **Pick a date** on **Case 04** (Fitness test): the step shows a date field **"Remind me on"** and a **Set reminder** button. Each of these keeps the sheet open, shows one plain sentence under the field and saves nothing (`ov` unchanged): empty; today (`day 0`); yesterday; **`day 91`** (a sentence about at most 90 days, never a code such as SNOOZE_TOO_FAR). If a phone's date picker will not let you choose the date, that is fine. (BR-REC-99, C8)
- [ ] **6.7** [G] **Edge of 90 days**: Case 04 again, **`day 90`** → accepted: toast "Reminder set for " + `pretty "$(day 90)"` + "." (this date is in next year from 3 Oct on, so the **year shows**, e.g. "2 Jan 2027"); row hidden; `ov` until_on = `day 90`. Leave this reminder on until 9.4. (BR-REC-99, 127)
- [ ] **6.8** [G] A reminder hides the row **everywhere** (Home and both tabs of the Due list) and shows on the member page as **"Reminder on ..."** (Case 11: `pretty "$(day 7)"`). (BR-REC-99, 103)
- [ ] **6.9** [G] The first valid day: Case 06 (Due soon) **⋯ → Remind me later › → Pick a date →** tomorrow (`day 1`) → accepted, toast "Reminder set for " + `pretty "$(day 1)"` + "."; the row leaves Due soon at once. Its member page: Body composition "Reminder on ..." → **⋯ → Remove reminder** → "Removed.", the line says "Due tomorrow" again, the row is back in Due soon. (BR-REC-99, 100)
- [ ] **6.10** [G] No question is asked anywhere in sections 5 and 6 (only archive, change of "better" and a change of repeat ask). (BR-REC-133)

## 7. They replace each other; clear from the member page (BR-REC-100)

Needs from earlier: Case 11 has a 1-week reminder (6.3), Case 08 a 2-week one (6.4).

- [ ] **7.1** [G] Member page of **Case 11** (Home search "Case 11" → tap the result): section **Assessments**, in setup order: Body composition **"Reminder on " + `pretty "$(day 7)"`**, Fitness test "Next due ...". Body composition **⋯** → sheet titled **"Body composition"** with **Record assessment**, **Assess soon**, **Remind me later ›**, **Remove reminder**; **no "Open member"**. (C12)
- [ ] **7.2** [G] Tap **Assess soon**: the line becomes **"Assess soon"** at once (reminder gone), toast "Marked Assess soon."; Home: **Case 11 is back, at the top of Overdue**. `ov` → one row for Case 11, `flag`, no until_on. (BR-REC-100)
- [ ] **7.3** [G] Same line **⋯**: now **Remove Assess soon** and **Remind me later ›** are offered, **no** Remove reminder. **Remind me later › → 2 weeks**: the line becomes **"Reminder on " + `pretty "$(day 14)"`**, the Assess soon is gone, Home no longer shows Case 11. `ov` → one row, `snooze`, until `day 14`. (BR-REC-100)
- [ ] **7.4** [G] **⋯ → Remove reminder** → toast **"Removed."**; the line is back to dates, **"Overdue 3 days"**; Home shows Case 11 again at its normal place; `ov` has no Case 11 row. (BR-REC-100)
- [ ] **7.5** [G] From a list: Home Overdue **Case 17 (Body composition) ⋯ → Assess soon** (row on top), then **⋯** again → **Remind me later › → 1 week**: the Assess soon is replaced, the row leaves the list; `ov` → one `snooze` row for Case 17, Body composition. Open its member page → **Remove reminder** to clean up. (BR-REC-100)
- [ ] **7.6** [G] One row per member and assessment: on **Case 02**'s member page do **Assess soon**, then **Remind me later › → 1 week**, then **Assess soon** again; `ov` shows exactly **one** Case 02 row (`flag`). **Remove Assess soon** at the end.

## 8. A save ends Assess soon or a reminder; a back-fill does not (BR-REC-98, 99; C6)

Real saves come from stream D's form; until then `rec` writes the same rows a save writes (the date of the result and the moment it was saved). Section 15 repeats this with the real form. Case 15 is Overdue 20 days with 13 due items (Fran, with its own 3 months, is not due; Assess soon will show all 14).

- [ ] **8.1** [G] Due list: **Case 15 ⋯ → Assess soon**: row on top, "Assess soon", chips total **14**. (Case 15 of the spec: Assess soon set today.)
- [ ] **8.2** [SQL] **Back-fill** dated before today: `rec "Case 15" "Fitness test" "$(day -100)" "*"` → leave Home and come back: **still "Assess soon"**, still on top, chips 14; the member page also says "Assess soon". A saved result dated older than the day it was set does not end it. (BR-REC-98, spec case 15)
- [ ] **8.3** [SQL] **A save dated today**: `rec "Case 15" "Fitness test" "$(day 0)" "*"` → Home again: Case 15 is **gone** from Overdue (all fitness items recorded today, nothing due); its member page: Fitness test reads **"Next due " + `pretty "$(mon 2)"`** (not "Assess soon"). `ov` **still lists** the Case 15 row (it ended by reading, nothing was deleted). (BR-REC-98)
- [ ] **8.4** [G] Set Assess soon again for Case 15 (member page ⋯): the line says **"Assess soon"** again and stays: the earlier save is older than the new Assess soon, so it does not end it. (C6: setting again replaces the row)
- [ ] **8.5** [SQL] Reminder, same rule. **Case 08** has a 2-week reminder (6.4): its member page says "Reminder on ...". `rec "Case 08" "Body composition" "$(day -100)" "*"` → the line still says "Reminder on ..." (back-fill). `rec "Case 08" "Body composition" "$(day 0)" "*"` → the line says **"Next due " + `pretty "$(day 14)"`** (Visceral fat's own 2 weeks): the reminder ended. (BR-REC-99, C6)

## 9. Member page "Assessments" block S7 (BR-REC-103, 125, 127; C10)

Open each person from Home search (type the name, tap the result), or `echo $APP/admin/members/$(mid "Case 02")`.

- [ ] **9.1** [G] **Case 02**: two lines in setup order. Body composition **"Overdue 3 days"** + chip [Weight]; Fitness test **"Next due " + `pretty "$(mon 2)"`** (no chips). Each line has a **⋯**.
- [ ] **9.2** [G] **Case 07** Body composition **"Due today"**; **Case 06** **"Due tomorrow"**; **Case 01** **"Due in 7 days"**. (`Case 01`'s Assess soon from 5.5 was removed.)
- [ ] **9.3** [G] **Case 17** (nothing ever recorded): both lines **"Never recorded"** (not "Overdue 124 days", although the same row on Home says "Overdue 124 days"); chips of every measurement. (Owner answer Q5 / C10)
- [ ] **9.4** [G] **Case 04**: Fitness test shows **"Reminder on " + `pretty "$(day 90)"`** (from 6.7; the year shows when it is next year); Body composition **"Next due " + `pretty "$(day 14)"`**. **Case 12**: Fitness test **"Assess soon"** (from 4.12). **Case 05**: "Overdue " + the number from `since 2026-02-28` + " days". Then on Case 04: Fitness test **⋯ → Remove reminder** (clean-up for section 13).
- [ ] **9.5** [G] Case 10 (ended) and Case 16 (archived) show the block as well. (BR-REC-17)
- [ ] **9.6** [G] One main action only: the page's own **Record assessment** (phone: the bar above the tabs; desktop: right of the header). The block has no second big button. (BR-REC-121)
- [ ] **9.7** [G] Each status is ONE badge with words (and colour and icon), never colour alone; the six forms: "Assess soon", "Reminder on 11 Oct", "Never recorded", "Overdue 3 days", "Due today / tomorrow / in 5 days", "Next due 12 Dec". (BR-REC-125)
- [ ] **9.8** [SQL] The spec's "Fran-only fitness test → Next due 10 Nov" (BR-REC-103): turn every fitness measurement off except Fran: `db -q -c "update metrics set is_active = false where name <> 'Fran' and type_id = (select id from assessment_types where name = 'Fitness test')"`. **Case 03** member page: Fitness test reads **"Next due "** + the date from `db -tA -c "select (max(v.measured_on) + interval '3 month')::date from measurements v join metrics x on x.id = v.metric_id join members m on m.id = v.member_id where x.name = 'Fran' and m.full_name = 'Case 03'"` (formatted with `pretty`), no chips. Put them back: `db -q -c "update metrics set is_active = true where type_id = (select id from assessment_types where name = 'Fitness test')"`. (BR-REC-103, 95)

## 10. Due list S3 (BR-REC-104; C11)

- [ ] **10.1** [G] Home Overdue **See all** → `/admin/due?tab=overdue`; Home Due soon **See all** → `/admin/due?tab=soon`. Header "Due list", back arrow → Home. Tabs, then chips **All**, **Body composition**, **Fitness test**. Same rows as Home; same **⋯** sheet; tapping a row = same target as Home (section 11).
- [ ] **10.2** [G] Chip **Fitness test** → only rows whose second line is "Fitness test"; the URL gets `type=<id>` (`tid "Fitness test"`); **Body composition** → only those; **All** → both again. A tab switch keeps the chosen chip. (BR-REC-104)
- [ ] **10.3** [G] Due soon tab + chip **Fitness test** → **"Nobody is due soon."** (nobody has a fitness test due soon). (BR-REC-130)
- [ ] **10.4** [slow] DevTools "Slow 3G": tap the other tab or another chip → the **old rows stay, dimmed**, until the new rows arrive; tabs and chips do not move. (screens S3)
- [ ] **10.5** [G] Paging. `bulk 15` (30 more overdue rows: 15 people, two assessments each). Home Overdue count goes up by 30. Open `/admin/due?tab=overdue`: **25 rows**, then a **Show more** button. Tap it: it reads **"Loading…"** while it works, the next rows appear **under** the first 25 (the first rows do not jump); the button disappears when everything is shown. Order: the biggest numbers first (Bulk rows sit between the 124-day rows and the 20-day one, names A-Z with two rows per person). (BR-REC-104)
  **Clean up before going on** (the later sections expect the normal rows): `db -c "delete from due_overrides where member_id in (select id from members where full_name like 'Bulk %'); delete from membership_periods where member_id in (select id from members where full_name like 'Bulk %'); delete from members where full_name like 'Bulk %'"`.
- [ ] **10.6** [N] Failed page: DevTools block `*page=2*`, reload `/admin/due`, tap **Show more** → **"Couldn't load this."** with **Try again** under the 25 rows (the rows stay); unblock → Try again → the rest appears.
- [ ] **10.7** [N] Block `*assessment-types*` and reload the Due list: rows still load, only the **All** chip shows (no assessment chips). Unblock + reload → chips return. (screens S3)
- [ ] **10.8** [G] Optional, for a feel of a full gym, **after section 14**: `cd backend && bun run seed:perf` (adds 1,000 members with 3 years of history; never deletes; `bun run db:reset` removes them). Home opens as fast as it did, the counts are big, **See all** shows 25 rows per page and **Show more** keeps working. It makes the Case rows hard to find, so do it last.

## 11. The tap path to the entry form (BR-REC-102, 140)

- [ ] **11.1** [G] Phone Home: **one tap** on the **Case 04** row (Fitness test) opens `/admin/members/<Case 04 id>/assess?type=<Fitness test id>`: check the URL against `mid "Case 04"` and `tid "Fitness test"`. **Until stream D is merged** this lands on a placeholder page (that is expected, not a fail); after D it is the **Record assessment form** for Case 04 with Fitness test already chosen. `[needs D]` for the real form. (BR-REC-102, 140; the spec summary's "2 taps" is: tap the row, and one more tap or the first entry in the form; the UX budget says 1 tap to the form, and the row tap does that)
- [ ] **11.2** [G] **⋯ → Record assessment** goes to the **same page** (2 taps). Case 17's two rows (Body composition, Fitness test) land on **different** `type=` values. (BR-REC-102)
- [ ] **11.3** [G] **⋯ → Open member** (lists only) opens `/admin/members/<id>`; back returns to Home. On the member page's own sheet there is no "Open member". (C12)
- [ ] **11.4** [G] Back from the entry page to Home: the lists are read again (fresh), so a row you just changed shows its new state. (C13)
- [ ] **11.5** [G] Keyboard on Desktop: Tab to a row, **Enter** opens the entry page; Tab to **⋯**, Enter opens the sheet. (BR-REC-137)

## 12. Errors and undo (BR-REC-131, 133; C13, performance tactic 8)

- [ ] **12.1** [N] Per-section error: DevTools block `*status=overdue*`, reload Home. **Overdue** shows **"Couldn't load this."** with **Try again**; **Due soon** and the membership sections load normally; the search field and tab bar work. Unblock, tap **Try again** → the Overdue rows appear (the Network tab shows one request; the other sections do not reload). (BR-REC-131)
- [ ] **12.2** [N] Same with `*status=upcoming*`: only **Due soon** fails; Overdue is fine.
- [ ] **12.3** [N] **Stop the API** (Ctrl+C in its terminal), reload Home: every section shows **its own** "Couldn't load this." + **Try again**; the page frame stays. Tap Try again while the API is still stopped → the error stays, nothing crashes. Start the API again (`bun run dev`) → Try again on each section → rows appear. (BR-REC-131)
- [ ] **12.4** [N] Due list: block `*status=overdue*`, reload `/admin/due` → "Couldn't load this." + Try again where the rows go; header, tabs and chips still work (the Due soon tab loads).
- [ ] **12.5** [N] Member page: block `*/due` (a URL ending in `/due`), reload a member page → the **Assessments** block shows "Couldn't load this." + Try again; the rest of the page works. Unblock, Try again → lines appear.
- [ ] **12.6** [N] **Undo on a failed save, no answer from the server.** Home loaded. Block `*due-actions*`. **Case 17 (Fitness test) ⋯ → Assess soon** (5th Home row): the row jumps to the top at once, then (when the call fails) goes **back to its old place** and a toast says **"Couldn't save this. Try again."** (a plain sentence, no code). `ov` has no Case 17 row. The lists are read again afterwards (Network tab). (C13)
- [ ] **12.7** [N] Same with **Remind me later › → 1 week** on Case 17 (Fitness test): the row disappears, then **comes back** with the toast.
- [ ] **12.8** [N] Same on the member page: Case 02, Body composition **⋯ → Assess soon** → the line says "Assess soon", then goes back to "Overdue 3 days" with the toast. Unblock `*due-actions*`.
- [ ] **12.9** [N] Same with the **API stopped** instead of blocked (the same toast). Start it again.
- [ ] **12.10** [N] **Failure with an answer from the server (404).** `mk "Case 98 Gone" 300` (never recorded, joined 300 days ago: two rows at the top of Overdue). Open Home, **then** delete the person: `db -c "delete from membership_periods where member_id = (select id from members where full_name = 'Case 98 Gone'); delete from members where full_name = 'Case 98 Gone'"`. Tap **⋯ → Assess soon** on the stale row: the row jumps, then comes back with a toast that is **one plain sentence** (never "NOT_FOUND", "404" or a code); after the lists are read again the row is **gone**. (BR-REC-128)
- [ ] **12.11** [G] Unblock everything and make sure nothing is left half-set: `ov` shows only rows you meant to keep.

## 13. Setup changes show at once; time zone (BR-REC-15, 93, 95, 96; C13)

Settings screens are the setup stream's; here we only look at what Home and the Due list do next. Every change shows the next time you open Home (no reload, no sign-out).

- [ ] **13.1** [G] (Body age: 4.14 already did it.) **Fitness test Off**: Settings → Assessments → Fitness test → Edit → **On** off → Save. Home, Due list and member pages show **no fitness rows or lines** (Case 04, Case 12, Case 15 and Case 17's fitness row are gone; Case 12 and 15 were Assess soon), the Due list chip **Fitness test** is gone; turn it **On**: all back. (BR-REC-95)
- [ ] **13.2** [G] **Fran's own repeat.** Settings → Assessments → Fitness test → **Fran** → Repeat **Same as assessment** → Save → confirm "Change the repeat?". Home Due soon: **Case 03** appears, chip **[Fran]**, **"Due in 7 days"**. Set Fran back to **Own repeat 3 months** (confirm): Case 03 leaves. (BR-REC-14, 15; spec case 3)
- [ ] **13.3** [G] **A changed repeat updates everyone at once** (nothing is stored). Settings → Body composition → Edit → Repeat `1` → `2` months → Save → confirm. Home: Due soon keeps only **Case 06** (Visceral fat has its own 2 weeks); **Case 07** and **Case 01** are gone. Overdue: **Case 02**, **Case 11** and **Case 13** are gone (their only due item was the 1-month Weight); **Case 05** is still there with a smaller number (`since 2026-03-31`); **Case 04, 14, 17** are unchanged at 124 days (never recorded: due on the join date, no interval); the two Assess soon rows (Case 12, 15) stay on top. Put the repeat back to `1` month (confirm): they all come back. (BR-REC-15, 70)
- [ ] **13.4** [G] **Both assessments Off**: Home shows **"Nobody is overdue."** and **"Nobody is due soon."**; a member page shows **"No assessments yet."** in the Assessments block. Turn both **On**. (BR-REC-95, 130)
- [ ] **13.5** [G] **Due soon days.** Settings → Reminders & gym → Due soon `7` → `3` → Save. Home: **Case 01** (due in 7 days) leaves Due soon; Case 06 and Case 07 stay. Set `0`: only **Case 07 ("Due today")** stays. Put it back to `7`. (BR-REC-96)
- [ ] **13.6** [G] Setup changes are read on the next visit, with no waiting: after each change above, a plain tap on Home in the tab bar is enough. (C13)
- [ ] **13.7** [G] **"Today" is the gym's day, not the browser's** (BR-REC-93). `db -c "select (now() at time zone 'Asia/Kolkata')::date as kolkata, (now() at time zone 'Pacific/Kiritimati')::date as kiritimati, (now() at time zone 'Pacific/Pago_Pago')::date as pago_pago"`: at least one of the last two differs from Kolkata. In Settings → Reminders & gym set the Time zone to that one → Save.
  If its date is **one day later** than Kolkata's: **Case 07** reads "Overdue 1 day", Case 06 "Due today", Case 02 (on the Due list) "Overdue 4 days".
  If **one day earlier**: **Case 07** reads "Due tomorrow", Case 06 "Due in 2 days", Case 02 (on the Due list) "Overdue 2 days", and **Case 01 leaves Due soon** (it is now 8 days away).
  Put `Asia/Kolkata` back and Save. (BR-REC-93, 105)

## 14. Look, feel, words, access (ux BR-REC-122, 125…127, 129…133, 137, 138, on S2, S3, the row sheet and the member block)

- [ ] **14.1** [G] **44 px targets** (DevTools: select the element and read the box; also thumb-test on a real phone): the **⋯** button, the tabs **Overdue / Due soon**, every filter chip, **See all**, **Show more**, **Try again**, each choice in the sheet, **Back**, **Set reminder**, the sheet's X. At least 44 x 44 px (a smaller drawn chip still has a 44 px hit area), 8 px between neighbours; rows at least 56 px; the date field and buttons 48 px tall. (BR-REC-122)
- [ ] **14.2** [slow] **Loading shapes** (DevTools "Slow 3G", reload): Home shows **grey rows in each section** (no full-page spinner), the Overdue grey block about as tall as **5 real rows**; when the rows arrive, the sections below do **not** jump. Due soon has only 3 rows so it ends shorter than its grey block; `[note]` tell the owner if that jump looks wrong. Due list: header, tabs and chips stay put while grey rows turn into rows. Member page: grey lines in the Assessments block, the rest of the page unchanged. (BR-REC-129)
- [ ] **14.3** [G] **Words** (BR-REC-126, 127): read every label, line, toast and spoken name on Home, Due list, the sheet and the member block. Allowed: Overdue, Due soon, Assess soon, Remind me later, Reminder on, Never recorded, Next due, Record assessment, Open member, See all, Show more, Try again. **Not** allowed: "flag", "snooze", "upcoming", "metric", "interval", "payload", codes in capitals (`NOT_FOUND`, `SNOOZE_TOO_FAR`, `VALIDATION_ERROR`). Formats: "Overdue 1 day" / "Overdue 3 days", "Due today", "Due tomorrow", "Due in 7 days", dates like "11 Oct" (no year this year; a date in next year shows it).
- [ ] **14.4** [G] **Never colour alone** (BR-REC-125): DevTools → Rendering → "Emulate vision deficiency: achromatopsia": every status (Assess soon, Overdue N days, Due today / tomorrow, Next due, Reminder on, Never recorded) is still readable by its **words** and has an **icon**; the Assess soon, Overdue and Due rows are still distinguishable.
- [ ] **14.5** [G] **Sheet vs dialog** (BR-REC-138): Phone (< 1024 px): **⋯** opens a **bottom sheet**, the tab bar hidden while it is open; Back / swipe down closes it. Desktop >= 1024 px: a **centred dialog**; X and **Esc** close it; focus returns to the **⋯** that opened it; Tab does not leave the dialog. At the **Remind me later** step, Back / swipe / X / Esc close the **whole** sheet (not just the step).
- [ ] **14.6** [G] **No confirmation** for Assess soon, Remind me later, Remove (BR-REC-133): each acts at once with a toast (already seen in 5, 6, 7); nothing says "Are you sure?".
- [ ] **14.7** [G] **Dark theme** (Settings → Theme → Dark): walk Home (both due sections, with an Assess soon row), the Due list, the sheet at **both** steps, the date field with an error, the toasts, the member block (every status). Everything readable; the badges keep words + icon. Run **axe** (browser extension) on Home, Due list and the member page, with the sheet open once, in **light and dark**: 0 contrast issues, 0 serious. (BR-REC-124 via ux, 137)
- [ ] **14.8** [G] **200 % text zoom** (desktop browser zoom 200 %; on a phone the largest text size / Display Zoom): Home, Due list, member block and the sheet at both steps: no sideways scrolling, no clipped words ("Overdue 124 days" stays whole), the sheet scrolls inside itself and every choice and **Set reminder** can still be reached, the **⋯** stays tappable. (BR-REC-137)
- [ ] **14.9** [G] **Narrow 360 px** and **long names**: `mk "Longname Abcdefghijabcdefghijabcdefghijabcdefghij" 400` (Overdue twice, at the top of Home). Home, Due list and member page: no sideways scroll; the name wraps or is cut, the **status words stay readable** and the **⋯** stays visible and 44 px. (BR-REC-139, 122)
- [ ] **14.10** [G] **Desktop 1920 px**: Home and Due list content at most 1080 px wide, centred, never edge to edge (also 3.7). (BR-REC-139)
- [ ] **14.11** [G] **Keyboard only (Desktop)**: Tab reaches rows, **⋯**, tabs, chips, **Show more**, **See all**; focus ring always visible; Enter opens a row; in the sheet Tab/Shift-Tab stay inside, Enter picks a choice; Esc closes. (BR-REC-137)
- [ ] **14.12** [G] **Screen reader** (VoiceOver iPhone Safari, TalkBack Android Chrome, NVDA or VoiceOver on Desktop): the **⋯** reads **"More for Case 14"** (member page: **"More for Body composition"**); a row reads name, assessment, chips and status words; the sheet reads its title and each choice ("Remind me later, button"); tabs and chips read which one is chosen; the empty lines and errors are read; toasts ("Marked Assess soon.", "Removed.", "Reminder set for ...", "Couldn't save this. Try again.") are announced when they show. (BR-REC-137)
- [ ] **14.13** [G] Reduce motion on in the system → the sheet and toasts appear without sliding. (BR-REC-137)
- [ ] **14.14** [G] **Offline** (BR-REC-132): DevTools → Network → **Offline** with Home open: within 2 seconds a thin banner says **"You're offline — changes can't be saved right now"**. Open a row's **⋯ → Remind me later › → Pick a date**, type a date: the typed date stays; tap **Set reminder** → the row disappears, then comes back with the toast of 12.6 (plain sentence, nothing saved). Go back online: the banner goes away. (BR-REC-132)
- [ ] **14.15** [G] Every list that has a loading, empty or error state showed the right one: Home 1.1, 12.1…12.3; Due list 1.2, 10.3, 12.4; member block 12.5, 13.4. (BR-REC-129, 130, 131)
- [ ] **14.16** [note] The member page sheet's title is the assessment name and "the line under it" should also be the assessment name (screens). Tell the owner if the title and the second line repeat each other and look odd.

## 15. Later — when stream D (assessments) is merged `[needs D]`

- [ ] **15.1** [needs D] 11.1: tapping a Home row opens the real Record assessment form for **that member** with **that assessment** already chosen; no member or assessment to pick; Home → form is **1 tap**. Case 17's two rows open two different assessments. (BR-REC-102, 140)
- [ ] **15.2** [needs D] Partial save with the real form (the Case 9 row): `kase "Case 19" "Body composition" "Height|Weight|BMI|Body fat|Resting metabolism" "$(last_for 1 month -10)"`; Home shows Case 19 with 5 chips. Open it (1 tap), enter **3** of the 5, Save → back on Home (no reload): the row **stays with 2 chips**; open it again, enter the last 2, Save → the row is **gone**. (BR-REC-16)
- [ ] **15.3** [needs D] **Assess soon ends by a real save** (this is the check for issue #24: a save that does not touch the assessment's "saved at" time would never end it): a member with a row on the Due list (e.g. Case 02 ⋯ → Assess soon). Record an assessment **dated before today** (back-fill) → Home: still "Assess soon". Record one **dated today** → the row leaves and the member page says "Next due ...". (BR-REC-98, spec case 15)
- [ ] **15.4** [needs D] **A reminder ends by a real save**: set a reminder (e.g. 2 weeks) on another member; back-filled save → still "Reminder on ..."; a save dated today → the line says "Next due ...". (BR-REC-99)
- [ ] **15.5** [needs D] **Editing counts as saving**: set Assess soon, then **edit** an assessment dated today for that member (assessments stream edit) and save → the Assess soon ends (a save or an edit made after it was set and dated on or after that day, C6). `[note]` if the edit screen does not exist yet, tell the owner.
- [ ] **15.6** [needs D] After a real save, Home and the member page show the new state on the next visit with no reload (due lists are read fresh each visit). (C13)

## Coverage

| BR | Section(s) | BR | Section(s) | BR | Section(s) |
|---|---|---|---|---|---|
| 15 | 4, 13 | 16 | 3, 4, 15 | 17 | 4, 5, 9 |
| 18 | 4, 5, 6, 7 | 93 | 13 | 94 | 4, 6 |
| 95 | 4, 13 | 96 | 3, 4, 13 | 97 | 3, 5 |
| 98 | 4, 5, 8, 15 | 99 | 4, 6, 8, 15 | 100 | 7 |
| 101 | 1, 3, 12 | 102 | 5, 11, 15 | 103 | 4, 9 |
| 104 | 1, 10 | 105 | 3, 4, 13 | ux 122 | 14 |
| ux 125, 126, 127 | 9, 14 | ux 129, 130, 131 | 1, 10, 12, 14 | ux 132 | 14 |
| ux 133 | 6, 14 | | | | |
| ux 137 | 11, 14 | ux 138 | 5, 6, 14 | ux 140 | 11, 15 |
| C13 (fresh data, undo) | 4, 11, 12, 13 | | | | |
