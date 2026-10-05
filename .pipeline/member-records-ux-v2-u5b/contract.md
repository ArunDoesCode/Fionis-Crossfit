# Contract: member-records ux v2 U5-backend (additive only)

No new routes, no param/body/error/permission changes. Two response additions.

## E16 GET /api/members (BR-REC-205)
List item gains `email: string | null` (null = no email on file; stored value, not trimmed further).
Item is now `{ id, fullName, phone, email, lastAssessedOn, archivedAt, membership{ status, plan, endOn, daysLeft } }`.
Pagination, query, sort, `q` matching unchanged.

## E25 GET /api/members/:memberId/entry-form (BR-REC-217)
Each `metrics[]` item gains:
- `tableGroup: string | null` (e.g. "Skeletal muscle %")
- `tablePart: "whole_body" | "arms" | "trunk" | "legs" | null`
Both null together, or both set (DB check `metrics_table_pair_check`). Values are as setup stores them.
Other fields unchanged. Both keys are always present (never omitted).

## Events
None.

## Generated
`backend/.contracts/openapi.json`, `frontend/src/types/api.generated.ts` regenerated.
`member/` has no package.json yet (no `types:api`); nothing to generate there.
