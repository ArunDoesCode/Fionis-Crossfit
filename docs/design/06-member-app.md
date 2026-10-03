# 06 Member app (`apps/member`, Expo)

A thin, fast, native data-entry and history tool. The TV is the main experience; the phone handles the edges: check in, enter result, look back at progress.

## Navigation (native tabs)

`Today · History · Progress · Board · Profile` (Membership tab added in phase 7). Use `expo-router/unstable-native-tabs` so iOS 26 renders the native Liquid Glass tab bar and Android renders its Material navigation.

## Screens

| Screen | Purpose and states |
|---|---|
| Sign-in | Email → 6-digit OTP (`shouldCreateUser: false`). Errors: unknown email → "Ask your gym to invite you" |
| **Today** | Renders `MyContext.state`: `none` (next class), `can_check_in`, `checked_in`, `in_progress`, `awaiting_result`, `submitted`, `missed`. One primary action per state |
| Check-in confirm | "Check in to 9:00 WOD?" with workout name; one tap; reached from universal link, in-app scanner, or Today button |
| Result entry | Constrained input by scoring type: `mm:ss` wheel for time; steppers for reps/kg/rounds+reps; Rx/Scaled segmented control; "Capped" switch reveals reps-completed. Echo confirmation ("12:43 · Rx") before submit. Outlier → confirm sheet |
| Submitted | Value, delta vs usual, PR badge/awards earned (haptic), edit button while allowed |
| History | FlashList of attended sessions; filter by benchmark/date; delta vs usual; PR badges |
| Benchmark detail | Chart per division (Y axis flipped for time so up = better), PR markers, best/latest/baseline, attempts table. Capped attempts plot hollow labelled "CAP +N" |
| Progress | Recent PRs, sessions per week, streak, "beat your usual" rate, "retest?" list, achievements shelf |
| Board | Segmented: Today (vs usual + raw), Week, Month, All-time per benchmark/division |
| Profile | Name, show-on-board toggle, notifications toggle, app version, sign out |
| Membership (phase 7) | Plan, renewal, pay via Stripe Checkout, invoices |

## Flows

- **Check-in:** TV QR encodes `https://<domain>/checkin?t=<token>`. App installed → universal link opens Check-in confirm. Not installed → web page (served by `apps/web`) with store links. In-app "Scan" button uses `expo-camera` barcode scanning. Calls `POST /v1/check-in` with a generated `Idempotency-Key`.
- **Result entry:** available when `MyContext.state` is `awaiting_result` (session `collecting|results`). Submit via `POST /v1/sessions/:id/result`.
- **Offline queue:** all writes go through a persisted mutation queue (MMKV). Each mutation has an `Idempotency-Key`. UI shows "Pending sync" chip; retries with backoff and on app foreground/network regain; conflicts (409/422) surface a human message and remove the item.
- **Refresh:** no persistent sockets. Refetch `context` on app focus, on push received, and poll every 10 s while `state` is `in_progress|awaiting_result` and the app is foregrounded.
- **Push:** `expo-notifications`; register token via `POST /v1/me/push-token` after sign-in. Types: class reminder, "Enter your result", PR/achievement recap. Permission requested after the first successful check-in, not at launch.
- **Forced update:** `GET /config` `minAppVersion` (and 426 from API) shows a blocking update screen.

## Performance

- Hold native splash (`expo-splash-screen` `preventAutoHideAsync`) until secure-store session restored and persisted query cache hydrated; then render from cache immediately and revalidate.
- TanStack Query persisted to MMKV; narrow payloads; cursor pagination; FlashList with memoized rows.
- Reanimated (UI thread) for animation. System fonts (SF Pro / Roboto). Lazy-load chart lib on Benchmark screen.
- Budgets: cold start to Today from cache < 1.5 s (mid-range Android, iPhone 12 class); list scroll 60 fps.

## Design system (Liquid Glass on iOS, Material 3 Expressive on Android)

Principles:
- Glass is for the **control layer** (tab bar, floating buttons, sheets, toolbars), not content cards/lists.
- All screens use `Surface` and `GlassButton` from `apps/member/src/ui`; platform logic lives only there.

| Platform | `Surface variant="glass"` renders |
|---|---|
| iOS 26+ | `GlassView` from `expo-glass-effect` (gate with `isLiquidGlassAvailable()`) |
| iOS < 26 | `BlurView` (system material) + hairline border |
| Android | Material 3 Expressive tonal surface container with dynamic color; blur only if it measures well on mid-range devices |

Rules:
- Build with an Xcode 26 EAS image or glass APIs do not render.
- Respect Reduce Transparency / Increase Contrast: render opaque surface.
- No body text directly on glass without sufficient contrast; test light/dark over busy content.
- Max about 3 glass elements per screen.
- Semantic tokens only (`surface`, `onSurface`, `accent`, `success`, `danger`, `pr`, tiers); light and dark.
- Haptics: check-in success, result submitted, PR/award.
- Icons: SF Symbols (iOS) / Material symbols (Android) via native tabs `Icon`.
- Android is not given a fake glass look; it follows Material 3 Expressive (dynamic color, tonal elevation, larger shapes, springy motion).

## Acceptance checklist

- Sign-in → check in → submit → History shows the result, on iOS 26, iOS 18 and Android 14+, with Reduce Transparency on and off.
- Airplane-mode submit queues, syncs on reconnect, shows exactly one result (idempotent).
- Cold start from cache under budget; no blank frame between splash and first screen.
