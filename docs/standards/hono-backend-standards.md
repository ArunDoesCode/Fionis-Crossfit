# Hono Backend Standards

Generic rules for a TypeScript REST backend on **Hono + Bun + Drizzle + Zod + Postgres**.
Project-neutral: drop into any new repo as `CLAUDE.md` / `docs/backend-standards.md`.
Each rule is meant to be checkable in review.

---

## 1. Architecture: three strict layers

| Layer | File | Does | Never does |
|---|---|---|---|
| Controller | `src/controller/<feature>Controller.ts` | Zod-parse input → call service → shape HTTP response | Business rules, DB access, error handling |
| Service | `src/service/<feature>Service.ts` | Business rules, orchestration, transactions | HTTP status/response logic, raw SQL |
| Repository | `src/repository/<feature>Repository.ts` | DB queries only, returns raw typed rows | HTTP, business rules |

- No cross-layer calls. Controller → service → repository, nothing skips a layer.
- Only the repository touches the DB client. Import one shared client (`src/db/client.ts`) everywhere.
- Shared helpers live in `src/lib/*`. Auth middleware in `src/lib/auth-middleware.ts`.
- Business logic lives in services, not in controllers, DB triggers or middleware.
- No microservices, queues or distributed systems until a real need is proven.

## 2. Single source of truth

Every concern has exactly one home. Duplicates are review findings.

| Concern | Home |
|---|---|
| Route paths | `src/routes/end-points.ts` (add the constant first, then use it) |
| Request/response schemas | `src/types/<feature>.types.ts` |
| Error classes, codes, messages | `src/lib/errors.ts` |
| Route descriptor + OpenAPI registration | `src/lib/route-registry.ts` |
| DB shape | Drizzle schema in `src/db/schemas/` |
| Status/type unions | One union, shared by controller, service and repository |

## 3. Types: one owner per boundary

- **Controller ↔ service:** types come from Zod (`z.infer`) in `src/types/*.types.ts`.
- **Repository:** types come from Drizzle (`$inferSelect` / `$inferInsert`), narrowed with `Pick` / `Omit` / `Partial`.
- Never hand-write a DTO that duplicates a column list.
- Zod schemas that mirror a table: derive with `drizzle-zod` (`createSelectSchema` / `createInsertSchema` / `createUpdateSchema`), then `.pick()` / `.omit()` / `.extend()` for the API-facing variant.
  - Exception: the API deliberately differs from the column (e.g. accepts omission but never explicit `null`). Keep that field hand-written with a one-line comment saying why.
- Full-column selects use `getTableColumns(table)`, not a hand-typed field list.
- Extra guarantees (e.g. force `updatedAt`) are a small overlay on the inferred type, not a redefinition.
- With `exactOptionalPropertyTypes`, use one shared `PartialUpdate<T>` helper instead of plain `Partial<T>`.
- No `any` in new code. Type every value precisely.
- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## 4. Errors

- Repository and service return raw typed data on success and **throw** a typed `AppError` on failure.
- Error family: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), base `AppError`. No raw `throw new Error(...)` in new code.
- Controllers do **not** catch. Wrap every async handler in `asyncHandler()` and let the global error handler map errors.
- Uniform shapes:
  - success: `{ success: true, data }`, or `{ success: true, data, meta }` for lists
  - failure: `{ success: false, message, code?, details? }`
- Status meaning is fixed:
  - 400: validation or bad selector
  - 404: resource (or relation row) not found
  - 409: duplicate / state conflict
  - 401 / 403: auth / permission
- Zod failures surface as 400 through the same global handler.
- No debug `console.log` left in controllers or services.

## 5. Routing and registration

1. Add the path constant to `end-points.ts`.
2. Add or update the Zod schemas.
3. Repository → service → controller (async-handler wrapped).
4. Declare the route in `src/routes/<feature>.ts`, then immediately `registry.register(...)` with OpenAPI summary, tags, request/response schemas and security.
5. Mount the router in `src/routes/index.ts` behind auth middleware.
6. Run lint, typecheck and tests, then regenerate the contract manifest (§9).

- Pick one path casing convention (no mixed `editX` / `EditX`).
- Static routes go before parameterised ones (`/items/open` before `/items/:id`).
- Legacy aliases only when backward compatibility is required, and say so.

## 6. Authorization

- Every route gets `requireAuth` **and** an authorization check (role or permission) on day one. Never retrofit.
- Roles and permissions are **data** (DB rows), not hard-coded enums. Prefer permission keys (`thing.manage`) over role names in route code.
- Enforce in middleware only. No RLS, no per-handler re-checks.
- Every state-changing action is authorised, and audit-trailed (who, what, when, old → new).
- Separate permissions for read and mutate when they differ.
- The actor who creates a record cannot approve it. Enforce separation of duties in the service.

## 7. List endpoints: pagination contract (no opt-out)

Every list/index endpoint is **always** paginated. There is no "return everything" mode.

| Param | Default | Rule |
|---|---|---|
| `page` | `1` | 1-based |
| `pageSize` | `10` | hard cap `100` (reject or clamp) |
| `sortBy` | — | whitelist per resource (Zod enum → 400 otherwise) |
| `sortDir` | `asc` | `asc` \| `desc` |

```ts
export const xListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum([...whitelist]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
```

- Response: `{ success: true, data: T[], meta: { page, pageSize, total, totalPages } }`, with `totalPages = Math.max(1, ceil(total / pageSize))`.
- Repository: always `.limit().offset()`. `orderBy` = requested column, then the **primary key as tie-breaker** (stable pages).
- Run the rows query and the `count()` query together with `Promise.all`. Two queries, never N+1.
- Search fields and filter behaviour are defined up front. Date filters state their day-boundary rule.
- An unbounded list is a **High** review finding.

## 8. Endpoint intake (answer before coding)

If any item is unresolved, stop and ask.

1. **Resource:** route group, owning module, one endpoint or split (master / relation / lookup).
2. **Surface:** exact method + path, casing, aliases, which of list / create / update / detail exist, delete intentionally omitted or not.
3. **Identity:** path `:id`, composite key or body selector; one-of selectors and how ambiguous input is rejected.
4. **Request:** required vs optional, `undefined` vs explicit `null`, ranges and enums, "at least one field" on update, existence checks on referenced IDs.
5. **Response:** shape, detail depth (full nested vs summary counts), batch per-row result and summary counts.
6. **Pagination and sorting:** §7 fully specified.
7. **Lookups:** combobox/autofill needs (searchable fields, autofill fields); lookup lives in the owning module.
8. **Batch:** single or array; sequential or transactional; partial success allowed; failure fails the row or the request; duplicate conflict = 409.
9. **Lifecycle:** delete route needed? If not, which flag is the soft delete (`isActive`) and do lists include inactive rows by default.
10. **Auth:** middleware, allowed roles/permissions per route, read vs write differences.
11. **Integrity:** foreign-key paths verified against the schema, transactional invariants, enums respected.
12. **Errors:** 400 / 404 / 409 / 401 / 403 matrix.
13. **Frontend fit:** list/search, detail, create, update, pagination/filter, lookup, inline edit and active-toggle flows are all covered.

Before coding, write a contract summary: route table, request schemas, response shapes, error matrix, open questions.

## 9. Contract publication

- The route registry is the source of truth that frontend developers and agents query. They do not read backend source.
- After **any** route, schema or auth change: regenerate the manifest (`.contracts/api-manifest.json`) and commit it.
- CI checks the manifest is current and that every frontend route path exists in the registry.
- Spot-check the route descriptor (request/response, auth, pagination, `sortableFields`) before calling the task done.
- A stale manifest is a shipped bug, same as a broken endpoint.

## 10. Database (Drizzle + Postgres)

- The schema in `src/db/schemas/` is the only way to change the DB. No hand-applied changes. Split files by domain, re-export from `index.ts`.
- Every table has audit columns: `createdBy`, `createdAt`, and for mutable tables `lastUpdatedBy`, `lastUpdatedAt`.
- **Money = integer minor units** (never floats). Quantities: state units and decimals explicitly per field.
- Soft delete via an `isActive` flag; hard deletes need a stated reason.
- Consistency-critical data (stock, balances) changes only through an append-only ledger. Never edit the running total directly.
- Transactions: one per business operation. Lock the parent row first, then write children, and take locks in a fixed order (e.g. by id) to avoid deadlocks.
- Re-check a limit or state after taking the lock. The pre-lock check is only for a fast 400.
- Avoid `references((): any => …)` for circular FKs; type the return as `AnyPgColumn`.
- Drizzle subqueries need unique column aliases.
- Review for: N+1, loops of repository calls, over-fetching (select only what is needed), independent awaits that should be `Promise.all`, unindexed filters.
- Dev DB is local Docker Postgres. Keep one command to wipe and rebuild it with seed data, and make that command refuse non-local hosts and production.

## 11. Testing

- `bun test`, tests co-located by layer under one folder mirroring `src/` (`tests/routes`, `tests/service`, `tests/repository`, `tests/lib`, `tests/types`).
- **Tests never touch the dev DB.** A preload swaps `DATABASE_URL` for `DATABASE_URL_TEST`, and refuses to run if it is missing, equals `DATABASE_URL`, or the name does not end in `_test`.
- HTTP-level tests call `createApp().request(...)`. The app factory (`createApp()`) is separate from the server entry point.
- Fixtures are name-prefixed (`TEST_…`), created in `beforeAll`, removed in `afterAll`. One shared DB client, closed once in the preload's `afterAll`.
- Name each test by the business rule it proves (`BR-XXX-NN …`). One behaviour per test.
- Tests are written from the spec, independent of the code author.
- Tests and code go in separate commits.
- Fix bugs test-first: a failing regression test, then the fix.
- Required gates before "done": `typecheck`, `lint`, `test`, contract check.

## 12. Tooling

| Need | Tool |
|---|---|
| Runtime / package manager | Bun |
| HTTP | Hono |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Validation | Zod (v4) |
| Auth | JWT (`jose`), `Bun.password` for hashing |
| Lint + format | Biome (run on every edit; `check --write`) |
| Typecheck | `tsc --noEmit` |

Keep `package.json` scripts few and stable: `dev`, `build`, `typecheck`, `lint`, `fix`, `test`, `db:push`, `db:reset`, `seed`, `contract:*`. Do not keep scripts nobody calls.

## 13. Security basics

- Validate every input with Zod before it reaches a service. Reject unknown keys on update bodies (`.strict()`).
- Access/refresh tokens with short-lived access tokens; refresh re-reads the user (deactivated users cannot refresh).
- Rate-limit auth endpoints.
- Body-size limit and explicit CORS origin in `createApp()`.
- Never log or return secrets, password hashes or tokens. Scripts that print DB targets must scrub passwords.
- Secrets come from env, validated at startup by a typed `env` module. Different secrets for access and refresh tokens.
- Guard destructive scripts: local host only, never production, explicit confirm for anything else.

## 14. Working style (for humans and agents)

- **Think first.** State assumptions; when unclear, stop and ask. Offer interpretations rather than silently picking one.
- **Simplicity.** Minimum code that solves the asked problem. Abstract at the second real use, not the first. No speculative configurability.
- **Surgical changes.** Every changed line traces to the request. Match existing style. Mention unrelated dead code instead of deleting it. Remove only what your change orphaned.
- **Goal-driven.** Turn the task into a verifiable check ("write the failing test, make it pass"). For multi-step work, state a short plan with a check per step.
- **Reuse before writing.** Locate all callers of a shared symbol before changing it.
- **Review depth matches risk.** A diff that touches 3+ files, a shared boundary (auth, contract, shared repository/service) or anything security-relevant gets an independent review. A single-file fix you fully understand may skip it, but say so explicitly.
- **Delegation brief:** `scope (files) · goal · constraints · done-check`. No vague hand-offs.

## 15. Review checklist (severity)

**High**
- Controller has logic or touches the DB / ORM directly.
- Async handler not wrapped, or errors swallowed in the controller.
- Missing auth or permission middleware on a route.
- List endpoint is unpaginated, or `page` / `pageSize` default to undefined.
- Response or error shape differs from the uniform wrapper.
- Route missing `registry.register(...)`, or the manifest is stale.
- Hard-coded route path instead of the `end-points.ts` constant.

**Medium**
- Duplicated type, schema or status union; hand-written DTO that Drizzle/Zod could derive.
- Zod schema duplicated locally instead of shared from `types/`.
- Pagination sort has no PK tie-breaker, or the `count` query is not parallel.
- N+1, over-fetch, sequential independent awaits.
- Missing OpenAPI metadata (summary, tags, schemas, security).

**Low**
- Optimisation ideas for observed bottlenecks only (limit + cursor/offset with cap, batch fetches, narrower selects, DB-side filter/sort, `Promise.all`, cache only with a clear invalidation path).
