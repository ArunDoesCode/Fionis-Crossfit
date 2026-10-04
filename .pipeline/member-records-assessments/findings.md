# Findings — member-records/assessments (Stream D)

Review round 1 (reviewer a8ab…, test-runner aa52…): 0 blocker, 4 major, 7 minor. Backend suite was blocked once by two runs sharing
`gym_assess_test` (a leftover `test_foundation_session` row); cleared with `db:test:prepare`, re-run is the final gate.

| # | Sev | Area | Finding | Decision |
|---|---|---|---|---|
| R-1 | major | admin + backend | Editing a saved assessment resends every field; `inputFromStored` shows the value rounded to the CURRENT decimals, so an untouched value is rewritten (95.55 → 95.6) against setup C9 and BR-REC-92 | **fix** — spec D2 amended: NO_VALUES only when the save would leave the assessment with no value; the form sends only changed fields (`unchanged` flag in `buildSaveValues`); E26 with an empty `values` list on a saved assessment changes only About |
| R-2 | major | spec / admin | E29 has no screen; the UI half of BR-REC-87 is unreachable | **decided (MVP light)** — E29 stays API-only; spec D21 + contract say so; issue for the move UI; About-only edits go through E26 (R-1) |
| R-3 | major | tests | no tests for the form reducer (`entryState`), `fieldView`, `dueStatus`, `valueText`, `listParams`; no manual checklist | **fix** — test-writer extension (signatures only) + checklist mode |
| R-4 | major | perf | `/assess` page JS 55.2 KB gz (41.5 KB without two shared chunks) vs 40 KB per screen (BR-REC-146) | **fix** — split list/detail hooks and `useInfiniteQuery` out of `queries.ts`; re-measure; if still over, record the number for Stream G |
| R-5 | minor | admin | `isChanged` ignores About and date | **fix** |
| R-6 | minor | admin | every complete intermediate date typed fires E25 and clears the old draft | **fix** — commit the date on blur |
| R-7 | minor | setup (stream C, merged) | `DurationControl` ignores `status`; `NumberControl` has no `allowNegative` | **issue** — comments on #19, #21; not patched here |
| R-8 | minor | admin | words outside the word list ("Saved.", "Deleted.", "Pick an assessment to record.") | **fix** — move to `ASSESSMENT_TEXT` |
| R-9 | minor | docs | form is a reducer, not RHF + Zod | **decision** D-022 at hand-over |
| R-10 | minor | docs | contract.md says handlers answer 501 | **fix** |
| R-11 | minor | backend perf | E26 ≈ 8 sequential round trips | **later** — measure with Stream G's bench (map gap) |
