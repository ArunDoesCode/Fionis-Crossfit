---
module: member-records/members
spec: docs/specs/member-records/members.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: []
---

# Member records · members (Stream B) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-03–09, 45–59, 172; decisions D-021.

## Summary and API
Members and membership periods: list + search, create with first period, edit, archive/restore (archived stay editable), add/edit periods
(renewing an archived member restores them, BR-REC-58), "Ends soon" list. Screens S4–S9, Home search + membership sections, member header,
membership block, archived/ended banner.
Endpoints: E16 list/search · E17 create (`Idempotency-Key`) · E18 get · E19 update · E20 archive · E21 restore · E22 add period (`Idempotency-Key`) · E23 edit period · E24 memberships ending.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/members,controller/{members,memberships}Controller,service/{members,memberships}Service,repository/{members,memberships}Repository}.ts`, `service/{membersView,membershipsRules}.ts`, `repository/membersSql.ts`, `types/members.types.ts` | `membersService.{list,create,get,update,archive,restore,restoreInTransaction}`, `membershipsService.{add,update,ending}`; pure `periodsOverlap`, `coversDay`, `restoresMember`, `RECENTLY_ENDED_DAYS`; `statusCondition()`; `cleanPhone`/`phoneDigits` |
| admin lib | `frontend/src/lib/{validators/members.ts,members/*,api/members/*}` | `memberFormSchema`, `cleanPhone`, `samePhone`, `membershipStatusText`, `memberListBadge`, `memberBannerText`, `renewDefaults`, `duplicatePhoneMatches`, `clampSearchText` (E16 `q` ≤ 100); hooks `useMemberList` (25/page), `useMember`, `useSavePeriod`, `useEndingList`/`useEndingPreview`; keys `memberKeys` `['members']`, `membershipKeys` `['memberships']` |
| admin ui | `frontend/src/components/{views,pages}/members/*`, routes `app/(app)/admin/{members,memberships}/**` | `lazySheets.ts (PeriodSheet)` + `useLazySheet`, `AfterHydration`, `MembershipHistory` |
| slots | Home `components/pages/home/{HomeSearch,MembershipSections}`; Member `components/pages/member/{MemberHeader,MembershipBlock}` | member slots take `{ memberId }` |

## Gotchas
- Every write to one member takes `select … for update` on its row first (`membersRepository.lockById`); the overlap, join-date and restore checks (BR-REC-09, 50, 58) run after it; idempotency and the settings read (`readGymSettings`) happen outside the transaction; refusals throw before the first write.
- E16 status filters are SQL (`membersSql.statusCondition`): change `lib/domain/membership.ts` and it together. E16 name order is `lower(full_name) COLLATE "C"` (word by word); `members_name_active_idx` is built on exactly that expression (BR-REC-207; change both together). **Deploy trap:** `drizzle-kit push` does not see a collate-only change, so an existing database must run `drop index members_name_active_idx` once, then `db:push`.
- `phone` is stored cleaned (`+919845012345`), `phone_digits` digits only; the `phone` filter and "same phone" compare the last 10 digits (BR-REC-47). In a query string a bare `+` becomes a space: send `%2B`.
- Admin: `useToday()` has a server snapshot (UTC day): never take form defaults from it; `AfterHydration` draws S6 in the browser only.
- `memberFormSchema` object-level checks need `.refine(…, { when: () => true })` or zod skips them once a field fails. `ChoiceChips` cannot un-choose (Goal has a "Not set" chip). `ApiError.body.details.field` carries the field.
- Lazy sheets (`PeriodSheet`, `ConfirmSheet` in Archive) load through `lib/members/useLazySheet.ts`: `sheetLoader(() => import(…))` = ONE `import()` site per sheet (a second site makes Turbopack emit a second chunk copy) with a cache that resets on failure (`React.lazy` / `next/dynamic` keep a rejected load forever). The sheet mounts CLOSED and opens one frame later (Base UI skips the open animation for a sheet that mounts open) and stays mounted (unmounting calls `history.back()` via `useBackToClose`). A failed load toasts "Couldn't load this. Try again." and the next tap retries. Keep `useForm` inside the sheet children. Renew pointer-down/focus preloads the chunk and `prefetchMember`s the detail (native listeners via ref in `MembershipHistory`).
- List/search requests forward the abort signal. The admin reuses an idempotency key only while the JSON body is identical; `crypto.randomUUID` needs a secure page, so `newIdempotencyKey` (`lib/members/idempotencyKey.ts`) falls back to `getRandomValues`.

## Tests and open issues
`backend/tests/members/` (+ `support/suite.ts`), `frontend/tests/members/`.
Manual: `.pipeline/member-records-members/checklist.md` (S4–S9, Home search and sections, real-server items).
Open issues: [#16](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/16) shared words, `START_BEFORE_JOIN` wording for Edit member, `DateField` onBlur/warning (members uses local stand-ins) · [#17](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/17) S5 desktop columns (`ListRow` has no column slot) · [#20](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/20) server-side data start (`HydrationBoundary`): decide once for all streams.

## History
2026-10-04 · #22 (`8e3d569`) · Stream B built: E16–E24, S4–S9, Home search + membership sections, member header + membership block; lazy sheets, join-date rule; D-021.
