# Phase 9.5 (9.5A) — Universal Application Discovery

**Status:** current development milestone.
**Commit:** `e27ac8e` feat: complete universal native application launch
(2026-09-19). The source code and commit call this **Phase 9.5A**.

## Purpose

From the commit: let NOVA open applications that are actually installed on the
host, not just its five spatial ones — and make naming a specific application
get you that application.

## Major features (from `e27ac8e`)

- **`applicationCatalog.ts`**: a pure resolver from a spoken or typed name to a
  desktop entry id, matching display name, desktop id, NOVA category, token
  prefix and id segment, in that order. Every id it returns was read out of the
  catalog it was given, so a phrase can never resolve to itself.
- **Conservative:** two equally good matches produce a question, never a pick
  ("open LibreOffice" asks Calc, Impress or Writer).
- **No second discovery system:** the catalog is the Phase 8 snapshot.
- **`OPEN_APPLICATION` accepts a desktop id** as well as an `AppType`. On the
  server an id is accepted only after a shape check, then membership in the
  catalog the server itself enumerated from disk, then path resolution.
- **A separate `open-application` command**, because `open` is bound to a
  spatial window with a placement in every workspace; a discovered application
  launches and gets no surface.
- **`npm run dev` starts `server.ts`** instead of bare Vite, so `/api` always
  exists; `dev:frontend-only` keeps bare Vite.
- **Category and product names separated:** `GENERIC_APP_NAMES` holds category
  words only, so "open Chrome" no longer becomes `OPEN(browser)` and launches
  Firefox. Paths and arguments (`/bin/bash`, `bash -c id`) resolve to nothing.

The commit records verification on Fedora 44 against a 54-application catalog
(Chrome, Firefox, Calculator, Spotify and VS Code each launched their own
desktop id; `open terminal` and `open browser` still opened NOVA's surfaces),
and **8 suites, 917 assertions** passing.

## Files

**Introduced:** `src/systems/native/{applicationCatalog,verifyApplicationCatalog}.ts`.

**Modified:** `native/linuxLauncher.ts`, `native/linuxProvider.ts`, `server.ts`,
`src/data/apps.ts`, `commandBus.ts`, `commandParser.ts`, `contextBridge.ts`,
`intentRouter.ts`, `nativeActions.ts`, `verifyNativeAction.ts`, `types/command.ts`,
`types/nativeAction.ts`, `README.md`, `package.json`.

## Tests

`src/systems/native/verifyApplicationCatalog.ts` (`npm run test:catalog`) — 198
assertions today.

## Depends on

Phase 9's launch path and security boundary, Phase 8's installed-application
catalog, and Phase 4's `contextBridge.translateOpen`.
