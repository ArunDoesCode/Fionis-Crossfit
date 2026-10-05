# Plan — member-records ux v2, slice U5-backend (search data + indexes + E25 fields)
Spec: members.md v2 BR-REC-205 (E16 `email`), data-model.md v4 BR-REC-206, 207 (index map; name index `collate "C"`), assessments.md v3 BR-REC-217 (E25 `tableGroup`/`tablePart`). Issues #44 (data part), #46 (contract part). Backend + generated types only. ETag on lists (performance 212) = U6.
## Slices
- [ ] contract: E16 item + `email`; E25 metric + `tableGroup`, `tablePart` (additive); `contract:generate`; `types:api` in frontend/ and member/.
- [ ] red tests (test-writer, backend/tests): BR-REC-205, 206/207 (index map: names + expressions via pg catalog), 217.
- [ ] backend-dev: repository/service/mappers; migration fixing `members_name_active_idx` expression to `lower(full_name) collate "C"` (drizzle schema, no hand-written SQL per D-… data-model v2 rule), all read paths indexed per map.
- [ ] verify: reviewer + test-runner (backend full suite).
