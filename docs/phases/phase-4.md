# Phase 4 — Context Awareness

**Status:** complete.
**Commit:** `33bdbbb` feat: add spatial context engine (2026-09-18), on branch
`phase4-context-engine`. No message body; the description below is from the
README at that commit ("NOVA — Phase 4: Spatial Context Engine").

## Purpose

Let NOVA understand not only which windows exist but what they are for, how
they relate to one another, and which task and workspace they belong to — so a
sentence can say "this", "it" or "the one on the right" instead of a name.

## Major features

- A derived, never authoritative **context graph** built as a pure function of
  a snapshot of `spatialStore`, rebuilt only when a command changes something
  and only when something asks.
- **Reference resolution**: `this`, `it`, semantic roles, spatial extremes
  ("the one on the right"), relations ("right of code") and task phrases
  ("everything related to my database work").
- **Asking instead of guessing** when two readings are equally good, with the
  candidates offered as buttons; nothing executes while the question is open.
- The **intent pipeline**: `intentRouter.ts` (`routeUtterance`, local matching,
  then Gemini) and `contextBridge.ts`, the single translator from Gemini's intent
  vocabulary into bus commands. This is where the live interface first calls
  `/api/gemini/command`.
- The **context inspector** (`c`, development builds only).

## Files

**Introduced:** `src/systems/context/{contextEngine,contextGraph,referenceResolver,spatialRelations,useContextEngine,verifyContext}.ts`,
`src/systems/command/{intentRouter,contextBridge}.ts`, `src/types/context.ts`,
`src/data/tasks.ts`, `src/components/debug/ContextInspector.tsx`.

**Modified:** `server.ts`, `commandBus.ts`, `CommandLine.tsx`, `keyboardCommands.ts`,
`spatialStore.ts`, `types/command.ts`, `App.tsx`, `index.css`, `README.md`,
`package.json`.

## Tests

`src/systems/context/verifyContext.ts` (`npm run test:context`) — 102 context
assertions at this commit, per its README; still 102 today.

## Depends on

Phase 1 (store, command bus, workspaces) and Phase 3 (the Gemini endpoint and
intent vocabulary, which Phase 4 wires into the live command line).
