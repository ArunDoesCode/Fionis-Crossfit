# Member app — CLAUDE.md (Expo / React Native)

Thin native client for gym members: check in, enter a result, see history/progress/boards, receive push.
The TV is the main experience; the phone handles the edges. **No separate standards file exists for Expo yet:
this file is the draft standard** — refine it after the first feature (`/wrap`). Where the Next.js standard
(`../docs/standards/nextjs-standards.md`) applies in spirit (TanStack Query, Zod, route constants, no raw
fetch in components, Biome, no `any`), follow it. Detailed how-to: `.claude/agents/expo-builder.md`, skills
`native-ui-glass`, `offline-writes`.

## Not a monorepo
Own `package.json`, Biome config, lockfile. Nothing imported from `../backend`/`../frontend`. Contract = the
HTTP API: types generated from `../backend/.contracts/openapi.json` via `bun run types:api` →
`src/types/api.generated.ts` (never edit). Zod input schemas in `src/lib/validators/` mirror the backend's.

## Rules
1. **Thin client.** No ranking, PR, award or business validation. Only input constraints (mm:ss wheel,
   steppers) and the same shape checks the API runs.
2. **One data path:** `src/lib/api/client.ts` (fetch wrapper, `ApiError`, timeout, bearer from
   `expo-secure-store`, refresh once) → `src/lib/api/<feature>/{fetchers,queries}.ts` → screens. Paths only in
   `src/lib/api/routes.ts`. No `fetch` in components.
3. **Cached-first:** TanStack Query persisted to MMKV (`buster` = app version); hold the native splash
   (`preventAutoHideAsync`) until session + cache are ready; render from cache, then revalidate. No
   persistent sockets: refetch on focus, on push, and poll every 10 s only while a session is in progress or
   awaiting results (foreground).
4. **Offline writes:** every mutation goes through the persisted queue with an `Idempotency-Key`; UI shows
   "pending sync"; 409/422 surface a human message and drop the item (skill `offline-writes`).
5. **Design system:** glass only on the control layer via `src/ui/Surface` / `GlassButton`
   (iOS 26+ `expo-glass-effect`; iOS < 26 `expo-blur`; Android Material 3 tonal surfaces). No platform
   checks outside `src/ui/`. Honour Reduce Transparency. Tokens only (skill `native-ui-glass`).
6. **Navigation:** `expo-router` with native tabs (`Today · History · Progress · Board · Profile`).
7. Lists use `FlashList`; animation uses Reanimated; system fonts; lazy-load the chart and camera screens.
8. Push permission is requested after the first successful check-in, not at launch.
9. Forced-update gate from `GET /config` (`minAppVersion`) and HTTP 426.

## Structure
```
member/
├── app/                 expo-router routes (tabs, check-in, result-entry, auth)
└── src/
    ├── ui/              Surface, GlassButton, tokens, haptics (the only place with platform branching)
    ├── features/<name>/ screens + feature components
    ├── lib/             api/ (client, routes, <feature>/), store/, validators/, messages/, offline/, env.ts
    └── types/           api.generated.ts (generated), index.ts
```

## Stack and commands
Bun, Expo (current stable SDK, New Architecture), expo-router, TanStack Query + persist, MMKV, secure-store,
FlashList, Reanimated, expo-camera, expo-notifications, expo-glass-effect, expo-blur, victory-native or
react-native-gifted-charts, RHF + Zod, Biome. Pin the SDK and verify `expo-router/unstable-native-tabs` at M4 start.
```bash
bun run start | ios | android
bun run typecheck | lint | fix | test
bun run types:api
```
Tests: logic in `tests/`, flows in `.maestro/` (test-writer only). Builds: EAS (`preview`, `production`).

## Env (EAS / `.env`, documented in `.env.example`)
`EXPO_PUBLIC_API_URL`. No secrets in `EXPO_PUBLIC_*`.
