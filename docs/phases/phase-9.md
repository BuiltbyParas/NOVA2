# Phase 9 — Native Application Control

**Status:** complete.
**Commit:** `7f53b90` feat: add controlled native application launch (2026-09-19).

## Purpose

From the commit: "Phase 9 connects NOVA's existing `open` command to a real
allowlisted Fedora application. Awareness (Phase 8) gains exactly one hand."

## Major features (from `7f53b90`)

- One capability, `OPEN_APPLICATION`, reachable only through the existing
  `SystemAdapter`, which now enumerates what it may do.
- The browser sends only `{capability, applicationId}`, where `applicationId`
  was then an `AppType` — never a path, a command or a desktop id.
- Launching is `spawn('gio', ['launch', <path resolved server-side>])` with
  `shell: false`, from a hardcoded server-side allowlist mapping each of the five
  spatial types to preference-ordered desktop entries.
- The read path (`linuxProvider.ts`) and the write path (`linuxLauncher.ts`) are
  separate files; the snapshot endpoint stays read-only.
- `OPEN` on an application not currently represented now opens it.
- No new command bus, no new command type, no widening of `AppType`.

The commit records verification on Fedora 44 / GNOME / Wayland (terminal, notes
and browser launched real applications; `/bin/bash`, `bash -c id`,
`terminal; rm -rf`, a raw desktop id and an unknown capability were rejected by
the live endpoint), and **7 suites, 691 assertions** passing.

## Later change to Phase 9 behaviour

In Phase 9, opening a category (`open browser`) opened NOVA's surface *and*
launched the allowlisted host application. The presentation sprint (`17aa729`)
removed the native launch from the `open` command: a category word now opens
only NOVA's own surface, and only a product name launches a program (see
[Phase 9.5](phase-9.5.md)). The server-side allowlist is still present in
`native/linuxLauncher.ts`.

## Files

**Introduced:** `native/linuxLauncher.ts`, `src/systems/native/{nativeActions,verifyNativeAction}.ts`,
`src/types/nativeAction.ts`.

**Modified:** `native/linuxProvider.ts`, `server.ts` (`POST /api/native/action`),
`systemAdapter.ts`, `commandBus.ts`, `contextBridge.ts`, `verifyNative.ts`,
`verifyMultimodal.ts`, `package.json`.

## Tests

`src/systems/native/verifyNativeAction.ts` (`npm run test:native-action`) — 151
assertions today. No unit test claims a real application launched; that is
verified on the machine.

## Depends on

Phase 8's provider (desktop-entry resolution), `SystemAdapter` (Phase 7) and the
Phase 1 command bus.
