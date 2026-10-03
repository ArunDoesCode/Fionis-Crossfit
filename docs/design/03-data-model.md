# 03 Data model

SQL migrations in `supabase/migrations` are the source of truth. This file is the target schema for migration `0001_core.sql` (phases 0–6) plus later additions.

## Allowed database logic (nothing else)

1. `updated_at` trigger.
2. `sessions.status` transition guard (rejects invalid jumps; the API enforces it too).
3. Constraints, unique keys, foreign keys, check constraints, indexes.
4. RLS policies (read only, see end).

Everything else (ranking, PR, awards, streaks, validation) is in `packages/domain` + `apps/api`.

## Types

```sql
create type role_t    as enum ('member','trainer','owner','display');
create type scoring_t as enum ('time','amrap_reps','rounds_reps','load','reps','distance','calories');
create type sess_st   as enum ('scheduled','active','collecting','results','closed','cancelled');
create type tier_t    as enum ('bronze','silver','gold','legend');
```

## Core tables

```sql
create table gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  collect_minutes int not null default 10,
  results_minutes int not null default 15,
  streak_min_sessions int not null default 3,
  brand jsonb not null default '{}'::jsonb,         -- logoUrl, accent color
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  gym_id uuid not null references gyms(id),
  name text not null,
  email text not null,
  role role_t not null default 'member',
  status text not null default 'invited' check (status in ('invited','active','inactive')),
  show_on_board boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on profiles (gym_id, role);

create table benchmarks (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references gyms(id),                  -- null = global library
  name text not null,
  scoring scoring_t not null,
  unique (gym_id, name)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  benchmark_id uuid references benchmarks(id),
  title text not null,
  description text not null default '',
  movements jsonb not null default '[]'::jsonb,     -- [{order,name,reps?,load?,notes?,atRound?}]
  scoring scoring_t not null,
  timer_config jsonb not null,                      -- TimerConfig (docs/02 §9)
  time_cap_s int,                                   -- mirrors timer_config cap for queries
  divisions text[] not null default '{rx,scaled}',
  version int not null default 1,
  parent_id uuid references workouts(id),
  locked boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on workouts (gym_id, benchmark_id);

create table session_templates (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min int not null default 60,
  title text not null,
  active boolean not null default true
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  template_id uuid references session_templates(id),
  workout_id uuid references workouts(id),          -- may be null until assigned
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status sess_st not null default 'scheduled',
  started_at timestamptz,                           -- official timer zero (includes countdown)
  ended_at timestamptz,
  collect_until timestamptz,
  results_at timestamptz,
  checkin_token text not null default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on sessions (gym_id, starts_at);
create index on sessions (gym_id, status);

create table attendance (
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references profiles(id),
  gym_id uuid not null references gyms(id),
  checked_in_at timestamptz not null default now(),
  source text not null check (source in ('qr','trainer')),
  primary key (session_id, member_id)
);

create table results (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references profiles(id),
  division text not null,
  finished boolean not null default true,
  submitted_value numeric not null,
  submitted_extra numeric,
  official_value numeric not null,
  official_extra numeric,
  score_sort numeric not null,                      -- computed by domain.scoreSort in API
  status text not null default 'submitted' check (status in ('submitted','corrected','excluded')),
  flag text check (flag in ('outlier')),
  correction_reason text,
  corrected_by uuid references profiles(id),
  late boolean not null default false,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, member_id)
);
create index on results (member_id, submitted_at desc);
create index on results (session_id);

create table session_board (
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references profiles(id),
  gym_id uuid not null references gyms(id),
  division text,
  status text not null check (status in ('pending','submitted','capped','excluded')),
  raw_rank int,
  baseline_value numeric,
  perf_index numeric,
  perf_rank int,
  is_pr boolean not null default false,
  prev_best numeric,
  delta_value numeric,
  computed_at timestamptz not null default now(),
  primary key (session_id, member_id)
);

create table pr_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  member_id uuid not null references profiles(id),
  benchmark_id uuid not null references benchmarks(id),
  division text not null,
  result_id uuid not null unique references results(id) on delete cascade,
  prev_best numeric,
  new_best numeric not null,
  delta numeric,
  achieved_at timestamptz not null
);
create index on pr_events (member_id, benchmark_id, achieved_at desc);

create table member_stats (
  member_id uuid primary key references profiles(id) on delete cascade,
  gym_id uuid not null references gyms(id),
  sessions_total int not null default 0,
  streak_weeks int not null default 0,
  best_streak int not null default 0,
  freezes_used jsonb not null default '[]'::jsonb,  -- ISO weeks covered by a freeze
  last_attended_at timestamptz,
  updated_at timestamptz not null default now()
);
```

## Achievements and TV

```sql
create table achievement_defs (
  code text primary key,
  name text not null,
  description text not null,
  tier tier_t not null,
  icon text not null default 'trophy',
  priority int not null default 0,                  -- higher shows first
  scope text not null check (scope in ('checkin','result','session'))
);

create table achievements_awarded (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  member_id uuid not null references profiles(id),
  code text not null references achievement_defs(code),
  session_id uuid not null references sessions(id) on delete cascade,
  result_id uuid references results(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,       -- e.g. {prev:'4:18', now:'4:02', delta:'-16s'}
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (member_id, code, session_id)
);
create index on achievements_awarded (member_id, awarded_at desc);

create table tv_events (
  id bigint generated always as identity primary key,
  gym_id uuid not null references gyms(id),
  session_id uuid references sessions(id) on delete cascade,
  type text not null,                               -- see docs/04 event catalog
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index on tv_events (gym_id, id desc);
-- pruned by job after 7 days; added to supabase_realtime publication
alter publication supabase_realtime add table tv_events;

create table tv_heartbeat (
  gym_id uuid not null references gyms(id),
  display_id uuid not null references profiles(id),
  last_seen timestamptz not null default now(),
  primary key (gym_id, display_id)
);
```

## Support tables

```sql
create table idempotency_keys (
  actor_id uuid not null,
  key text not null,
  endpoint text not null,
  request_hash text not null,
  status_code int,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, key)
);                                                   -- pruned after 48h

create table push_tokens (
  member_id uuid not null references profiles(id) on delete cascade,
  expo_token text primary key,
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);

create table app_config (key text primary key, value jsonb not null);  -- e.g. min_app_version

create table audit_log (
  id bigint generated always as identity primary key,
  gym_id uuid not null,
  actor_id uuid,
  action text not null,
  table_name text,
  row_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
```

## Views (read helpers, used by the API)

- `member_history`: official results joined to sessions and workouts, excluding `excluded`, with `session_board` delta columns.
- `pending_results`: `attendance` left join `results` where result is null.

## Status transition guard (the only trigger with logic)

Allowed: `scheduled→active`, `scheduled→cancelled`, `active→collecting`, `active→scheduled` (undo), `collecting→results`, `collecting→active` (undo), `results→closed`. Anything else raises `invalid_status_transition`.

## Later phases (separate migrations)

```sql
-- phase 7: engagement/payments
membership_plans(id, gym_id, name, type ('recurring'|'pack'|'dropin'), price_cents, interval, class_credits, stripe_price_id)
memberships(member_id pk, gym_id, plan_id, status, current_period_end, credits_left, stripe_customer_id, stripe_subscription_id)
payments(id, gym_id, member_id, amount_cents, status, stripe_invoice_id unique, paid_at)
stripe_events(id text pk, received_at)
```

## RLS

- `alter table ... enable row level security` on every table.
- Policies: `display` role may `select` from `tv_events` where `gym_id = (select gym_id from profiles where id = auth.uid())`. That is the only client-facing policy in v1.
- Service role (API) bypasses RLS; the API performs authorization.
- pgTAP tests assert: anon and member JWTs cannot select or write any table directly; display can select only its gym's `tv_events`; nobody can write.
