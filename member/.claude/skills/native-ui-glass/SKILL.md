---
name: native-ui-glass
description: "Use when building member-app UI that touches the control layer or visual style: tab bar, floating buttons, sheets, toolbars, cards, theme tokens, Liquid Glass on iOS 26+, blur fallback on older iOS, Material 3 on Android, Reduce Transparency. Triggers: liquid glass, glass, blur, material, surface, theme, tokens, native tabs, haptics."
---

# Native UI: Liquid Glass (iOS) and Material 3 (Android)

## Principles
- Glass is for the **control layer** (tab bar, floating buttons, sheets, toolbars), never for content cards or
  lists. At most ~3 glass elements per screen.
- Screens import only `Surface` and `GlassButton` from `src/ui/`. All platform logic lives in `src/ui/`.

| Platform | `Surface variant="glass"` renders |
|---|---|
| iOS 26+ | `GlassView` from `expo-glass-effect` (gate with `isLiquidGlassAvailable()`) |
| iOS < 26 | `BlurView` (`expo-blur`, system material) + hairline border |
| Android | Material 3 tonal surface container with dynamic color; blur only if it measures well on mid-range devices |

Android is not given a fake Liquid Glass look; follow Material 3 (dynamic color, tonal elevation, larger
shapes, springy motion).

## Rules
- Tab bar: `expo-router/unstable-native-tabs` so iOS 26 gets the native glass tab bar and Android its Material
  navigation. Verify the API against the installed Expo SDK before use (it is marked unstable).
- Build iOS with an Xcode 26 EAS image, otherwise glass APIs do not render.
- Respect Reduce Transparency / Increase Contrast: render an opaque surface.
- No body text directly on glass without a contrast check in light and dark; test over busy content.
- Tokens only: `surface`, `onSurface`, `accent`, `success`, `danger`, `pr`, tier colors; light + dark. No hex in screens.
- Haptics (`expo-haptics`) on check-in success, result submitted, PR/award.
- System fonts (SF Pro / Roboto); icons via the native tabs `Icon` (SF Symbols / Material symbols) or one icon set.
- Animation with Reanimated on the UI thread; never JS-driven.

## Review checklist
- [ ] glass only on controls · [ ] opaque fallback with Reduce Transparency · [ ] contrast checked light/dark
- [ ] no platform branching outside `src/ui/` · [ ] tokens only · [ ] checked on iOS 26, iOS 18 and Android
