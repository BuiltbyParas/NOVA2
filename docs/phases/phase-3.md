# Phase 3 — Gemini Intelligence

**Status:** complete.
**Commit:** `4e894d6` feat: integrate NOVA Phase 3 Gemini intelligence layer
(2026-09-17), on branch `phase3-integration`. No message body.

## Origin

Phase 3 was first built as a separate Google AI Studio app in
[`BuiltbyParas/NOVA-phase3`](https://github.com/BuiltbyParas/NOVA-phase3)
(`97d382e` Initial commit, `b2f981f` feat: initialize NOVA Gemini intelligence
layer). That repository is a separate history — it is not an ancestor of NOVA.
`4e894d6` brought its server and supporting files into the NOVA tree.

## Purpose

Turn natural-language spatial instructions into deterministic, structured
commands, with Gemini on the server and a deterministic fallback when no model
is available.

## Major features

- `server.ts`: an Express server with `POST /api/gemini/command`, the NOVA
  system instruction, a JSON response schema (`status`, `confidence`,
  `intentSummary`, `commands[]`), and `localRuleBasedInterpreter` as an offline
  fallback; `GET /api/health`.
- `src/types/nova.ts`: the *intent* vocabulary (`NovaCommand` with actions such
  as `MOVE`, `FOCUS`, `OPEN`, and `SpatialRelation`), distinct from Phase 1's
  bus vocabulary in `src/types/command.ts`.
- `src/services/novaContext.ts`, `src/services/testSuiteData.ts`.
- Prototype panels carried over from the AI Studio app:
  `src/components/{CommandOutputViewer,ContextEditor,HandoffDocPanel,SpatialViewport,TestSuitePanel,VoiceInputButton}.tsx`.

## What the history shows about wiring

At `4e894d6` the only file under `src/` that calls `/api/gemini` is
`HandoffDocPanel.tsx`, and none of the prototype panels is imported by NOVA's
`App.tsx`. The live NOVA interface began calling Gemini in **Phase 4**, when
`src/systems/command/intentRouter.ts` was added (`33bdbbb`). Today the
prototype panels are still unimported; `VoiceInputButton.tsx` was removed in
Phase 6 (`e56e34d`).

## Files

**Introduced:** `.env.example`, `metadata.json`, `server.ts`, `src/types/nova.ts`,
`src/services/{novaContext,testSuiteData}.ts`, the six prototype components above.
**Modified:** `package.json`.

## Tests

None were added in this commit; `npm test` remained the vision suite. The
Gemini endpoint is not exercised by any suite, because the suites run without
network access.

## Depends on

Phase 1's command vocabulary — Gemini produces intents; it never touches the
scene. Later, Phase 4's `contextBridge.ts` became the one translator from the
intent vocabulary into bus commands.
