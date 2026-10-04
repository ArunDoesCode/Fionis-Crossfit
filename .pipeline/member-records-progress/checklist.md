# member-records/progress · manual test checklist

Spec: `docs/specs/member-records/progress.md` v2 (BR-REC-22…24, 106…119 + build clarifications P1…P14) + `ux.md` v1 (BR-REC-120…140 on S12, S13, S18).
Written from the spec rules and the build's screen notes (URLs, words and roles only). The server rules (E35…E39 numbers, ranks, CSV cells, row counts) have automated tests;
this list is for what no test reaches: the three screens, print on paper, the phone and desktop layouts, bookmarkable filters, the real download, themes, zoom and screen readers.
Tags: `[G]` golden path · `[N]` negative path · `[API]` a `curl` check of the same rule · `[slow]` needs real waiting or the 1,000-member data set · `[note]` the spec is silent, tell the owner, not a fail · `[later]` belongs to another stream's screen, do it when that stream is merged.
Time (estimate): sections 1…4 about 35 minutes (Desktop + real phone), 5…9 about 45 minutes, 10 about 20 minutes, 11 about 15 minutes, 12 about 40 minutes with real devices.
Words: "Measurement" in the app = table `metrics`; the table called `measurements` holds the **values**. Do not mix them up in the SQL below.
The expected numbers below were worked out by hand from the seed data in section 0 and cross-checked with the `xc` query (also in section 0). If a screen shows another number, run `xc` first: it is the hand calculation.

## 0. Setup (once)

- [ ] Dev DB of your own (the Postgres on port 5433 is shared by every worktree): `docker exec gym-postgres createdb -U postgres gym_progress_dev`, put `DATABASE_URL=postgres://postgres:postgres@localhost:5433/gym_progress_dev` in `backend/.env`, then `cd backend && bun run db:reset`. If it refuses the name: `DB_RESET_CONFIRM=gym_progress_dev bun run db:reset`.
- [ ] One login: `cd backend && bun run bootstrap-admin --username owner --password Gym-pass-1`. Backend `bun run dev` (port 4000, `APP_ORIGIN=http://localhost:3000`), frontend `cd frontend && bun run dev` (port 3000).
- [ ] Devices: **Desktop** (Chrome, window >= 1280 px), **Phone** (real phone, ideally Chrome on Android; or DevTools device mode 360 px), **Tablet** (DevTools 800 px portrait and 1180 px landscape). **A** and **B** = two browser profiles when a step says "another device".
- [ ] Sign in as `owner` on Desktop. **Before seeding:** Settings → Reminders & gym → set **Time zone** to your computer's own zone → Save. (The seed uses your computer's date for ages and membership days; the app uses the gym's "today". Same zone = same day.)
- [ ] Shell helpers and data: use a **scratch folder** (not the repo; the cookie jar `jar.txt` lands there). zsh: run `setopt interactive_comments` first. The date helpers are macOS (BSD `date`); Linux: `ago() { date -d "$1 days ago" +%F; }`, `ahead() { date -d "$1 days" +%F; }`, `born() { date -d "$1 years ago $2 days ago" +%F; }`, `turns() { date -d "$1 years ago + 1 day" +%F; }`. `DBNAME` must be the database in `backend/.env`. Needs `jq` for the API steps.
- [ ] Sign in once for `curl`: `login Gym-pass-1` (helper below) prints `HTTP/1.1 200 OK`.

```
APP=http://localhost:3000; O="Origin: $APP"; J="Content-Type: application/json"; DBNAME=gym_progress_dev
db() { docker exec -i gym-postgres psql -U postgres -d $DBNAME -v ON_ERROR_STOP=1 -q "$@"; }
login() { curl -si -c jar.txt -X POST $APP/api/auth/login -H "$O" -H "$J" -d "{\"username\":\"${2:-owner}\",\"password\":\"$1\",\"remember\":true}" | head -1; }
ago() { date -v-"$1"d +%F; }
ahead() { date -v+"$1"d +%F; }
born() { date -v-"$1"y -v-"${2:-100}"d +%F; }
turns() { date -v-"$1"y -v+1d +%F; }
PH=9000000000
mk() {
  db -v n="$1" -v p="$2" -v b="$3" -v s="$4" -v j="$5" -v a="${6:-}" -v t="${7:-}" <<'SQL'
insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on, archived_at, notes)
select :'n', :'p', regexp_replace(:'p', '\D', '', 'g'), :'b'::date, :'s', :'j'::date,
       case when :'a' = 'archived' then now() end, nullif(:'t', '')
where not exists (select 1 from members where full_name = :'n');
SQL
}
period() {
  db -v n="$1" -v p="$2" -v s="$3" -v e="$4" <<'SQL'
insert into membership_periods (member_id, plan, start_on, end_on)
select id, :'p', :'s'::date, :'e'::date from members where full_name = :'n';
SQL
}
member() { PH=$((PH+1)); mk "$1" "$PH" "$3" "$2" "$4" "${8:-}"; period "$1" "$5" "$6" "$7"; }
put() {
  local n="$1" t="$2" d="$3" e="$4"; shift 4
  db -v n="$n" -v t="$t" -v d="$d" -v e="$e" -v pairs="$(printf '%s\n' "$@")" <<'SQL'
insert into assessments (member_id, type_id, assessed_on, is_estimated)
select m.id, t.id, :'d'::date, :'e'::boolean
from members m, assessment_types t where m.full_name = :'n' and t.name = :'t'
on conflict (member_id, type_id, assessed_on) do nothing;
insert into measurements (assessment_id, metric_id, member_id, measured_on, value)
select a.id, x.id, a.member_id, a.assessed_on, split_part(u.p, '=', 2)::numeric
from members m
join assessment_types t on t.name = :'t'
join assessments a on a.member_id = m.id and a.type_id = t.id and a.assessed_on = :'d'::date
cross join unnest(string_to_array(:'pairs', E'\n')) as u(p)
join metrics x on x.type_id = t.id and x.name = split_part(u.p, '=', 1)
where m.full_name = :'n'
on conflict do nothing;
SQL
}
bf() { put "$1" "Body composition" "${4:-2026-03-10}" f "Body fat=$2"; if [ -n "$3" ]; then put "$1" "Body composition" "${5:-2026-09-10}" f "Body fat=$3"; fi; }
xc() {
  db <<SQL
with r as (select m.sex, m.joined_on, count(*) c,
  (array_agg(v.value order by v.measured_on))[1] f, (array_agg(v.value order by v.measured_on desc))[1] l,
  (select p.plan from membership_periods p where p.member_id = m.id order by p.start_on desc limit 1) plan,
  extract(year from age(current_date, m.date_of_birth))::int age
  from members m join measurements v on v.member_id = m.id join metrics x on x.id = v.metric_id and x.name = '$1'
  where m.archived_at is null group by m.id)
select count(*) filter (where c >= 2) n, count(*) filter (where c = 1) not_counted,
  round(avg(l - f) filter (where c >= 2), 3) avg_change from r where true $2;
SQL
}
```

- [ ] Seed block 1, **Surya Pratap** (the full card: 15 body composition + 14 fitness rows, 3 dates each; paste once). `Subcutaneous fat — arms` is left out on 12 Sep 2026 on purpose; the 12 Mar 2026 body composition is **estimated**; Weight has 16 readings.

```
mk "Surya Pratap" "98450 12345" 1982-05-10 male 2025-06-01
period "Surya Pratap" annual "$(ago 500)" "$(ago 136)"
period "Surya Pratap" annual "$(ago 135)" "$(ahead 229)"
put "Surya Pratap" "Body composition" 2025-06-12 f "Height=172.0" "Weight=98.0" "BMI=33.1" "Body fat=27.0" "Visceral fat=14.0" "Resting metabolism=1850" "Body age=52" "Subcutaneous fat — whole body=24.0" "Subcutaneous fat — arms=28.0" "Subcutaneous fat — trunk=20.0" "Subcutaneous fat — legs=25.0" "Skeletal muscle — whole body=31.0" "Skeletal muscle — arms=33.0" "Skeletal muscle — trunk=28.0" "Skeletal muscle — legs=36.0"
for d in 2025-07-12 2025-08-12 2025-09-12 2025-10-12 2025-11-12 2025-12-12 2026-01-12 2026-02-12 2026-04-12 2026-05-12 2026-06-12 2026-07-12 2026-08-12; do put "Surya Pratap" "Body composition" $d f "Weight=97.0"; done
put "Surya Pratap" "Body composition" 2026-03-12 t "Weight=96.0" "Body fat=21.0"
put "Surya Pratap" "Body composition" 2026-09-12 f "Height=172.5" "Weight=94.0" "BMI=31.8" "Body fat=22.0" "Visceral fat=12.0" "Resting metabolism=1900" "Body age=48" "Subcutaneous fat — whole body=22.0" "Subcutaneous fat — trunk=18.5" "Subcutaneous fat — legs=26.3" "Skeletal muscle — whole body=34.0" "Skeletal muscle — arms=36.0" "Skeletal muscle — trunk=30.0" "Skeletal muscle — legs=38.0"
put "Surya Pratap" "Fitness test" 2026-01-15 f "Deadlift=100" "Fran=320" "Push-ups=25" "Plank=100"
put "Surya Pratap" "Fitness test" 2026-03-15 f "Deadlift=100" "Fran=270"
put "Surya Pratap" "Fitness test" 2026-09-15 f "Push-ups=30" "Hang time=95" "Pull-ups=3" "Squats in 1 min=45" "Plank=122" "Deadlift=95" "Back squat=110" "Chest press=70" "Shoulder press=45" "Flexibility=12" "5K run=1860" "Filthy 50=3930" "Fran=250" "CrossFit total=280"
```

- [ ] Seed block 2, **the gym** (paste once; the six `Edge` members are born so they sit on the age-band borders **today**: Nineteen turns 20 tomorrow, Twenty turned 20 today, TwentyNine turns 30 tomorrow, Thirty turned 30 today, FiftyNine turns 60 tomorrow, Sixty turned 60 today).

```
member "Anita Rao"     female "$(born 28)" 2026-01-05 monthly     "$(ago 10)" "$(ahead 20)"
member "Bhavna Shah"   female "$(born 34)" 2026-02-10 quarterly   "$(ago 30)" "$(ahead 60)"
member "Chitra Menon"  female "$(born 24)" 2026-03-20 annual      "$(ago 60)" "$(ahead 300)"
member "Divya Nair"    female "$(born 41)" 2026-01-25 monthly     "$(ago 25)" "$(ahead 5)"
member "Farah Khan"    female "$(born 36)" 2026-02-14 half_annual "$(ago 90)" "$(ahead 90)"
member "Gita Rao"      female "$(born 31)" 2026-02-01 monthly     "$(ago 5)"  "$(ahead 25)"
member "Hema Das"      female "$(born 45)" 2026-01-20 monthly     "$(ago 50)" "$(ago 20)"
member "Neha Joshi"    female "$(born 33)" 2026-05-10 monthly     "$(ago 6)"  "$(ahead 24)"
member "Future Fiona"  female "$(born 40)" 2026-09-01 quarterly   "$(ahead 10)" "$(ahead 100)"
member "Ravi Kumar"    male   "$(born 38)" 2026-01-12 annual      "$(ago 100)" "$(ahead 260)"
member "Sanjay Verma"  male   "$(born 52)" 2026-03-02 quarterly   "$(ago 40)" "$(ahead 50)"
member "Eric Dsouza"   male   "$(born 45)" 2026-02-20 monthly     "$(ago 70)" "$(ago 40)"
member "Imran Sheikh"  male   "$(born 27)" 2026-03-15 monthly     "$(ago 3)"  "$(ahead 27)"
member "Mohan Lal"     male   "$(born 61)" 2025-11-15 monthly     "$(ago 400)" "$(ago 151)"
period "Mohan Lal" annual "$(ago 150)" "$(ahead 215)"
member "Binder Old"    male   "$(born 55)" 2024-03-05 annual      "$(ago 200)" "$(ahead 165)" archived
i=0; for who in "Edge Nineteen:$(turns 20)" "Edge Twenty:$(born 20 0)" "Edge TwentyNine:$(turns 30)" "Edge Thirty:$(born 30 0)" "Edge FiftyNine:$(turns 60)" "Edge Sixty:$(born 60 0)"; do
  member "${who%%:*}" male "${who#*:}" 2026-04-01 monthly "$(ago 4)" "$(ahead 26)"
  bf "${who%%:*}" "$((29 + i)).0" "$((28 + i)).0"; i=$((i+1))
done
bf "Anita Rao" 30.0 28.0;    bf "Bhavna Shah" 33.0 31.2;   bf "Chitra Menon" 25.0 25.1
bf "Divya Nair" 30.0 29.8;   bf "Farah Khan" 26.0 27.5;     bf "Sanjay Verma" 24.0 24.0
bf "Eric Dsouza" 20.0 19.0;  bf "Imran Sheikh" 24.0 22.5;   bf "Mohan Lal" 29.0 26.0
bf "Gita Rao" 28.0 "" 2026-08-20
bf "Binder Old" 35.0 20.0
put "Ravi Kumar" "Body composition" 2026-03-10 f "Body fat=24.0" "Height=175.0"
put "Ravi Kumar" "Body composition" 2026-09-10 f "Body fat=20.5" "Height=175.3"
put "Neha Joshi" "Body composition" 2026-06-10 f "Body fat=27.0"
put "Neha Joshi" "Body composition" 2026-09-10 t "Body fat=26.0" "Skeletal muscle — whole body=30.0"
put "Sanjay Verma" "Fitness test" 2026-09-14 f "Fran=245"
put "Ravi Kumar" "Fitness test" 2026-09-14 f "Fran=250"
put "Eric Dsouza" "Fitness test" 2026-09-14 f "Fran=300"
put "Anita Rao" "Fitness test" 2026-09-14 f "Fran=330"
put "Binder Old" "Fitness test" 2026-09-14 f "Fran=200"
mk "Fred, Formula" "+91 98450 77777" "$(born 40)" male 2026-04-10 "" '=HYPERLINK("http://example.com","click")'
period "Fred, Formula" monthly "$(ago 130)" "$(ago 100)"
put "Fred, Formula" "Fitness test" 2026-09-10 f "Flexibility=-5.0"
```

- [ ] Check the seed: `db -t -A -c "select (select count(*) from members), (select count(*) from membership_periods), (select count(*) from measurements)"` → `23|25|110`. (Any other number = a typo or a second paste; `bun run db:reset` and start again.)
- [ ] Reference data (all dates this year unless said; Body fat is "lower is better", unit %):

| Member | Sex · age | Joined | Latest plan (status) | Body fat first → latest |
|---|---|---|---|---|
| Surya Pratap | M · 44 | 1 Jun 2025 | Annual (Active) | 27.0 → 22.0, best 21.0 (12 Mar, estimated); every measurement |
| Anita Rao · Bhavna Shah · Chitra Menon | F · 28 · 34 · 24 | 5 Jan · 10 Feb · 20 Mar | Monthly · Quarterly · Annual | 30.0 → 28.0 · 33.0 → 31.2 · 25.0 → 25.1 |
| Divya Nair | F · 41 | 25 Jan | Monthly (Ends soon, 5 days) | 30.0 → 29.8 |
| Farah Khan | F · 36 | 14 Feb | Half-annual | 26.0 → 27.5 |
| Gita Rao | F · 31 | 1 Feb | Monthly | **one** reading, 28.0 on 20 Aug |
| Hema Das | F · 45 | 20 Jan | Monthly (Ended 20 days ago) | none |
| Neha Joshi | F · 33 | 10 May | Monthly | 27.0 (10 Jun) → 26.0 (10 Sep, **estimated**) |
| Future Fiona | F · 40 | 1 Sep | Quarterly (starts in 10 days) | none |
| Ravi Kumar | M · 38 | 12 Jan | Annual | 24.0 → 20.5; Height 175.0 → 175.3 |
| Sanjay Verma · Eric Dsouza · Imran Sheikh | M · 52 · 45 · 27 | 2 Mar · 20 Feb · 15 Mar | Quarterly · Monthly (Ended 40 days ago) · Monthly | 24.0 → 24.0 · 20.0 → 19.0 · 24.0 → 22.5 |
| Mohan Lal | M · 61 | 15 Nov 2025 | Monthly, then **Annual** (latest) | 29.0 → 26.0 |
| Binder Old | M · 55 | 5 Mar 2024 | Annual, **archived** | 35.0 → 20.0; Fran 3:20 |
| Edge Nineteen · Twenty · TwentyNine · Thirty · FiftyNine · Sixty | M · 19 · 20 · 29 · 30 · 59 · 60 | 1 Apr | Monthly (Active) | 29.0 → 28.0, 30 → 29, 31 → 30, 32 → 31, 33 → 32, 34 → 33 |
| Fred, Formula | M · 40 | 10 Apr | Monthly (Ended) | Flexibility −5.0 only (the CSV test member) |

  Fran (all on 14 Sep unless said): Sanjay 4:05, Ravi 4:10, Surya 4:10 (15 Sep), Eric 5:00, Anita 5:30, Binder Old 3:20 (archived).

## 1. S12 Report card, desktop — Surya Pratap (BR-REC-22, 106, 107, 108; who: the shared login)

- [ ] **1.1** [G] Members → **Surya Pratap** → **Report card** → `/admin/members/<id>/report`. Window >= 1280 px. Header: back arrow to the member page, title "Report card", main action **Print** at the right of the header. Top block: **Fionis CrossFit** and "Printed <today>" (gym name and print date in the desktop and paper layout), then one line "Surya Pratap · 44 · Male · Annual (Active) · Joined 1 Jun 2025". (BR-REC-106)
- [ ] **1.2** [G] Sections in setup order: **Body composition** then **Fitness test**, each a table with columns Measurement · First · Latest · Best · Change · Trend and one row per measurement in setup order. **15** body composition rows and **14** fitness rows (29). Dates sit small beside the values ("12 Jun 2025", "12 Sep": the year only when it is not this year). Numbers in the mono font, right-aligned so digits line up. (BR-REC-106, 123, 127)
- [ ] **1.3** [G] Body composition rows (First · Latest · Best · Change):
  - Height 172.0 · 172.5 · – · **+0.5 cm** (No direction: no best, no "better"/"worse" word). (BR-REC-107)
  - Weight 98.0 (12 Jun 2025) · 94.0 (12 Sep) · 94.0 (12 Sep) · **↓ 4.0 kg better**.
  - BMI 33.1 · 31.8 · 31.8 · ↓ 1.3 better (no unit). Visceral fat 14.0 · 12.0 · 12.0 · ↓ 2.0 level better. Resting metabolism 1850 · 1900 · 1900 · ↑ 50 kcal better. Body age 52 · 48 · 48 · ↓ 4 years better.
  - **Body fat** 27.0 · 22.0 · **21.0 (≈ Mar 2026)** · **↓ 5.0 % better**: best is not the latest value, and its date shows "≈" because that assessment is estimated. (BR-REC-107, 22)
  - Subcutaneous fat: whole body 24.0 · 22.0 · 22.0 · ↓ 2.0 % better; **arms: 28.0 and "(1 reading)", the other cells "–"**; trunk 20.0 · 18.5 · 18.5 · ↓ 1.5 % better; **legs 25.0 · 26.3 · 25.0 (12 Jun 2025) · ↑ 1.3 % worse** (lower is better, it went up, best is the first value).
  - Skeletal muscle: whole body 31.0 · 34.0 · 34.0 · ↑ 3.0 % better; arms 33.0 · 36.0 · 36.0 · ↑ 3.0 better; trunk 28.0 · 30.0 · 30.0 · ↑ 2.0 better; legs 36.0 · 38.0 · 38.0 · ↑ 2.0 better.
- [ ] **1.4** [G] Fitness test rows: Push-ups 25 · 30 · 30 · ↑ 5 reps better. Plank **1:40** · **2:02** · 2:02 · ↑ 0:22 better (times as m:ss, no unit). **Deadlift 100.0 (15 Jan) · 95.0 (15 Sep) · best 100.0 (15 Jan) · ↓ 5.0 kg worse**: three readings, 100 on 15 Jan and 15 Mar tie, the **earlier date** is the best date. Fran **5:20 · 4:10 · 4:10 · ↓ 1:10 better**. (BR-REC-22, 107)
- [ ] **1.5** [G] One-reading rows show the name with "(1 reading)", the value in Latest and "–" in First, Best, Change and Trend: Hang time 1:35, Pull-ups 3, Squats in 1 min 45, Back squat 110.0, Chest press 70.0, Shoulder press 45.0, Flexibility 12.0, 5K run 31:00, **Filthy 50 1:05:30** (an hour or more shows h:mm:ss), CrossFit total 280.0. (BR-REC-22: under 2 points shows the value only)
- [ ] **1.6** [G] Trend column: a small line per row with 2 or more readings; Weight (16 readings) shows a line, not 16 labels. `[API]` the line has the **last 12** readings only: `S=$(db -t -A -c "select id from members where full_name='Surya Pratap'"); curl -s -b jar.txt $APP/api/members/$S/report-card | jq -c '.data.types[0].metrics[] | select(.name=="Weight") | {readings, points: (.points|length), firstPoint: .points[0].on}'` → `{"readings":16,"points":12,"firstPoint":"2025-10-12"}`. (BR-REC-106)
- [ ] **1.7** [G] **Segmental** section after the two assessments, titled "Segmental · 12 Sep" (no "≈", that assessment is not estimated): columns **Subcutaneous fat %** and **Skeletal muscle %**; rows **Whole body** 22.0 · 34.0, **Arms "–"** · 36.0, **Trunk** 18.5 · 30.0, **Legs** 26.3 · 38.0. The empty cell is "–", not 0 and not blank. Rows are body parts, columns are the groups (the sketch in the spec is drawn the other way round; the build clarification P3 wins). (BR-REC-108)
- [ ] **1.8** [G] The segmental table uses the **12 Sep** assessment although Weight has later one-value assessments on other dates: check there is no other date in its title. (BR-REC-108: the latest assessment that has a table value)
- [ ] **1.9** [G] Never recorded measurements are left out and nothing shows 0 for them; a turned-off measurement with values stays (14.1 turns one off). (BR-REC-106)
- [ ] **1.10** [G] Tap budget: Member page → **Report card** → **Print** = 2 taps. (BR-REC-140)

## 2. S12 Report card, phone (BR-REC-22, 106, 107, 135)

- [ ] **2.1** [G] Phone 360 px, same member: header "Report card", **Print** as one full-width bar above the tabs (the only main action), the bottom tab bar visible. The top block is two lines: name · age · sex, then "Annual (Active) · Joined 1 Jun 2025"; no gym name and no printed date on the phone screen. (BR-REC-121, 135)
- [ ] **2.2** [G] **One card per measurement, not a table**: name; latest value with unit and its date ("94.0 kg  12 Sep"); "first 98.0 (12 Jun 2025) · best 94.0 (12 Sep)"; the change line "↓ 4.0 kg better"; a small trend line. Check Weight, Body fat (best 21.0 with "≈ Mar 2026"), Deadlift (best 100.0 on 15 Jan, "↓ 5.0 kg worse"), Height ("+0.5 cm", **no best**, no "better/worse"), Fran (5:20 → 4:10, "↓ 1:10 better"). (BR-REC-22, 106, 107)
- [ ] **2.3** [G] Pull-ups card: "3 (1 reading)" and nothing else (no first, best, change, trend). Subcutaneous fat — arms: "28.0 % (1 reading)". (BR-REC-22)
- [ ] **2.4** [G] Segmental on the phone: one card per **group** ("Subcutaneous fat %", "Skeletal muscle %") with the four parts as lines (Whole body, Arms, Trunk, Legs); Arms of Subcutaneous fat reads "–". No sideways scroll anywhere. (BR-REC-108, 139)
- [ ] **2.5** [G] Rotate / widen the window across 1024 px: below it the cards, from it the table, with the same numbers. (BR-REC-135)

## 3. S12 other members and states (BR-REC-22, 106, 108)

- [ ] **3.1** [G] **Gita Rao** (one body fat reading): Body composition section with "Body fat (1 reading)", 28.0 %; no Segmental section (no table value); Print is there. **Neha Joshi**: Body fat 27.0 → 26.0; Segmental titled "Segmental · ≈ Sep 2026" with Skeletal muscle % Whole body 30.0 and every other cell "–", and a **Subcutaneous fat %** column of all "–" (that group is on, so its column stays). (BR-REC-108)
- [ ] **3.2** [G] **Sanjay Verma** (Body fat 24.0 → 24.0): the change reads "No change". **Divya Nair** (30.0 → 29.8): the card says "↓ 0.2 % better" `[note]` while gym progress counts her as "No change" (under 1%, BR-REC-112): both are right, the 1% rule is only for the gym counts; tell the owner if the card hides the change instead.
- [ ] **3.3** [G] **Hema Das** (no results): name block, "Annual/Monthly (Ended) · Joined …" line and the sentence "No results recorded yet."; **no Print button**; no empty tables. (BR-REC-22)
- [ ] **3.4** [G] **Binder Old** (archived): the card opens with her values (Body fat 35.0 → 20.0, Fran 3:20); archived members still have a report card. (BR-REC-22)
- [ ] **3.5** [N] Unknown member: `/admin/members/00000000-0000-4000-8000-000000000000/report` and `/admin/members/abc/report` → "This member was not found." (one sentence, no code). Signed out → Login, then back to the card.
- [ ] **3.6** [G] Loading: DevTools Network "Slow 3G", reload → grey shapes in the real layout (header block, two assessments as cards on the phone / table rows on desktop), no page spinner. Error: block `*report-card*`, reload → "Couldn't load this." + **Try again**; unblock, Try again → the card appears. (BR-REC-129, 131)
- [ ] **3.7** [G] Fresh each open (BR-REC-110 applies to the screens that read progress): with the card open on A, run `put "Surya Pratap" "Fitness test" 2026-10-01 f "Pull-ups=5"`; open Report card again from the member page → Pull-ups now has 2 readings (3 → 5, ↑ 2 reps better). Undo: `db -c "delete from measurements where member_id=(select id from members where full_name='Surya Pratap') and measured_on='2026-10-01'; delete from assessments where member_id=(select id from members where full_name='Surya Pratap') and assessed_on='2026-10-01'"`.

## 4. Print (BR-REC-109) — Chrome desktop and Chrome on Android

- [ ] **4.1** [G] Desktop: Surya's card → **Print** → the browser's print preview opens. Paper **A4**, orientation **Portrait**, pages **1** (29 measurements + segmental table + header all fit, with room to spare). Margins about 12 mm. (BR-REC-109)
- [ ] **4.2** [G] Not in the preview: side bar, bottom tabs, the page header (back arrow, Print button), the offline banner and toasts. In the preview: gym name, "Printed <today>", the member line, the tables, the segmental table. (BR-REC-109)
- [ ] **4.3** [G] Black on white: Settings → Theme **Dark**, reopen the card, Print → the preview is **white with black text**, no dark background, no coloured text. In the preview choose Color → **Black and white**: every number, the words "better" / "worse" and the trend lines are still readable. (BR-REC-109, 125)
- [ ] **4.4** [G] Table layout on paper whatever the screen: on the **phone** (or a 360 px window) tap Print → the preview shows the **table** (First · Latest · Best · Change · Trend), not 29 cards. (BR-REC-109, 135)
- [ ] **4.5** [G] **30 rows**: Settings → Assessments → Fitness test → **Add measurement** `Burpees 1 min`, Number, Unit `reps`, Higher → Save; then `put "Surya Pratap" "Fitness test" 2026-09-15 f "Burpees 1 min=40"`. Reopen the card: 30 rows, Print preview still **1 page**. (BR-REC-109: up to 30 measurements)
- [ ] **4.6** [G] Chrome on a real Android phone: Print → destination **Save as PDF** → open the PDF: 1 page, A4, readable text. (BR-REC-109)
- [ ] **4.7** [G] After closing the print preview, the screen looks as before (side bar / tabs are back; no stuck print styles on Members or Settings). (the screen notes: the print rules exist only while the card is open)
- [ ] **4.8** [N] Print preview on another screen (Members list) is unchanged by this feature: still the normal page, not the report card styles.

## 5. S13 Gym progress — open, defaults, filters, address (BR-REC-111; who: the shared login)

- [ ] **5.1** [G] Bottom tab **Reports** (phone) / side bar **Reports** (desktop) → `/admin/reports`. Title "Gym progress", no main action. The tab/side-bar item is marked. Desktop >= 1280 px: filters in one row, results (and Active members by plan) on the left, leaderboard on the right, at most 1080 px wide and centred. (BR-REC-120, 139)
- [ ] **5.2** [G] The default measurement is **Body fat**; the address becomes `/admin/reports?metric=<id>` by itself (no extra Back step). Press Back once → you leave Reports. `[API]`/Network: opening `/admin/reports` with no `metric` starts the assessment list and active members first, progress and leaderboard right after; **never more than 4 API calls**, none waiting on another once `metric` is known. (BR-REC-111, 149)
- [ ] **5.3** [G] The Measurement list shows only measurements that are on, **grouped by assessment** (Body composition, Fitness test), in setup order. Pick **Fran** → the address `metric=` changes (no reload, Back leaves the screen, not the filter). Pick Body fat again.
- [ ] **5.4** [G] Set **Joined from** `Jan 2026` and **Joined to** `Mar 2026` (the phone's own month picker), then **Plan** Monthly, **Sex** Female, **Age** 20–29: after each change the address gets `joinedFrom=2026-01`, `joinedTo=2026-03`, `plan=monthly`, `sex=female`, `age=20to29`; the old numbers stay on screen, **dimmed**, until the new ones arrive (Slow 3G). Set each back to "Any …": its key leaves the address. (BR-REC-111)
- [ ] **5.5** [G] **Bookmark:** copy the address of a filtered view, open it in profile B (signed in) or a new tab → the same filters and the same numbers. Reload keeps them. (BR-REC-111)
- [ ] **5.6** [N] Hand-typed addresses: `?plan=weekly&sex=x&age=70plus&joinedFrom=2026-13` → all four filters read "Any …" and the view shows the unfiltered numbers (5.8). `?metric=abc` → the default measurement. `?joinedFrom=2026-03&joinedTo=2026-01` → shown as Jan 2026–Mar 2026 (swapped) with the Jan–Mar numbers of 6.2. `?metric=00000000-0000-4000-8000-000000000000` → in the results card "We couldn't find that. It may have been removed." (leaderboard and plan counts still work). (P11)
- [ ] **5.7** [G] Filter layout: 1280 px one row; 640–1279 px three to a line (Measurement on its own line); phone two to a line where short; no sideways scroll at 360 px; filters and chips are 44 px targets. (BR-REC-122, 139)

## 6. S13 results — the numbers (BR-REC-23, 111, 112, 113, 114)

Each row: pick the filters, compare **Average change · n line · Improved / No change / Worse**. All with measurement **Body fat** unless said. Hand calculation: `xc "Body fat" "and sex = 'female'"` etc. (columns n, not_counted, avg_change).

- [ ] **6.1** [G] **No filters:** "Average change **−1.3 %**", "Body fat since the first reading", "**n = 18 · 1 with one reading not counted**" (Gita), "**Improved 14 · No change 3 · Worse 1**", a bar of about 78 / 17 / 5 %. If you see n = 19 or about −2.0 %, Binder Old (archived) was counted: a fail. (BR-REC-23, 113, Q1)
- [ ] **6.2** [G] Joined **Jan 2026–Mar 2026**: −0.9 %, "n = 9 · 1 with one reading not counted", Improved 5 · No change 3 · Worse 1, bar about 56 / 33 / 11. (Gita counted out; Hema has no reading and is not counted anywhere; Eric's ended membership still counts.) Same view + **Female**: −0.5 %, "n = 5 · 1 with one reading not counted", 2 · 2 · 1. + **Male** instead: −1.5 %, "n = 4" (no "not counted" part when nobody is left out), 3 · 1 · 0. + **Monthly** (no sex): −1.2 %, "n = 4 · 1 …", 3 · 1 · 0. (BR-REC-111, 113)
- [ ] **6.3** [G] Plan only: **Quarterly** −0.9 %, n = 2, 1 · 1 · 0. **Half-annual** +1.5 %, n = 1, 0 · 0 · 1 (a rise of body fat = Worse). **Monthly** alone: −1.1 %, "n = 11 · 1 with one reading not counted", Improved 10 · No change 1 · Worse 0 (Mohan Lal is **Annual**, his latest period, so he is not in Monthly; compare `xc "Body fat" "and plan = 'monthly'"`). (BR-REC-23, 112, P4)
- [ ] **6.4** [G] **Age bands** (age today, BR-REC-114): Under 20 → n = 1, −1.0 %, 1 · 0 · 0. 20–29 → n = 5, −1.1 %, 4 · 1 · 0. 30–39 → n = 5 · 1 not counted, −1.2 %, 4 · 0 · 1. 40–49 → n = 3, −2.1 %, 2 · 1 · 0. 50–59 → n = 2, −0.5 %, 1 · 1 · 0. 60+ → n = 2, −2.0 %, 2 · 0 · 0. The borders: Edge Nineteen (turns 20 tomorrow) is only in **Under 20**, Edge Twenty (20 today) only in **20–29**, TwentyNine in 20–29, Thirty in 30–39, FiftyNine in 50–59, Sixty in 60+; the counts above add up to 18.
- [ ] **6.5** [G] **"No change" is under 1%:** Divya 30.0 → 29.8 (−0.67%) and Chitra 25.0 → 25.1 (+0.4%) and Sanjay 24.0 → 24.0 are the three **No change** members; Eric's 20.0 → 19.0 (5%) is Improved. (BR-REC-112) `[API]` `curl -s -b jar.txt "$APP/api/reports/progress?metricId=$(db -t -A -c "select id from metrics where name='Body fat'")" | jq -c '.data | {n,notCounted,avgChange,improved,noChange,worse}'` → `{"n":18,"notCounted":1,"avgChange":-1.3,"improved":14,"noChange":3,"worse":1}`.
- [ ] **6.6** [G] **Time measurement:** pick **Fran** → "Average change **−1:10**", "n = 1 · 4 with one reading not counted", Improved 1 · No change 0 · Worse 0 (Surya 5:20 → 4:10; in seconds the average is −70). Times show as m:ss, no unit. (BR-REC-112, 127)
- [ ] **6.7** [G] **No direction:** pick **Height** → only "Average change **+0.4 cm**" and "n = 2" (Surya +0.5, Ravi +0.3): **no Improved / No change / Worse line and no bar**. (BR-REC-112)
- [ ] **6.8** [N] **Nobody counted:** pick **Chest press** (only Surya, one reading) → "–" and "Not enough results yet. A member needs two to be counted." with the n line saying n = 0 and 1 not counted `[note]` (exact wording of the n line when n = 0 is not in the spec). Also Joined from Dec 2026 to Dec 2026 (nobody joined) → same "–" and the sentence. (BR-REC-23, 113)
- [ ] **6.9** [G] The bar is not colour alone: grey-scale (DevTools → Rendering → achromatopsia) still shows the three words with their counts next to it. (BR-REC-125)
- [ ] **6.10** [API] Same numbers from the server for the filtered views, `B=$(db -t -A -c "select id from metrics where name='Body fat'")`: `curl -s -b jar.txt "$APP/api/reports/progress?metricId=$B&joinedFrom=2026-01&joinedTo=2026-03&sex=female" | jq -c '.data|{n,notCounted,avgChange,improved,noChange,worse}'` → `{"n":5,"notCounted":1,"avgChange":-0.48,"improved":2,"noChange":2,"worse":1}`; with `&ageBand=40to49` and no other filter → `{"n":3,"notCounted":0,"avgChange":-2.067,…,"improved":2,"noChange":1,"worse":0}`; `ageBand=70plus` → 400; an unknown `metricId` → 404.

## 7. S13 leaderboard (BR-REC-115)

- [ ] **7.1** [G] Body fat, no other filter: tabs **Male** (chosen first) and **Female**. Male rows (rank · name · value · date): 1 Eric Dsouza 19.0 % 10 Sep · 2 Ravi Kumar 20.5 · 3 Surya Pratap 22.0 (12 Sep) · 4 Imran Sheikh 22.5 · 5 Sanjay Verma 24.0 · 6 Mohan Lal 26.0 · 7 Edge Nineteen 28.0 · 8 Edge Twenty 29.0 · 9 Edge TwentyNine 30.0 · 10 Edge Thirty 31.0. **10 rows**, then **Show more**. Lower is better, so the lowest is first. Eric's membership has ended and he still ranks; **Binder Old (archived, 20.0) is not in the list**. (BR-REC-115, Q1)
- [ ] **7.2** [G] **Show more** → 2 more rows: 11 Edge FiftyNine 32.0, 12 Edge Sixty 33.0 (ranks continue), the button disappears at the end; exactly one extra request per tap in the Network tab. (BR-REC-115, Q3)
- [ ] **7.3** [G] **Female** tab (one request on tap): 1 Chitra Menon 25.1 · 2 Neha Joshi 26.0 · 3 Farah Khan 27.5 · **4 Gita Rao 28.0 (20 Aug) · 4 Anita Rao 28.0 (10 Sep)** · 6 Divya Nair 29.8 · 7 Bhavna Shah 31.2. Equal values **share the rank** and the next rank skips (4, 4, 6); the earlier date is listed first although "Anita" sorts before "Gita". Gita is ranked with only one reading. Hema and Future Fiona (no readings) are not listed. (BR-REC-115)
- [ ] **7.4** [G] **Fran**: Male 1 Sanjay Verma 4:05 · 2 Ravi Kumar 4:10 (14 Sep) · **2** Surya Pratap 4:10 (15 Sep) · 4 Eric Dsouza 5:00: the spec's "1, 2, 2, 4"; Binder Old (3:20) absent. Female: 1 Anita Rao 5:30. Times as m:ss. (BR-REC-115)
- [ ] **7.5** [G] **Deadlift** (higher is better): Male only Surya 95.0 kg, rank 1; **Female** tab → "Nobody has a result yet." (one sentence, no button). (BR-REC-115, BR-REC-130)
- [ ] **7.6** [N] **Height** (No direction): the leaderboard part shows "This measurement has no direction, so it can't be ranked. Pick a different one." and **no tabs**; the rest of the screen works. `[API]` `curl -si -b jar.txt "$APP/api/reports/leaderboard?metricId=$(db -t -A -c "select id from metrics where name='Height'")&sex=male" | head -1` → 400 with `NO_DIRECTION` in the body; a made-up `metricId` → 404 (not 400). (BR-REC-115)
- [ ] **7.7** [G] Tap a name (Eric) → his member page. Back → the leaderboard is still on the same tab. Phone: the leaderboard is **rows**, not a table; desktop: a table with digits aligned. (BR-REC-135, 123)
- [ ] **7.8** [G] Filters (join month, plan, age) do **not** change the leaderboard; the measurement does. `[note]` the spec leaves this open; tell the owner what you see.

## 8. Active members by plan, archive and restore (BR-REC-116, 113, Q1)

- [ ] **8.1** [G] "Active members by plan": **Monthly 11 · Quarterly 3 · Half-annual 1 · Annual 4 · Total 19**. Who counts: Divya (Ends soon, 5 days) yes; Future Fiona (starts in 10 days) yes, under Quarterly; Mohan under **Annual** (his latest period), not Monthly; Hema, Eric and Fred (Ended) no; Binder Old (archived) no. (BR-REC-116, P7)
- [ ] **8.2** [G] `[API]` `curl -s -b jar.txt $APP/api/reports/active-by-plan | jq -c .data` → `{"monthly":11,"quarterly":3,"halfAnnual":1,"annual":4,"total":19}`.
- [ ] **8.3** [G] **Archive:** Members → Ravi Kumar → Archive → confirm. Reopen Reports (Jan–Mar view): **n = 8 · 1 …, −0.6 %, 4 · 3 · 1**; Active by plan **Annual 3, Total 18**; Body fat Male leaderboard has no Ravi (Eric 1, Surya 2, Imran 3 …) and 11 rows (Show more brings 1); Ravi's own report card still opens. **Restore** him → back to n = 9, −0.9 %, Annual 4, Total 19, Ravi rank 2. (BR-REC-113, 115, 116, Q1)

## 9. S13 freshness, states and the other parts (BR-REC-110, 131, 129)

- [ ] **9.1** [G] **Do this last in S13; it changes the numbers.** Open Reports (Body fat, Jan–Mar). Go to Home (tab) and run `bf "Hema Das" 32.0 ""` (one reading), then open **Reports** from the tab bar (no browser reload): "n = 9 · **2** with one reading not counted". Run `bf "Hema Das" 32.0 30.0`, open Reports again: **n = 10 · 1 …, −1.0 %, Improved 6 · No change 3 · Worse 1**. No filters: n = 19, −1.3 %, 15 · 3 · 1. Female leaderboard: Hema **7** (30.0), Bhavna 8. Every open fetched again (Network: 200s, no cached copy shown). (BR-REC-110)
- [ ] **9.2** [G] Undo: `db -c "delete from measurements using members m where measurements.member_id = m.id and m.full_name = 'Hema Das'; delete from assessments using members m where assessments.member_id = m.id and m.full_name = 'Hema Das'"`.
- [ ] **9.3** [G] **Each part fails alone.** Block `*reports/progress*` → results card "Couldn't load this." + **Try again**, leaderboard and plan counts still work; unblock, Try again → numbers appear. Same for `*reports/leaderboard*` (leaderboard part), `*active-by-plan*` (plan counts), `*assessment-types*` (the filter row). (BR-REC-131)
- [ ] **9.4** [G] Loading: Slow 3G, reload → grey shapes for the filter row, results, leaderboard rows and plan counts in the real layout; no page spinner. (BR-REC-129)
- [ ] **9.5** [N] **No measurement on:** `db -c "update metrics set is_active = false"`, reopen Reports → "No measurements are turned on yet." and the **plan counts still show**; restore with `db -c "update metrics set is_active = true"`.
- [ ] **9.6** [G] **Default fallback:** Settings → Assessments → Body composition → **Body fat** → Off. Open `/admin/reports` → the default is the first measurement that is on (**Height**: average only). Turn Body fat On again → default Body fat. (P11)
- [ ] **9.7** [G] **Off measurement still answers:** with the Reports address for Fran saved (`?metric=<Fran id>`), Settings → Fitness test → **Fran** Off. Open the saved address → numbers still show and the picker says "Fran (turned off)"; the picker list has no Fran. Surya's report card **still lists Fran** (5:20 → 4:10). Turn Fran On again. (BR-REC-106, 111, setup 66)
- [ ] **9.8** [API] Nothing is written by reading: `db -t -A -c "select count(*) from audit_log"` before and after opening S12, S13 and downloading all three files → the same number. Signed out (no cookie jar): `curl -s -o /dev/null -w '%{http_code}\n' $APP/api/reports/active-by-plan` → 401.

## 10. S18 Export data and the CSV files (BR-REC-24, 117, 118, 119; who: the shared login)

- [ ] **10.1** [G] Settings → **Export data** → `/admin/settings/export` (back arrow → Settings, title "Export data", no main action, 720 px wide and centred at 1920 px). Three rows **Members**, **Memberships**, **Measurements**, each with the line "Opens in Excel or Google Sheets" and a **Download CSV** button. Loading: Slow 3G → three grey rows. (BR-REC-24)
- [ ] **10.2** [G] Tap **Download CSV** on **Measurements**: the tapped button says "Starting…" and all three wait for a moment, then the browser downloads `measurements-<today>.csv` (gym's day, e.g. `measurements-2026-10-04.csv`); the app does not navigate away. Do the same for Members and Memberships. Phone: the file lands in Downloads. (BR-REC-119)
- [ ] **10.3** [N] Sign-in check: in profile B sign out, then tap Download CSV in A → Login opens and no file downloads. Backend stopped → a toast with one plain sentence (no code) and no download. (screens S18)
- [ ] **10.4** [G] Open the three files in Excel or Google Sheets: columns split on commas; the em dash in "Subcutaneous fat — arms" and every name shows correctly (not "â€”"): the file is UTF-8 with BOM. Dates read `2026-09-12`. (BR-REC-117)
- [ ] **10.5** [API] Files from the terminal (save into the scratch folder): `for f in members memberships measurements; do curl -s -b jar.txt -D $f.h -o $f.csv "$APP/api/exports/$f.csv"; echo "== $f"; grep -i '^content-\|^cache' $f.h | tr -d '\r'; head -c 3 $f.csv | xxd | head -1; head -1 $f.csv | tr -d '\r\n'; echo; done` → each: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<file>-<today>.csv"`, `Cache-Control: private, no-store`, BOM bytes `efbb bf`, and the header rows:
  - members: `member_id,name,phone,email,date_of_birth,sex,joined_on,objective,notes,plan,membership_status,membership_end_on,archived`
  - memberships: `member_id,name,plan,start_on,end_on,archived`
  - measurements: `member_id,name,assessment,measurement,unit,date,estimated,value,display,archived`
  (BR-REC-117, 119; headers come before the rows)
- [ ] **10.6** [G] **One row per value:** `wc -l < members.csv` = members + 1 (24), `memberships.csv` = periods + 1 (26), `measurements.csv` = values + 1 (`db -t -A -c "select count(*) from measurements"` is 110, so 111 lines; 112 if you added Burpees in 4.5). Every line ends with CRLF: `grep -c $'\r' measurements.csv` = the same count as `wc -l`. (BR-REC-24, 117)
- [ ] **10.7** [G] Rows ordered by name (case-insensitive), then date: first data row of measurements is **Anita Rao** 2026-03-10 Body fat; Binder Old rows end with `,yes` (archived members **are** exported). Plan, sex and status are codes: `grep 'Divya' members.csv` shows `monthly,expiring`; Hema `monthly,expired`; Farah's `half_annual`; yes/no for `estimated` and `archived`. (BR-REC-117, P8)
- [ ] **10.8** [G] Values: `grep 'Surya Pratap' measurements.csv | grep 'Plank'` → a 15 Jan row `…,Plank,min:sec,2026-01-15,no,100,1:40,no` and `…,2026-09-15,no,122,2:02,no` (value in seconds, display m:ss); `grep 'Filthy' measurements.csv` → `…,3930,1:05:30,no`; `grep 'Surya' measurements.csv | grep 'Weight' | grep 2026-03-12` → `…,kg,2026-03-12,yes,96,96.0,no` (estimated = yes; value plain number, display with the measurement's decimals, no unit). (BR-REC-117, P13)
- [ ] **10.9** [G] **Spreadsheet-safe cells** (BR-REC-118): `grep 'Fred' members.csv | cat -vet` → name `"Fred, Formula"` (quoted, it holds a comma), phone `'+91 98450 77777` (leading `'`), notes `"'=HYPERLINK(""http://example.com"",""click"")"` (guard `'`, quotes doubled). `grep 'Fred' measurements.csv` → value `-5` and display `-5.0`, **no** leading `'` (a real number is never guarded, owner decision O-1; the display is exactly a negative number, so it is written as is). In Excel / Sheets the notes cell does **not** become a link or run as a formula, and the Fred Value cell is a number (right-aligned; a `=SUM(...)` over the Value column adds it). `[note]` Excel may show the leading `'`; that is expected.
- [ ] **10.9a** [N] **Text that starts with a minus** (BR-REC-118, O-1): set Hema Das's notes to each text below (Members → Hema Das → Edit, or `db -c "update members set notes='-0.5' where full_name='Hema Das'"`), download **Members**, and look at her Notes cell with `grep 'Hema' members.csv | cat -vet`: `-0.5` → `-0.5` and `-12` → `-12` (exactly a negative number: as is, no `'`); `-1+2` → `'-1+2`; `-A1` → `'-A1`; `=1+1` → `'=1+1`. Undo: `db -c "update members set notes = null where full_name='Hema Das'"`.
- [ ] **10.10** [N] Another file name: `curl -si -b jar.txt $APP/api/exports/other.csv | head -1` → 404; signed out → 401.
- [ ] **10.11** [G] Read-only and fresh: `put "Hema Das" "Body composition" 2026-09-10 f "Body fat=30.0"`, download measurements again → one more row (BR-REC-110 style: nothing cached). Undo as 9.2.

## 11. Speed with the 1,000-member data set `[slow]` (BR-REC-119, 147, 148, 149)

Do this last; it adds 1,000 members. To go back: `bun run db:reset` and the seed blocks again.

- [ ] **11.1** [slow] `cd backend && bun run seed:perf`; then `db -t -A -c "select count(*) from measurements"` → note the number (`[note]` the spec example is 300,000 values; tell the owner how many you got).
- [ ] **11.2** [slow] First byte: `curl -s -b jar.txt -o /dev/null -w 'first byte %{time_starttransfer}s  total %{time_total}s\n' $APP/api/exports/measurements.csv` (run twice; the second run is the warm one) → first byte **under 1 s**, total longer. (BR-REC-119, 147)
- [ ] **11.3** [slow] In the browser: Export data → Measurements; while the file downloads keep tapping around (Members, Reports, scroll): the app stays responsive and nothing freezes. Open the downloaded file: header, then all rows, last line complete. (BR-REC-119)
- [ ] **11.4** [slow] Warm timings (production build if you have one; a dev server is slower, note the difference): `S=$(db -t -A -c "select id from members where full_name='Surya Pratap' limit 1")`, `curl -s -b jar.txt -o /dev/null -w '%{time_total}s %{size_download} bytes\n' --compressed $APP/api/members/$S/report-card` → under about 0.3 s, under 30 KB; `…/api/reports/progress?metricId=<Body fat id>` → under about 0.5 s. (BR-REC-147, 148)
- [ ] **11.5** [slow] With 1,000 members open Reports on the phone throttled "Slow 3G": the grey shapes show first, results and leaderboard come in, the leaderboard still lists 10 rows and **Show more** works. (BR-REC-129, 115)

## 12. Look, feel, words, access (ux BR-REC-120…140 on S12, S13, S18)

- [ ] **12.1** [G] Words (BR-REC-126, 128): read every label, hint, error, toast and spoken name on the three screens. Allowed: Report card, Gym progress, Export data, Measurement, Higher/Lower is better, No direction, Print, Download CSV, better, worse, Improved, No change, Worse, Show more, Active members by plan, Monthly / Quarterly / Half-annual / Annual. Not allowed: "metric", "datatype", "leaderboard" as a code, `NO_DIRECTION`, `NOT_FOUND`, `half_annual`, `halfAnnual`, `under20`, `20to29`, ids, status numbers. Every refusal you caused (not found, no direction, sign-in) showed one plain sentence.
- [ ] **12.2** [G] Phone 360 px: no sideways scroll on S12 (cards, segmental cards), S13 (filters, results, bar, leaderboard rows, plan counts) and S18. Add a member named `Abcdefghijabcdefghijabcdefghijabcdefghij` (40 letters, no spaces; Members → Add member), give them readings with `bf "Abcdefghijabcdefghijabcdefghijabcdefghij" 25.0 24.0`, and open the card and the Body fat leaderboard (Male or Female as you chose) → the name wraps or is cut, values stay visible. (BR-REC-139)
- [ ] **12.3** [G] Tablet 800 px portrait: bottom tab bar, **Print** in the bar above the tabs; 1180 px landscape and desktop 1280 px: side bar, **Print** at the right of the header, S13 results and leaderboard side by side. Desktop 1920 px: S12 and S13 at most 1080 px, S18 at most 720 px, centred. (BR-REC-120, 121, 139)
- [ ] **12.4** [G] One main action per screen: S12 **Print** (only), S13 none, S18 none (each **Download CSV** is a row button, not a second big action). Never two strong buttons in view. (BR-REC-121)
- [ ] **12.5** [G] 44 px targets: Print, back arrow, filter fields, the Male / Female tabs, **Show more**, each leaderboard row, **Download CSV**, Try again; 8 px between neighbours; leaderboard and list rows at least 56 px; inputs and buttons 48 px tall. (BR-REC-122)
- [ ] **12.6** [G] Text: 16 px body and inputs (a real iPhone does not zoom when you tap a filter), 14 px secondary, nothing under 12 px; the number columns (report card, leaderboard) in the mono font. (BR-REC-123)
- [ ] **12.7** [G] **Dark theme:** S12, S13 (with the bar and a dimmed result), S18 in dark; run axe (browser extension) on S12, S13, S18 in light and dark → 0 contrast issues, 0 serious. Worse/better words and the trend lines readable. (BR-REC-124, 136)
- [ ] **12.8** [G] Grey-scale (achromatopsia): better / worse words, Improved / No change / Worse counts, the chosen Male/Female tab and error lines are still obvious without colour. (BR-REC-125)
- [ ] **12.9** [G] 200 % text zoom (desktop browser zoom and the phone's largest text): S12, S13, S18 have no sideways scroll, no clipped text, **Print** and **Download CSV** can still be reached. (BR-REC-137)
- [ ] **12.10** [G] Keyboard only (Desktop): Tab reaches Print, every filter, the tabs, Show more, each leaderboard name, each Download CSV, in a sensible order; focus ring always visible; Enter/Space press them. (BR-REC-137)
- [ ] **12.11** [G] Screen reader (VoiceOver, TalkBack, NVDA): the Download CSV buttons read "Download CSV Members" / "Memberships" / "Measurements"; filters read label and value; Male/Female tabs read which is chosen; each leaderboard row reads rank, name, value, date; the trend line has a spoken text or is hidden, not "image"; the S12 table reads headers (First, Latest, Best, Change). Toasts (the S18 failure) are announced. (BR-REC-137)
- [ ] **12.12** [G] Offline (DevTools → Offline) on S13: within 2 s the thin banner "You're offline — changes can't be saved right now" appears and goes on reconnect; the screen keeps what it shows. (BR-REC-132)
- [ ] **12.13** [G] Reduce motion on in the system → no sliding or bar animation. (BR-REC-137)
- [ ] **12.14** [G] Fonts and layout shift: reload S12 and S13 on Slow 3G → nothing jumps when the real values replace the grey shapes. (BR-REC-143)

## 13. Later — when the other streams are merged `[later]`

- [ ] **13.1** [later: members] The member page button **Report card** is there and opens S12; "Print a report card" is 2 taps from the member page (BR-REC-140).
- [ ] **13.2** [later: assessments] After a value is saved in the entry form (S10) for Surya, reopen S12 and S13 → the new reading is counted at once, with no refresh button (BR-REC-110); a value corrected or deleted in S11 changes first / latest / best and the gym numbers at the next open; an estimated assessment shows "≈" on the card (BR-REC-106).
- [ ] **13.3** [later: due list] Nothing from progress writes a due date or a reminder.

## Coverage

| BR | Section(s) | BR | Section(s) | BR | Section(s) |
|---|---|---|---|---|---|
| 22 | 1, 2, 3, 13 | 23 | 5, 6, 8 | 24 | 10 |
| 106 | 1, 2, 3, 9 | 107 | 1, 2 | 108 | 1, 2, 3 |
| 109 | 4 | 110 | 3, 9, 10, 13 | 111 | 5, 6, 9 |
| 112 | 6 | 113 | 6, 8 | 114 | 6 |
| 115 | 7, 8 | 116 | 8 | 117 | 10 |
| 118 | 10 | 119 | 10, 11 | P1…P14 | 1…10 |
| ux 120…140 on S12, S13, S18 | 2, 5, 9, 12 | BR-REC-147…149 (budgets) | 5, 11 | Q1 (archived left out) | 6, 7, 8 |
