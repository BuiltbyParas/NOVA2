# Phase 10 — NOVA Intelligence Core

**Status:** complete.
**Commits:** developed in NOVA2 after the snapshot; see this repository's history
for the commit that introduces it.

## Purpose

Turn NOVA from a shell that obeys commands into an assistant you can talk to —
answering questions, holding a conversation, following references — while every
action it takes still travels the existing command pipeline.

## Major features

- **A conversation session** (`src/systems/intelligence/intelligenceSession.ts`):
  messages held in the browser, one entry point (`converse`), turns queued in
  order, a reset (↺ or "start over").
- **Response modes.** Each turn is answered as `conversation`, `action`,
  `clarification` or `refusal`.
- **Follow-ups and references.** Earlier turns are sent with each message, so
  "explain it like I'm 15" and "open it" are read against the conversation.
- **Actions through the existing pipeline.** An action is one NOVA instruction
  *sentence* ("open Spotify", "minimize notes") handed to `routeUtterance` — the
  same function typing and speech use — so the catalog, the category-versus-product
  rule, reference resolution, clarifying questions and the command bus all apply
  unchanged. Outcomes are reported honestly: an action the pipeline could not
  carry out is shown as not done, never as the model's claim.
- **Direct commands without the model.** A short sentence that begins with a
  command verb, has no question and no conversational reference, and that the
  Phase 1 matcher understands ("open terminal") runs immediately.
- **A deliberate context projection** (`intelligenceContext.ts`): workspace name,
  focused window, open NOVA surfaces, installed and running application *names*,
  and NOVA's last five actions. No positions, desktop ids, paths or store.
- **The Intelligence Surface** (`src/components/interface/IntelligenceSurface.tsx`):
  opened with `I` or the HUD's AI row. Light NOVA glass, NOVA's replies marked by
  a thin accent rule, action outcomes as small chips, answer chips for questions,
  a microphone button that uses the existing voice system.
- **Voice integration.** Still the one voice connection: while the surface is
  open, a spoken sentence is answered in the conversation instead of the command
  line, and its actions carry the `voice` source.
- **A server endpoint** `POST /api/intelligence/turn` in `server.ts`, separate
  from Phase 3's `/api/gemini/command`, which is unchanged.

## Security

- The Gemini key is read only by the server; the browser never sees it.
- The server rebuilds every request field by field (`sanitizeRequest`): unknown
  fields and non-`user`/`nova` history lines are dropped, lengths capped.
- A simple rate limit: 30 turns per minute per server process.
- The model's answer is validated on the server *and again* in the browser
  (`parseModelReply`): unknown modes are refused, text is cut.
- An action sentence must pass `isSafeInstruction`: at most 160 characters,
  letters, digits and sentence punctuation only, and none of shell characters,
  paths, `~`, `..`, or words such as `sudo`, `rm`, `bash`, `curl`. An unsafe
  action becomes a refusal and runs nothing.
- Launching is unchanged: the server's own catalog membership check, then
  `gio launch` with `shell: false`.
- When the model is unavailable, only a verb-led instruction with no question and
  no conversational reference is offered to the pipeline — so a question such as
  "how do I reset my router?" can never be misread by the Phase 1 matcher.

## Failure handling

`unavailable`, `rate_limited`, `timeout` (20 s in the browser), `network`,
`malformed`, `empty` and `invalid_request` each produce a short, honest message
in the conversation, and NOVA is never left "thinking". The server tries
`gemini-3.6-flash`, `gemini-3-flash-preview` and `gemini-3.1-flash-lite`, then
once more after a pause, within a 16 s budget.

## Files

**Introduced:** `src/systems/intelligence/{protocol,intelligenceContext,intelligenceSession,verifyIntelligence}.ts`,
`src/components/interface/IntelligenceSurface.tsx`.

**Modified:** `server.ts`, `src/components/interface/{CommandLine,StatusHUD,SystemLayer}.tsx`,
`src/systems/input/keyboardCommands.ts`, `src/index.css`, `package.json`.

## Tests

`src/systems/intelligence/verifyIntelligence.ts` (`npm run test:intelligence`) —
151 assertions: protocol validation, context projection, conversation and
follow-ups, actions reaching the bus, direct commands, every failure mode, the
real HTTP transport re-validating hostile answers, session ordering and reset,
and `routeUtterance` unchanged. The model itself is mocked; real Gemini turns
were exercised against the running server.

## Limitations

- **Latency depends on Gemini's availability.** During development the models
  often returned 503 "high demand"; turns then took 6–16 s through the fallback
  chain.
- No streaming (the structured JSON answer cannot stream); a thinking indicator
  is shown instead.
- The conversation lives in memory and is lost on reload.
- NOVA does not speak its answers.
- Real microphone hardware was not exercised in automated tests.
- NOVA cannot open websites, pages or files; asked to, it says so.
- The instruction filter is conservative: an installed application whose name
  contains a word such as "Python" or "Node" is refused.
- "this" and "that" referring to windows are resolved by NOVA's existing context
  system, not by a new spatial grounding model.

## Depends on

Phase 3 (the Gemini server), Phase 4 (`routeUtterance` and the context graph),
Phase 6 (voice), Phase 8 and 9.5 (the installed-application catalog), and the
command bus from Phase 1.
