# Phase 8 — Native System Awareness

**Status:** complete.
**Commit:** `586ce2c` feat: add native system awareness (2026-09-19). No message
body; the description below is from the README at that commit ("NOVA — Phase 8:
Native System Awareness").

## Purpose

Open NOVA's eyes to the computer it is running on — read-only. Awareness before
control.

## Major features

- `GET /api/native/snapshot`: one parameterless endpoint. A local Node provider
  reads `os`, `/etc/os-release`, XDG session variables, desktop entries and
  `/proc/<pid>/comm` (never `cmdline`, because arguments carry secrets).
- A normalised, validated `NativeSnapshot`: platform, desktop session, installed
  desktop applications and which are running.
- Window enumeration is reported **unavailable under Wayland**, with the reason,
  rather than bypassed.
- An identity map from native applications to NOVA's `AppType`s (Firefox,
  Chrome and Brave are all `browser`); anything unrecognised stays `unknown`.
- Refreshed every 30 seconds, never per frame. Native state is never merged into
  spatial state.

## Files

**Introduced:** `native/linuxProvider.ts`,
`src/systems/native/{appIdentityMap,nativeBridge,nativeStore,useNativeAwareness,verifyNative}.ts`,
`src/types/native.ts`.

**Modified:** `server.ts`, `systemAdapter.ts`, `contextEngine.ts`, `contextGraph.ts`,
`types/context.ts`, `verifyMultimodal.ts`, `ContextInspector.tsx`, `App.tsx`,
`tsconfig.node.json`, `index.css`, `README.md`, `package.json`.

## Tests

`src/systems/native/verifyNative.ts` (`npm run test:native`) — 166 native
assertions at this commit, per its README; still 166 today.

## Depends on

Phase 7's `SystemAdapter` seam, and Phase 4's context engine, which receives the
snapshot as awareness only.
