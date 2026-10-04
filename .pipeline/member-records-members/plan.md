# Plan — member-records/members (Stream B)

Spec: `docs/specs/member-records/members.md` v1 (frozen 2026-10-03), index `docs/specs/member-records.md` v2 →
Parallel build plan, Stream B. Branch: `claude/member-records-feature-8fca5b` (own session/worktree, D-017; from `main` 9244b2c).
Rules: BR-REC-03…09, 45…59, 172 (23) · Endpoints E16–E24 · Tables `members`, `membership_periods` (built by Stream 0) ·
Screens S4 `/admin/memberships`, S5 `/admin/members`, S6 `/admin/members/new`, S7 member page slots, S8 `/admin/members/[memberId]/edit`,
S9 renew/edit sheet, Home search + the two membership sections.

## File ownership (index → Shared files)
Members owns: `backend/src/{types,routes,controller,service,repository}/members*` (+ `memberships*` if split) ·
`frontend/src/{lib/api,lib/validators,components/views,components/pages}/members/**` (+ `lib/validators/members.ts`, `lib/members/**`) ·
slots `components/pages/home/{HomeSearch,MembershipSections}.tsx`, `components/pages/member/{MemberHeader,MembershipBlock}.tsx` ·
routes `app/(app)/admin/members/page.tsx`, `members/new/**`, `members/[memberId]/edit/**`, `app/(app)/admin/memberships/**`.
Read-only: everything else — Stream 0 (`backend/src/db/**`, `lib/{audit,idempotency,…}.ts`, `lib/domain/**`, `routes/{end-points,index,mount-route}.ts`,
frontend `lib/{api/routes,api/client,format,messages/**,domain/**,hooks/**}`, `components/{common,shells}/**`, Home and Member-page frames
`components/{views,pages}/{home,member}/*` except our slots, `app/(app)/admin/members/[memberId]/page.tsx`), setup (C), assessments (D), due-list (E).
A needed change there → stop and tell the user (memory: parallel-stream-sessions). Generated: `.contracts/*`, `api.generated.ts` (re-run only).

## Build choices (coordinator, 2026-10-04; recorded as D-021 at hand-over)
1. Settings: the members repository reads `gym_settings` (timezone, `expiry_lead_days`) itself — no dependency on Stream C's code.
2. `lastAssessedOn` = latest `assessments.assessed_on` of the member (read-only on the Stream 0 table; D writes it).
3. Join date edited to after a period's start → 400 `START_BEFORE_JOIN` on E19 (keeps BR-REC-50/55 true; spec clarification).
4. Run order: one contract step for E16–E24, two test-writers up front (backend / admin logic, disjoint folders), then two build
   rounds (A = slices 1–3, B = slices 4–5), each round backend-dev ∥ frontend-dev; one `feat(` commit per slice per surface.
5. Admin tests are pure-logic tests (no DOM test library, issue #9); screens are covered by the manual checklist.

## Slices
- [ ] **1. Add + member page** — BR-REC-03, 05, 45, 46, 48, 49, 50, 59
  - backend: E17 (Idempotency-Key, field rules, `DATE_IN_FUTURE`, `START_BEFORE_JOIN`, first period end = `membershipEnd`), E18 (age, membership, periods); audit rows.
  - admin: S6 Add member form (validators, live "Ends …", age warning, More details), S7 `MemberHeader` + `MembershipBlock` slots.
- [ ] **2. Find members** — BR-REC-04, 07, 47, 56, 57 (+ 06 search part)
  - backend: E16 (`q` 2+ trimmed, name/phone/email, prefix-first order, `phone` last-10 match, `status` filters, pagination, `lastAssessedOn`).
  - admin: S5 Members (chips, Show more, Archived detail line), `HomeSearch` slot, duplicate-phone warning under the phone field.
- [ ] **3. Edit, archive, restore** — BR-REC-06, 58 (details part), 172
  - backend: E19 (archived too), E20, E21.
  - admin: S8 Edit member, archive confirm sheet, Restore, the BR-REC-172 banner in `MemberHeader`.
- [ ] **4. Renew + edit periods** — BR-REC-09, 51, 54, 55, 58 (auto-restore)
  - backend: E22 (Idempotency-Key, overlap 409, `memberRestored`), E23.
  - admin: S9 renew / edit-period sheet (defaults, live end, restore line), from `MembershipBlock`.
- [ ] **5. Memberships ending** — BR-REC-08, 52, 53
  - backend: E24 (`expiring` soonest first; `expired` last 30 days, most recent first; no archived).
  - admin: S4 `/admin/memberships?tab=ending|ended`, Home `MembershipSections` (first 5 + See all), Renew from a row.

## Baseline (2026-10-04, before any change)
All green: backend typecheck, lint, `bun test` 809 pass, `contract:check` (41 routes); frontend typecheck, lint, `bun test` 749 pass;
`check-fixtures.sh`. Own DBs: dev `gym_members`, test `gym_members_test`; API port 4002, web 3002 (setup stream runs next to us).

## Notes
