# Phase 5 — Spatial Memory

**Status:** complete.
**Commit:** `dd10b0b` feat: add spatial memory (2026-09-18), on branch
`phase5-spatial-memory`. No message body; the description below is from the
README at that commit ("NOVA — Phase 5: Spatial Memory").

## Purpose

Let a meaningful arrangement be kept on purpose and returned to later, by name
or by description, across a browser reload.

## Major features

- `save this as my database workspace`, `remember this setup` (asks for a name),
  `continue my database work`, `continue where I left off`,
  `show my saved workspaces`, `delete … workspace`.
- A memory holds the workspace, the task, each window's place, size, angle and
  visibility, what was focused, and the relationships those positions add up to.
- Stored in `localStorage` behind a `MemoryRepository` interface.
- **Restores are plans of ordinary commands** (`RestorePlan`), run by the command
  bus — the memory layer never writes spatial state. Missing windows are
  skipped and reported.
- Nothing is saved automatically.

## Files

**Introduced:** `src/systems/memory/{memoryManager,memoryRepository,memoryResolver,memorySerializer,memoryStore,useMemory,verifyMemory}.ts`,
`src/types/memory.ts`.

**Modified:** `contextEngine.ts`, `contextGraph.ts`, `types/context.ts`,
`commandBus.ts`, `contextBridge.ts`, `intentRouter.ts`, `types/command.ts`,
`types/nova.ts`, `server.ts`, `CommandLine.tsx`, `ContextInspector.tsx`, `App.tsx`,
`index.css`, `README.md`, `package.json`.

## Tests

`src/systems/memory/verifyMemory.ts` (`npm run test:memory`) — 120 memory
assertions at this commit, per its README; still 120 today.

## Depends on

Phase 4: a memory is saved from, and restored through, the context graph
(`toContextSnapshot` turns a memory back into an input to the same builder).
