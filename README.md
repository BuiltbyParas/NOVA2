# NOVA — Phase 8: Native System Awareness

![Phase 1 — complete](https://img.shields.io/badge/phase%201-complete-5B5CE2?style=flat-square)
![Phase 2 — complete](https://img.shields.io/badge/phase%202-complete-5B5CE2?style=flat-square)
![Phase 3 — complete](https://img.shields.io/badge/phase%203-complete-5B5CE2?style=flat-square)
![Phase 4 — complete](https://img.shields.io/badge/phase%204-complete-5B5CE2?style=flat-square)
![Phase 5 — complete](https://img.shields.io/badge/phase%205-complete-5B5CE2?style=flat-square)
![Phase 6 — complete](https://img.shields.io/badge/phase%206-complete-5B5CE2?style=flat-square)
![Phase 7 — complete](https://img.shields.io/badge/phase%207-complete-5B5CE2?style=flat-square)
![Phase 8 — complete](https://img.shields.io/badge/phase%208-complete-5B5CE2?style=flat-square)
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

## Status

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
