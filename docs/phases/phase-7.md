# Phase 7 — Multimodal

**Status:** complete.
**Commit:** `f884673` feat: add multimodal spatial intelligence (2026-09-19), on
branch `phase7-multimodal`. No message body; the description below is from the
README at that commit ("NOVA — Phase 7: Multimodal Spatial Intelligence").

## Purpose

Let the input modalities be used together: point at a window with the mouse or
a hand, and say "move this beside Code".

## Major features

- A device contributes a **referent**, never a command: pointing says "that
  one", never "move it".
- The priority model: an explicit name wins, then `select` (clicked or pinched),
  then `point`, then focus, then recency. Tiers never blend; two different
  devices indicating different windows is ambiguity, and NOVA asks.
- Signals expire after 8 seconds; a hand below 0.6 confidence is ignored.
- A pipeline trace (`input → said → resolved → command → result`) in the
  context inspector.
- `src/systems/native/systemAdapter.ts` first appears here, as the declared
  seam where a real computer would later attach — with no implementation.

## Files

**Introduced:** `src/systems/multimodal/{interactionContext,multimodalDriver,pipelineTrace,referentResolution,verifyMultimodal}.ts`,
`src/types/multimodal.ts`, `src/systems/native/systemAdapter.ts`.

**Modified:** `interactionSystem.ts`, `inputRouter.ts` (exposes `activeModality()`),
`intentRouter.ts`, `contextEngine.ts`, `contextGraph.ts`, `referenceResolver.ts`,
`types/context.ts`, `ContextInspector.tsx`, `App.tsx`, `index.css`, `README.md`,
`package.json`.

## Tests

`src/systems/multimodal/verifyMultimodal.ts` (`npm run test:multimodal`) — 80
multimodal assertions at this commit, per its README; 99 today, after Phase 8,
Phase 9 and the presentation sprint extended it.

## Depends on

Phase 2 (hand pointing), Phase 4 (the resolver consumes the referent), Phase 6
(voice supplies the sentence).
