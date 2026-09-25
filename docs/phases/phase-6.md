# Phase 6 — Voice

**Status:** complete.
**Commit:** `e56e34d` feat: add voice intelligence (2026-09-19), on branch
`phase6-voice-intelligence`. No message body; the description below is from the
README at that commit ("NOVA — Phase 6: Voice Intelligence").

## Purpose

A second way to say everything NOVA already understands — out loud — without a
second intelligence: a spoken sentence is handed to the same function a typed
one is.

## Major features

- `S` or the microphone chip listens for a sentence, shows it as you speak, and
  acts on the final result only; interim speech is never executed.
- The transcript goes to `routeUtterance`, the same entry point as the command
  line, so spatial, contextual and memory commands all work by voice.
- `Escape` cancels. Web Speech API; where unavailable, the chip says so and
  nothing else changes. No wake word, no always-on listening, no audio stored.
- A lifecycle `idle → listening → processing → success | error` (plus
  `unsupported`), in a store with no knowledge of windows.

## Files

**Introduced:** `src/systems/voice/{speechRecognizer,voiceInputSource,voicePipeline,voiceStore,verifyVoice}.ts`,
`src/types/voice.ts`.

**Removed:** `src/components/VoiceInputButton.tsx` (the Phase 3 prototype button).

**Modified:** `CommandLine.tsx`, `SystemLayer.tsx`, `commandBus.ts`, `contextBridge.ts`,
`intentRouter.ts`, `keyboardCommands.ts`, `input/types.ts`, `types/command.ts`,
`index.css`, `README.md`, `package.json`.

## Tests

`src/systems/voice/verifyVoice.ts` (`npm run test:voice`) — 99 voice assertions
at this commit, per its README; 123 today, after the presentation sprint
(`17aa729`) added sustained listening and `microphone.ts`.

## Depends on

Phases 3–5: voice adds no execution of its own, so everything after the
transcript — Gemini, the context engine, memory commands, the bus — is reused.
