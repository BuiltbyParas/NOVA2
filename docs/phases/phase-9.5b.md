# Phase 9.5B — Gesture-Native Control

**Status:** current implementation state.

Two commits carry the 9.5B work directly. Five commits landed between them
without a phase number in their messages; they are listed separately below so
nothing is attributed on assumption.

## 1. Gestures through the command pipeline — `dc86804` (2026-09-19)

*feat: route gestures through the existing command pipeline*

From the commit: a double pinch on a spatial window issues the same `OPEN`
command the command line and voice produce, rather than calling into the scene
directly. Gestures become a third input source on the one bus.

- `gestureIntent()` is pure: it commands only on `DOUBLE_PINCH`, only above the
  hand-confidence floor, and only when the referent is resolved.
- `gestureCommands.ts` turns the intention into the sentence `open <window>` and
  hands it to `routeUtterance`.
- `interactionSystem` latches activation, because hand frames arrive at ~30 fps
  while `update()` runs faster; the commit notes that one pinch had fired as five
  `OPEN` commands before the latch.
- Scope is the five spatial surfaces; no fake targets for discovered applications.

**Introduced:** `src/systems/multimodal/{gestureIntent,gestureCommands,verifyGestureIntent}.ts`.
**Modified:** `interactionSystem.ts`, `package.json`.

## 2. Air click hardening — `522c6d0` (2026-09-25)

*feat: harden gesture air click interaction*

From the commit: with a real hand, the second pinch of a double pinch opened a
drag that swallowed the activation on its own release frame, so an air click
only focused and nudged the window. The commit:

- labels hand-originated interaction commands `gesture` (mouse stays `pointer`),
  read from `inputRouter` as each frame arrives;
- gates hand press, close, minimize, Core and activation on the existing 0.6
  confidence floor;
- adds an armed state marking the window a confident hand would select;
- gives a hand pinch a dead-zone equal to the recogniser's tap limits
  (`TAP_MAX_TRAVEL`, `TAP_MAX_MS`) before it drags, and activates a pinch that
  never travelled;
- lets the Command Deck claim hand activation while open, so one double pinch is
  exactly one choice.

**Modified:** `interactionSystem.ts`, `CommandDeck.tsx`, `SpatialWindowView.tsx`,
`gestureRecognizer.ts` (named constants only), `index.css`,
`verifyGestureIntent.ts`, `verifyVision.ts`.

## 3. Landed between them (no phase number in the commit messages)

| Commit | Summary | Introduced |
| --- | --- | --- |
| `91d9f74` | Native–spatial synchronisation: a pure comparison reporting each application as `synced`, `native-only`, `spatial-only`, `absent` or `unknown`; changes nothing. 102 new assertions, 10 suites and 1111 in total. | `nativeSpatialSync.ts`, `verifyNativeSpatialSync.ts`, `types/nativeSync.ts` |
| `17aa729` | Presentation sprint (no message body): Status HUD, voice panel, sustained microphone listening, built-in command tests; also removed the native launch from category `open` commands. | `StatusHUD.tsx`, `VoicePanel.tsx`, `microphone.ts`, `useHandPresence.ts`, `verifyBuiltinCommands.ts` |
| `8185b49` | NOVA Pulse: a breathing dot and live running-application count in the HUD, from the existing snapshot. | — |
| `b18a096` | Focus moment: a one-shot accent ring when a window takes focus; silent under reduced motion. | — |
| `3515b79` | Command Deck: an arc of the five surfaces beside the cursor; a selection becomes `open <surface>` through `routeUtterance`. | `CommandDeck.tsx` |

## Tests

`src/systems/multimodal/verifyGestureIntent.ts` (`npm run test:gesture`) — 92
assertions before `522c6d0`, 131 after; `verifyVision.ts` gained single- and
held-pinch checks. `verifyNativeSpatialSync.ts` (`npm run test:sync`) — 102.

## Depends on

Phase 2 (the recogniser's `DOUBLE_PINCH`), Phase 7 (the referent, its 8 s
lifetime and 0.6 confidence floor), and the Phase 3–6 sentence pipeline that
`routeUtterance` provides.
