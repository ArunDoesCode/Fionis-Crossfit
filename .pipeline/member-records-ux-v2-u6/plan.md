# Plan — U6 minimal performance (owner: simple, lazy-load, no complex caching)
Spec: performance.md Build clarifications U6 (BR-REC-208 partial, 209, 210, 211, 212 partial). Issues #54–#58 (partial).
- [ ] tests → [ ] frontend-dev: lib/queryClient.ts defaults, lib/env.ts (no zod in client), next.config.ts, ci.yml `next build`, useToday formatter, draft autosave 300ms, overlay blur CSS, dead deps, lazy-load heavy client bits | backend-dev: E18 Promise.all, pool config, due engine skips archived in SQL → [ ] verify
Out (deferred): ETag on lists, shared Home due computation, server prefetch #20, sibling-tab prefetch.
