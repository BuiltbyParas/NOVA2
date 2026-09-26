# NOVA — Phase 11: Spatial Visual Environment

![Phase 1 — complete](https://img.shields.io/badge/phase%201-complete-5B5CE2?style=flat-square)
![Phase 2 — complete](https://img.shields.io/badge/phase%202-complete-5B5CE2?style=flat-square)
![Phase 3 — complete](https://img.shields.io/badge/phase%203-complete-5B5CE2?style=flat-square)
![Phase 4 — complete](https://img.shields.io/badge/phase%204-complete-5B5CE2?style=flat-square)
![Phase 5 — complete](https://img.shields.io/badge/phase%205-complete-5B5CE2?style=flat-square)
![Phase 6 — complete](https://img.shields.io/badge/phase%206-complete-5B5CE2?style=flat-square)
![Phase 7 — complete](https://img.shields.io/badge/phase%207-complete-5B5CE2?style=flat-square)
![Phase 8 — complete](https://img.shields.io/badge/phase%208-complete-5B5CE2?style=flat-square)
![Phase 9 — complete](https://img.shields.io/badge/phase%209-complete-5B5CE2?style=flat-square)
![Phase 9.5 — complete](https://img.shields.io/badge/phase%209.5-complete-5B5CE2?style=flat-square)
![Phase 9.5B — complete](https://img.shields.io/badge/phase%209.5B-complete-5B5CE2?style=flat-square)
![Phase 10 — complete](https://img.shields.io/badge/phase%2010-complete-5B5CE2?style=flat-square)
![Phase 11 — current](https://img.shields.io/badge/phase%2011-current-2F9E6E?style=flat-square)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks%20Vision-6B6D70?style=flat-square)
![React 19](https://img.shields.io/badge/React-19-6B6D70?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-6B6D70?style=flat-square&logo=typescript&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-r186-6B6D70?style=flat-square&logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-6B6D70?style=flat-square&logo=vite&logoColor=white)

A spatial computing shell for an ordinary laptop. The screen is not a page; it is a
room with depth, and applications are surfaces placed in it.

Phase 1 established the spatial desktop foundation. Phase 2 added webcam-based hand
interaction with complete mouse parity. Phase 3 added the intelligence layer that
turns sentences into structured intent. Phase 4 gave NOVA a model of what the
arrangement *means*. Phase 5 lets a meaningful arrangement be kept and returned to.
Phase 6 adds a second way to say all of it out loud. Phase 7 lets the ways be
used together. Phase 8 opens NOVA's eyes to the computer it is running on.
Phase 9 lets NOVA open an application on that computer, through one narrow,
validated action. Phase 9.5 extends that to any application that is actually
installed, by name. Phase 9.5B makes the hand a first-class way to issue the same
commands — point at a window and double pinch to select it. Phase 10 lets you
talk with NOVA. Phase 11 turns the plain background into a room NOVA's windows
stand in.

## Where NOVA is now

**NOVA is at Phase 11.** Phases 1–10 are completed milestones, documented below
as they were delivered.

| Phase | Milestone | State |
| --- | --- | --- |
| 1 | Spatial Environment | complete |
| 2 | Hand Interaction | complete |
| 3 | Gemini Intelligence | complete |
| 4 | Context Awareness | complete |
| 5 | Spatial Memory | complete |
| 6 | Voice | complete |
| 7 | Multimodal | complete |
| 8 | Native System Awareness | complete |
| 9 | Native Application Control | complete |
| 9.5 | Universal application discovery and launch | complete |
| 9.5B | Gesture-native commands and air click | complete |
| 10 | NOVA Intelligence Core | complete |
| 11 | Spatial Visual Environment | current implementation state |

The source code labels the Phase 9.5 discovery work "Phase 9.5A", and the gesture
work "Phase 9.5B"; the two names refer to the same milestones.

What each phase contributed, with its commits, is in [docs/phases](docs/phases/README.md);
how the phases stack into one system is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

**Phase 12 is the current implementation state.** NOVA opens on a clean
spatial environment with one entry point: the **NOVA portal**, the glass Core at
the bottom centre. Click it, air click it (double pinch), or press `O`, and the
Core gathers light and NOVA's real spatial windows come out of it one after
another, each flying from the Core's heart to its place in the room — ordinary
windows you drag, resize, pinch and close. Activate the Core again and they fold
back into it. Every window comes through the ordinary command path. `npm test`
runs 66 portal assertions. See [docs/phases/phase-12.md](docs/phases/phase-12.md).

**Phase 11 (with 11B–11E) is complete.** The
environment is a darkened spatial room in deep blue-grey, generated entirely in
shaders (no video), where colour appears only as light with a meaning: warm for
the NOVA Core, violet for intelligence, cyan for spatial interaction, pearl for
the room's own structures. Slate light moves through the air; a soft key light
falls from high on the left; a horizon of light and haze, a giant distant arc,
tall frames and an enormous ring of light around the Core give it scale, and
streams of pearl dot-light cross it in depth. At its centre the **NOVA Spatial
Core** is a bloom drawn in dot-matrix light — pearl petals, an amber heart that
lights the room, swaying, dissolving into falling dots, flaring at its tips.
Listening brightens its edges cyan; thinking fills it and the room around it
with violet; a command sends a cyan-violet ripple; an opening a cyan wave across
wall and floor; a hand carries its own cyan light. `npm test` runs 274
environment assertions. See [docs/phases/phase-11.md](docs/phases/phase-11.md).

**Phase 10 is complete.** NOVA holds a conversation. Press `I` (or click the AI
row in the status panel) and ask anything: it answers questions, follows
references across turns ("explain it like I'm 15", "open it"), and tells a
conversational request from an action. An action is one NOVA instruction
sentence handed to the same `routeUtterance` typing and speech use, so it reaches
state only through the command bus. `npm test` runs 151 intelligence assertions.
See [docs/phases/phase-10.md](docs/phases/phase-10.md).

**Phase 9.5B is complete.** A gesture is a way of
saying a command, not a second way of executing one. Pointing at a window and
double pinching produces the sentence `open <window>` and hands it to the same
`routeUtterance` that typing and speech use. Air click is hardened so that it is
reliable with a real hand: hand-originated commands are labelled `gesture`, the
0.6 hand-confidence floor gates every hand action, a double pinch never nudges
the window it selects, and the Command Deck owns the double pinch while it is
open. `npm test` runs 131 gesture assertions.

**Phase 9.5 is complete.** `open Spotify` resolves the
name against the installed-application catalog Phase 8 already reads, and
launches the application by its desktop entry id. A category word — `open
browser` — still opens NOVA's own surface and launches nothing. `npm test` runs
198 catalog assertions.

**Phase 9 is complete.** NOVA gained exactly one native action: open an approved
application. The browser can only name an application identity; the server
validates it against its own enumeration and launches it through the desktop's
own activation path, with no shell. `npm test` runs 151 native-action assertions.

**Phase 8 is complete, and is read-only.** NOVA can now see what host it is on,
what desktop session it is in, and which applications are installed and running.
It cannot launch, close, focus, move or otherwise touch any of them, and there
is no code path through which it could. `npm test` runs 166 native assertions
alongside the multimodal, voice, memory, context and vision suites.

**Phase 7 is complete.** Point at a window and say "move this beside Code", and
NOVA knows what "this" means. Voice, mouse and hand contribute to one referent
and one pipeline; no modality has an execution path of its own. `npm test` runs
80 multimodal assertions alongside the voice, memory, context and vision suites.

**Phase 6 is complete.** Voice is an input device, not a second intelligence: a
spoken sentence is handed to the same function a typed one is, and everything
after that — Gemini, the context engine, the command bus — is untouched.
`npm test` runs 99 voice assertions alongside the memory, context and vision
suites.

**Phase 5 is complete.** NOVA can be told to remember the arrangement you are
working in, and brought back to it later by name or by description — across a
browser reload. `npm test` runs 120 memory assertions and 102 context assertions
alongside the vision suite, including both acceptance sequences driven through
the real command bus.

**Phase 4 is complete.** NOVA understands not only which windows exist but what
they are for, how they relate to one another, and which task and workspace they
belong to.

**Phase 2 is complete.** The vision system runs fully client-side using MediaPipe
Tasks Vision with local WASM and model assets. It typechecks and lints clean, with a
comprehensive automated test suite (`npm test`) covering the 1€ adaptive filter,
hysteresis state machine, open-palm drop, double-pinch activation, pinch-and-hold
scaling, and horizontal workspace swipe navigation.

Performance on real hardware is the one thing still unmeasured. Frame rates taken
under software rendering say nothing about an integrated GPU, so no number is claimed
here.

Three things are deferred on purpose. Each is waiting on a decision rather than on
work:

- **`maximized`** — there is room for it in the window state, but maximising needs a
  spatial meaning in a room with depth before it earns a behaviour. Pulling a surface
  to a fixed near depth and filling the view plane are different products.
- **A real-time shadow pass** — see *Deliberate omissions* below.
- **Tailwind** — NOVA is a small number of precisely placed system elements plus DOM
  surfaces that must stay pixel-aligned with 3D hit regions, which is exactly where
  utility classes fight you. Hand-written CSS with custom properties in
  `src/index.css` won on merit, and the palette lives at the top of that file.

## Running it

```bash
npm install
npm run dev       # http://localhost:3000
```

**That is the only command needed, and the port is 3000.** `npm run dev` starts
`server.ts`, which runs Vite in middleware mode *and* serves NOVA's own routes:
the Gemini intelligence endpoint and the read-only native ones. Hot reloading
works exactly as it does under plain Vite.

There is deliberately one entry point. An earlier layout offered a bare `vite`
script alongside it, and because that one has no `/api` routes NOVA silently lost
its installed-application catalog — every discovered application failed to
resolve while the five built-in ones kept working, which made the feature look
broken when it was merely unreachable. `npm run dev:frontend-only` still starts
bare Vite for pure interface work, and its name says what it lacks.

`npm run build` produces a static bundle; `npm run preview` serves it.

**The server listens on `127.0.0.1` only.** It holds the Gemini key and can
launch installed applications, so by default nothing else on the network can
reach it. Set `NOVA_HOST=0.0.0.0` in `.env` to listen on every interface — for a
container, or to open NOVA from another device on a trusted network. (Vite's own
hot-reload socket, port 24678, is managed by Vite and carries module updates
only.)

### Verifying it

`npm test` runs thirteen self-contained suites under `tsx`; each can also be run
alone. Current totals:

| Script | Covers | Assertions |
| --- | --- | --- |
| `test:builtins` | Phase 1 command matching | 123 |
| `test:vision` | Phase 2 recogniser, smoothing, input source | all suites pass |
| `test:context` | Phase 4 context engine and references | 102 |
| `test:memory` | Phase 5 spatial memory | 120 |
| `test:voice` | Phase 6 voice lifecycle | 123 |
| `test:multimodal` | Phase 7 referents and priority model | 99 |
| `test:native` | Phase 8 native awareness | 166 |
| `test:native-action` | Phase 9 controlled launch | 151 |
| `test:catalog` | Phase 9.5 application discovery | 198 |
| `test:gesture` | Phase 9.5B gesture pipeline and air click | 131 |
| `test:sync` | native–spatial comparison | 102 |
| `test:intelligence` | Phase 10 conversation, actions, safeguards | 151 |
| `test:environment` | Phase 11–11E room, light and colour meaning, palette, layers, streams, bloom, Spatial Core modes and pulses, render-path rules | 274 |

No suite claims that a real application launched or that a real camera tracked a
hand: both are verified on the machine itself, not in a unit test.

### Spatial Hand Interactions (Phase 2)
Press `v` or click `Vision off` in the top-left status bar to toggle Vision Mode.

| Action | Hand Gesture |
| --- | --- |
| **Point / Hover** | One hand raised, index finger extended (tracks fingertip smoothly in 3D) |
| **Grab / Move** | Pinch thumb and index fingertip together (`< 0.38` span) & move hand |
| **Drop / Settle** | Open pinch (`> 0.52` span) |
| **Panic Drop** | Open palm: spread all 5 fingers flat to instantly drop any grabbed window |
| **Activate Target** | Double-pinch tap: two quick stationary pinches (< 360ms) |
| **Spatial Resize** | Pinch-and-hold stationary for > 500ms (or pinch corner) to scale |
| **Switch Workspace** | Open palm rapid horizontal flick left / right (`v > 1.2 NDC/s`) |
| **Vision HUD** | Press `d` to toggle the developer telemetry and tuning panel |

### Talking to NOVA about what is in front of you (Phase 4)

The command line now resolves references rather than requiring names:

| You say | NOVA resolves |
| --- | --- |
| `move this beside the browser` | `this` → the focused window; picks which side is free |
| `make it bigger` | `it` → the most recently focused or moved window |
| `bring the one on the right forward` | the rightmost surface — or asks, if two are equally far right |
| `right of code` | whatever sits to the right of the editor |
| `show me everything related to my database work` | the windows serving that task, without moving anything |

When two readings are equally good NOVA asks instead of guessing, and offers the
candidates as buttons. Nothing is executed while the question is open.

Press `c` in a development build for the context inspector: current workspace,
task, focus, recency, each window's semantic role and relations, and the exact
payload handed to the model. It is compiled out of production builds entirely.

### The room (Phase 11, 11B–11E)

The windows float in a darkened spatial room of deep blue-grey. Slate light
moves slowly through its air; a soft cool-white light falls from high on the
left; a band of light and haze marks the horizon, and a giant arc, tall frames
and an enormous ring of light lying around the centre — all faint, all distant —
make it feel enormous. Streams of pearl dot-light cross the room at a different
depth, pulses travelling along them. The floor is a lattice of dim pearl points.
At the centre, rising between the windows, is the **NOVA Spatial Core**: a bloom
of six pearl petals drawn in tiny plus-shaped LED cells around an amber heart,
whose warm light spills into the room and onto the floor beneath it. Beside it a
small caption reads "NOVA · Ready" and the current workspace.

Colour means something: **warm** is the Core, **violet** is NOVA thinking,
**cyan** is you interacting with the space.

| When | NOVA |
| --- | --- |
| Nothing is happening | the air and light drift; streams flow; the bloom breathes and flares, sending warm light into the room; caption "Ready" |
| You move the pointer | the layers shift at different rates — wall least, streams and ring more, windows barely; a faint cyan light follows the pointer |
| A hand is in view (`V`) | cyan light and a cyan ring follow your hand; the floor's rings cool towards cyan; "Hand tracked" |
| NOVA is listening (`S`) | the bloom's edges brighten cyan and it breathes with your voice; "Listening" |
| NOVA is thinking (`I`, then ask) | violet rises from the heart through the bloom; the Core's light and the ring turn violet; violet streams leave the Core; "Thinking" |
| A command runs | a brief cyan-to-violet ripple and pulse; the bloom flares |
| An application opens | a restrained cyan wave crosses the wall and the floor; a ring of dots leaves the bloom |
| An answer arrives | a soft flare, and the room returns to neutral |

With reduced motion the drift and pulses stop. The colours live in `PALETTE` in
`src/data/environment.ts`, held equal to the CSS tokens by a test. Detail:
[docs/phases/phase-11.md](docs/phases/phase-11.md).

### Talking with NOVA (Phase 10)

Press `I`, or click **AI** in the status panel, to open the Intelligence
Surface. It opens in the right-hand column beneath the status panel, so the NOVA
Spatial Core stays in view — and visibly thinks — while you talk to it.

| You say | NOVA does |
| --- | --- |
| `What is quantum computing?` | answers in the conversation; nothing moves |
| `Explain it like I'm 15` | answers again, reading "it" from the previous turn |
| `Can you tuck the notes window away?` | turns it into `minimize notes` and runs it through the command bus |
| `What is Spotify?` then `Open it` | resolves "it" to Spotify and launches it through the installed-application catalog |
| `open terminal` | runs at once, without asking the model |
| `Delete my Downloads folder` | refuses, and says what NOVA can do instead |
| `start over` | clears the conversation |

The microphone button — or `S` when the text field is not focused — uses the
existing voice system; spoken sentences are answered here instead of in the command line.

```
  typed / spoken sentence → converse()
     ├─ plain instruction ("open terminal") ─────────────→ routeUtterance
     └─ anything else → POST /api/intelligence/turn → Gemini (server-side key)
           conversation / clarification / refusal → a reply is shown; nothing runs
           action → one NOVA sentence ("open Spotify") → routeUtterance → command bus
```

The model sees a deliberate projection of NOVA — workspace, focused window, open
surfaces, installed and running application names, recent actions — never
positions, ids, paths or the store. Its answer is validated on the server and
again in the browser, and an action sentence containing shell characters, paths
or command words is refused before anything reads it. When Gemini is unavailable,
NOVA says so and still carries out plain instructions. Full detail, including
limitations: [docs/phases/phase-10.md](docs/phases/phase-10.md).

### Pointing and selecting with a hand (Phase 9.5B)

With Vision on (`v`), point at a window:

| You do | NOVA shows / does |
| --- | --- |
| point at a window with a confident hand | a thin accent outline and a slight lift — the window a double pinch would select |
| double pinch | selects that window: `open <window>`, through the ordinary pipeline |
| pinch and move | drags the window once the pinch leaves a small dead-zone |
| open the Command Deck, point at an item, double pinch | opens that item; the window behind the deck is not touched |

The rules that make it safe with a real hand, all enforced in
`systems/interaction/interactionSystem.ts`:

- **Labelled honestly.** Commands from a hand carry `source: 'gesture'`; the
  mouse stays `'pointer'`. The device is read from `inputRouter` as each frame
  arrives, so the multimodal referent knows which device acted.
- **Confidence floor.** The existing 0.6 floor (`MIN_HAND_CONFIDENCE`) gates hand
  press, close, minimize, Core and activation. A half-detected hand does nothing.
- **A double pinch is a tap, not a drag.** A hand pinch must travel 0.09 NDC or
  last 280 ms — the recogniser's own definition of a tap, `TAP_MAX_TRAVEL` and
  `TAP_MAX_MS` — before the window follows it, and the drag then starts from
  where the hand is, without a jump. A pinch that never travelled activates on
  release. Mouse dragging has no dead-zone.
- **One activation per double pinch**, however many frames render it. Single
  pinches, held pinches, drags and a pinch at nothing never activate.
- **The deck owns activation while open** (`interaction.claimActivation`), so one
  double pinch is exactly one choice.

The armed outline appears only for a confident hand on a live window; mouse
hover is unchanged. Real-camera feel — how the dead-zone and outline behave on
real hardware — is verified by hand, not by the test suite.

### Opening real applications (Phase 9 and 9.5)

| You say | NOVA does |
| --- | --- |
| `open browser`, `open terminal`, `open notes` | opens or reveals NOVA's own surface; launches nothing |
| `open Spotify`, `open Calculator`, `open Firefox` | resolves the name against the installed catalog and launches that application |
| a name two installed applications fit equally well | asks which one, rather than guessing |
| a name nothing installed matches | launches nothing — an application that is not installed is never invented |
| `open bash -c id`, `open /bin/bash` | matches nothing; never reaches the launcher |

**A category opens a surface; only a product name launches a program.** The
five category words name NOVA's spatial applications. Launching the host's
browser and terminal for them buried the spatial shell under the very commands
meant to arrange it, so they no longer do.

```
  "open Spotify"
    ↓  routeUtterance → contextBridge.translateOpen
  resolveApplication(name, catalog)     ← returns only an id copied from the catalog
    ↓  { action: 'open-application', applicationId: 'com.spotify.Client' }
  Command Bus → SystemAdapter.perform   ← the one capability: OPEN_APPLICATION
    ↓  POST /api/native/action  { capability, applicationId }
  native/linuxLauncher.ts               ← shape → membership → resolution
    ↓  spawn('gio', ['launch', <desktop entry path>], { shell: false })
  the desktop's own activation path
```

**Why this is not arbitrary execution.** The request can carry exactly two
fields, both from closed sets: there is no path, command or argument to express.
The server accepts an id only if it is shaped like a bare desktop id, is present
in the catalog the server itself enumerated from the desktop-entry directories
(refreshed every 10 seconds), and resolves to an entry file on disk — membership
is the authority, not the regex. The program is the constant `gio`, the argument
vector is `launch` plus a path the server computed, and `shell` is false, so a
semicolon or `$(…)` is an ordinary character. OS error text is logged on the
server and never returned to the browser. The five spatial types additionally
map, on the server, to preference-ordered desktop entries — on this machine
Firefox, VS Code, Nautilus, Text Editor and Ptyxis.

Gemini is told the same rule: for `open Spotify` it returns the *name* the user
said, never a desktop id, path or command, and NOVA resolves the name itself.

### What else is in the current implementation

These arrived during Phase 9.5B and are part of what NOVA is today:

- **Native–spatial comparison** (`systems/native/nativeSpatialSync.ts`). A pure,
  read-only comparison of NOVA's surfaces with the real computer: each
  application is `synced`, `native-only`, `spatial-only`, `absent` or `unknown`,
  and a requested launch stays "requested" for up to 45 s until a snapshot
  confirms it. It reports the difference and never acts on it; shown in the
  context inspector (`c`).
- **Status HUD.** Voice, Hand, Native and AI state at a glance, the running
  native applications, and the *NOVA Pulse* count of active applications.
- **Focus moment.** A one-shot ring as a window takes focus, distinct from the
  sustained state of being focused; disabled under reduced motion.
- **Command Deck.** The `NOVA` button summons an arc of the five surfaces beside
  the cursor. Choosing one — by click or by pointing and double pinching — sends
  `open <surface>` through `routeUtterance`; the deck has no execution path of
  its own.
- **Presentation mode** (`p`). Withholds the developer context inspector and
  nothing else.

### Seeing the real computer (Phase 8)

NOVA has a native system adapter. It reads; it does not act.

```
  NOVA (browser)
    ↓  GET /api/native/snapshot          ← one endpoint, no parameters
  Local provider (Node, same machine)
    ↓  os · /etc/os-release · XDG env · desktop entries · /proc/<pid>/comm
  NativeSnapshot                          ← normalised, validated at the boundary
    ↓
  Context Engine                          ← awareness only
```

**On this machine** (Fedora Linux 44, GNOME, Wayland) NOVA reports:

| Capability | Status |
| --- | --- |
| platform detection | ✅ Fedora Linux 44 |
| application enumeration | ✅ 54 installed desktop applications |
| running application detection | ✅ via `/proc/<pid>/comm` |
| **window enumeration** | ❌ **unavailable under Wayland** |
| window geometry | ❌ requires window enumeration |
| workspace enumeration | ❌ requires window enumeration |

Native window enumeration is unavailable because the Wayland compositor does not
expose the window list to unprivileged clients. Every route around it — GNOME
Shell's `Eval` (disabled), an X11 fallback through XWayland, shelling out to
`wmctrl` — is a bypass of the session's security model, and NOVA does none of
them. The capability is reported `false` with the reason attached. **That is the
correct answer, not a missing feature.**

#### What Phase 8 deliberately does not do

There is no `launch`, no `focus`, no `move`, no `exec`, no `runShell`, and no
endpoint that accepts a command, a path or any input at all — `/api/native/snapshot`
is a parameterless `GET`. The adapter's entire surface is `id`, `available`,
`describe()` and `snapshot()`. Reading `/proc/<pid>/cmdline` is deliberately
avoided because command lines carry arguments, and arguments carry secrets; only
`comm`, a bare program name, is read. Only applications that have a desktop entry
are ever named, so this cannot enumerate somebody's background services.

> **Since Phase 9:** NOVA may now open an approved application, through a
> separate endpoint and a separate file (`native/linuxLauncher.ts`). Everything
> above remains true of the snapshot path, which is still read-only, and none of
> focus, move, close, `exec` or a shell exists anywhere.

#### Native state is not spatial state

This is the load-bearing distinction. A native window has a process, a title and
a compositor; a NOVA window has a position, a scale and relations to other
surfaces. **They are never merged and never synchronised.** Native geometry is
never read as a spatial coordinate, a native window never appears in the spatial
window list, and Spatial Memory saves arrangements without a trace of the machine
they were made on. Several native applications map onto one NOVA identity —
Firefox, Chrome and Brave are all `browser` — while each keeps its own name and
native id. Anything unrecognised stays `unknown`, because a wrong mapping is
worse than none.

> **Since Phase 9.5B:** the two are now *compared* — `nativeSpatialSync` reports
> whether a surface and its application agree — but still never merged, and the
> comparison changes neither side.

Native awareness is entirely optional. `npm run dev` provides it. Under
`npm run dev:frontend-only` there is no provider, every capability is `false`,
and NOVA behaves exactly as it did in Phase 7.

### Using them together (Phase 7)

Point at a window — with the mouse or a tracked hand — and speak about it:

| You do | You say | NOVA does |
| --- | --- | --- |
| point at Browser | `move this beside Code` | `MOVE(browser, beside, code)` |
| click Terminal | `make this bigger` | `RESIZE(terminal)` |
| point at Notes | `hide this` | `MINIMIZE(notes)` |

The hand identifies; the voice commands; the Phase 4 context engine resolves.
`this`, `that`, `it`, `the selected window` and `the window I'm pointing at` all
arrive at the same place.

**The priority model**, in full, because a hidden heuristic is worse than none:

```
  1. an explicit name in the sentence    "move the terminal"   ← always wins
  2. select   — a window was clicked or pinched
  3. point    — a device is aimed at a window
  4. focus    — the focused window            (Phase 4, unchanged)
  5. recent   — the last one interacted with  (Phase 4, unchanged)
```

Tiers never blend. The strongest tier holding a live signal decides. Within a
tier, two *different devices* indicating *different windows* is genuine
ambiguity, and NOVA asks rather than ranking a mouse above a hand. Signals
expire after 8 seconds, and a hand below 0.6 confidence is ignored entirely — a
half-detected fingertip drifting across a surface is not a command.

This is short-lived interaction context, not memory. Spatial Memory (Phase 5)
remembers arrangements on purpose and forever; this forgets in seconds.

Press `c` in a development build to watch it: the inspector shows the current
referent and the last few instructions as `input → said → resolved → command →
result`.

### Speaking to NOVA (Phase 6)

Press `S`, or click the microphone chip beside the vision one. NOVA listens for a
single sentence, shows it as you speak, and then acts on it:

```
  Listening…  →  "move the browser to the left of my code"  →  Processing…  →  the browser moves
```

Anything you can type, you can say — spatial commands, contextual ones
(`make it bigger`), and Phase 5's memory commands (`save this as my database
workspace`, `continue my database work`). That is not a list of supported
phrases: **the spoken sentence is given to the same `routeUtterance` the command
line uses**, so voice cannot diverge from typing even by accident. There is one
function that acts on words.

`Escape` cancels — the partial transcript is discarded and nothing runs.
Interim speech is displayed but **never executed**; only a final recognition
result enters the pipeline, because acting on half a sentence in a spatial
interface means moving the wrong thing and then moving it back.

Recognition uses the browser's Web Speech API. Where that does not exist the
microphone chip reads *voice unavailable* and every other part of NOVA is
unaffected. The microphone is only ever opened after you click or press a key,
there is no wake word, no always-on listener, and no audio is recorded, stored
or sent anywhere by NOVA — the recogniser hands over text, and text is all that
is kept.

### Remembering where you were (Phase 5)

| You say | NOVA does |
| --- | --- |
| `save this as my database workspace` | stores the whole arrangement under that name |
| `remember this setup` | asks what to call it, rather than inventing a name |
| `continue my database work` | finds the memory and restores it |
| `continue where I left off` | restores the most recently saved arrangement |
| `show my saved workspaces` | opens the memory list |
| `delete my database project workspace` | forgets it |

A memory holds the workspace, the task, every window's place, size, angle and
visibility, what was focused, and the relationships those positions add up to.
It does not hold anything from the renderer. Memories live in `localStorage`
behind a `MemoryRepository` interface, so they survive a reload today and can be
moved to a real database without touching anything above that interface.

If two saved arrangements are equally good answers, NOVA asks which one — the
same rule as Phase 4, for a much larger reason: restoring the wrong memory
rearranges your entire environment. If a window in a memory no longer exists,
everything else is restored and NOVA says what was missing:

> Restored "database workspace". Terminal was unavailable.

**Nothing is saved automatically.** There is no autosave, no write per frame, no
write per drag. A memory exists because you asked for one — which is the whole
distinction between *current state*, which lives in `spatialStore`, and a
*memory*, which is a deliberate snapshot of a state worth coming back to.

### Mouse & Keyboard Interactions (Phase 1)

| Action | How |
| --- | --- |
| Focus a surface | Click it, or press `1`–`5`, or `Tab` |
| Move it | Drag it |
| Resize it | Drag the bottom-right corner |
| Rotate it | `Alt` + drag |
| Change its depth | Scroll over it |
| Collapse it | The left dot in its title bar, or `m` |
| Close it | The right dot in its title bar, or `x` |
| Restore it | Click its plate beside the Core |
| Change workspace | The rail on the left, `[` / `]`, or the command line |
| Talk to NOVA | Click the Core, or `⌘K` / `Ctrl-K`, or `/` |
| Nudge / scale focused | Arrow keys (`Alt`+↑↓ for depth), `+` / `-` |

The command line understands phrases like `open development workspace`,
`focus code`, `move browser left of code`, `minimize terminal`, `arrange my workspace`.
When it cannot resolve a phrase it says so rather than doing nothing.

The key legend along the bottom edge is onboarding, not chrome: it retires for good
once you issue your first command. It is a single line at the very bottom because
windows move freely in 3D, so any tall block in a corner will eventually sit on top
of one.

## How it is put together

The whole system is one rule: **nothing changes NOVA's state except a command.**

```
  pointer ─┐
 keyboard ─┼─→  NovaCommand  ─→  Command Bus  ─→  spatial store  ─→  renderers
  (later)  │    { action: 'focus', target: 'code' }
  gesture ─┤
    voice ─┤
   Gemini ─┘
```

That boundary is the point of Phase 1. A hand tracker, a microphone or a model can
be added as another producer of `NovaCommand` values without touching anything
downstream. None of them ever gets a reference to a Three.js object.

### The layers

```
src/
  types/        the vocabulary: spatial, window, workspace, command
  data/         apps, workspace layouts, environment tuning — all configuration
  state/        spatialStore.ts — the single source of truth
  systems/
    input/      turns devices into PointerFrames; mouse today, hands later
    interaction/ resolves a pointer against the scene, emits commands
    command/    the bus, the text→intent matchers, and the intent→command bridge
    context/    what the arrangement means: relations, tasks, the context graph
    memory/     saving an arrangement and coming back to it, behind a repository
    voice/      speech to text, and the state machine around one spoken sentence
    multimodal/ what the devices currently refer to, and the priority model
    native/     read-only awareness of the host: adapter, bridge, identity map
  native/       (outside src) the Node-side Linux provider; never bundled
    window/     how a window's state becomes its appearance
    workspace/  spatial relations and the collapsed-window dock
  components/
    spatial/    environment, viewpoint, the DOM-in-3D render pass
    core/       NOVA Core
    windows/    the spatial window and its application faces
    interface/  the thin system layer: rail, command line, spatial cursor
```

### How context works

```
  INPUT  →  CONTEXT  →  AI / INTENT  →  COMMAND  →  COMMAND BUS  →  STATE  →  RENDER
```

Gemini understands intent. The context engine understands NOVA's current world.
The command bus executes validated actions. Three.js renders the result. No layer
reaches past the next one — the model is handed ids, meaning and relations like
`"beside:code"`, never a coordinate and never a scene object.

The graph is derived, never authoritative: `spatialStore` remains the single source
of truth, and `buildContextGraph` is a pure function from a snapshot of it. That is
why the same code answers questions in a test, at runtime, and about a saved
arrangement — Phase 5's `toContextSnapshot` turns a memory back into a legitimate
input to the same builder. The graph is rebuilt only when a command changes
something, and only when something actually asks a question, so dragging a window
still costs nothing.

### How the modalities converge

```
  Mouse ─┐
   Hand ─┼─→ PointerFrame ─→ interaction ─┬─→ NovaCommand ─→ Command Bus ─→ state
         │                                │
         └─→ ModalitySignal ─→ referent ──┤   ("this" means that one)
                                          │
  Voice ─┬─→ transcript ─→ routeUtterance ┘
   Text ─┘
```

A device contributes a **referent**, never a command. Pointing at a window says
"that one"; it never says "move it". The referent rides on the context snapshot,
so `referenceResolver` stays a pure function of a snapshot — the same property
that lets it be tested against fixtures and lets Phase 5 read a saved memory
with identical code.

### Where a real computer would attach

```
  NOVA UI
    ↓
  NOVA Command System        ← application identities, relations, intent
    ↓
  Native System Adapter      ← declared in systems/native; no implementation
    ↓
  Operating System
```

`browser` is an **application identity**. The slab in the Three.js scene is its
spatial *representation*. Everything above rendering — the command bus, the
context graph, spatial memory — already refers to windows by identity and never
by scene object, which is what would make a native layer insertable rather than
a rewrite.

`SystemAdapter` now also reports what it last *saw* — and still declares no way
to act. It has no `launch`, no `openFile` and no `exec`: declaring methods nobody
implements would be a promise the code does not keep, and an execution capability
needs a safety argument Phase 8 has not made. Awareness comes before control.

> **Since Phase 9:** the adapter declares exactly one capability,
> `OPEN_APPLICATION`, with its safety argument written out in
> `native/linuxLauncher.ts` and under *Opening real applications* above. Every
> other native action is still absent.

### How voice works

```
  Mouse ─┐
   Hand ─┼─→ PointerFrame ─→ interaction ─┐
         │                                ├─→ NovaCommand ─→ Command Bus ─→ state
  Voice ─┴─→ transcript ─→ routeUtterance ┘
```

`InputSource` is generic in what it emits. Mouse and hand produce `PointerFrame`s
and are arbitrated by `inputRouter`; voice produces a finished utterance, because
forcing speech into a pointer event would be a lie about what was said. What the
two branches share is the destination.

`systems/voice/` contains a Web Speech adapter, a lifecycle
(`idle → listening → processing → success | error`, plus `unsupported`), and a
store holding recognised text. It contains no knowledge of windows and no way to
reach them. The command line consumes it, because the command line already knows
how to turn a sentence into an outcome and how to ask a follow-up question about
one.

### How memory works

```
  Gemini → Intent → Command Bus → Memory Manager → Spatial State → Context Engine → Three.js
```

The memory layer never writes spatial state. A restore is a `RestorePlan`: an
ordered list of ordinary `NovaCommand`s — `workspace`, `task`, `move`, `scale`,
`rotate`, `minimize`/`restore`, `focus` — which the command bus then runs. A
remembered arrangement therefore reaches the screen by exactly the same path a
mouse drag does, and the plan is a pure value a test can assert without anything
moving. Nothing in `systems/memory/` imports the command bus; the dependency
points one way.

### Three decisions worth knowing

**State is the target; rendering interpolates toward it.** The store holds where a
window *should* be. Each frame the scene eases toward that. Nothing writes back.
So a gesture that sets `position` gets the same physical motion the mouse gets, for
free — and dragging a window causes no React re-renders at all, because transforms
are read in the frame loop rather than subscribed to.

**Window content is real DOM, positioned in 3D.** A second CSS3D pass renders each
window's surface with the same camera as the WebGL scene. Text stays crisp at any
depth and costs almost nothing to draw, which is what makes NOVA read as a computer
rather than a 3D demo. The window's physical presence — the slab that catches light
and that the pointer actually hits — is a mesh in the scene behind it.

**Window controls are 3D targets, not HTML buttons.** The dots in a title bar are
regions of the surface (`SURFACE_REGIONS`), hit-tested by ray. The DOM chrome is
laid out against the same numbers. A fingertip will be able to press them exactly
the way a pointer does now.

### Deliberate omissions

- **No shadow pass, for now.** Nothing in this space sits close enough behind an
  object to catch a cast shadow; projected onto the far backdrop they read as grey
  panels. Weight comes instead from perspective, haze, and a soft darkening each
  object carries with it — the Core's contact shadow is what grounds it against a
  near-white room. It is also a whole render pass saved on integrated graphics.
- **No tone mapping.** The palette is authored in sRGB and the environment is a
  light room; filmic tone mapping greys it out.
- **The viewpoint settles when you reach for something.** Parallax follows the
  pointer while you look around, and freezes the moment it lands on a surface — a
  viewpoint that keeps moving drags the target out from under you.

## Where later phases attach

| Phase | Attaches at |
| --- | --- |
| Hand tracking | a new `InputSource` emitting `PointerFrame`s into `inputRouter` |
| Voice | an `InputSource<VoiceCommandEvent>`; its text goes to `routeUtterance` |
| Gestures | producers of `NovaCommand` with `source: 'gesture'` |
| Voice | same, with `source: 'voice'` |
| Gemini | a producer in `intentRouter.ts`, emitting the same commands |
| A real memory database | one class implementing `MemoryRepository` |
| Real applications | `SpatialWindow.app` becomes a handle to a process |

The `CommandSource` union already lists all of them, so each one is a labelled
producer rather than a special case.
