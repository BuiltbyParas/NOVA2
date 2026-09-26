# Phase 12 — NOVA Application Portal

**Status:** current implementation state.
**Commits:** developed in NOVA2; not yet committed.

## What changed, and where

NOVA no longer opens with five windows standing in the room. The first screen is
the Phase 11 environment and the **NOVA portal** — the small glass Core at the
bottom centre, now ringed by a slowly breathing halo of light-dots. The portal
is where applications come from.

```
            [Browser]
     [Code]            [Files]            ← applications settle on an arc,
                                            at different depths
  [Notes]                  [Terminal]

                ◎  ← the NOVA portal (the Core); the bloom behind it
```

- **Point at the Core** (mouse or hand): the halo widens and turns cyan; the
  cursor reads "Applications".
- **Activate it** — click, air click (the existing double pinch), or `O` / Space:
  the Core gathers warm light, then releases the applications. Each flies out of
  the Core's heart along a curve that swings towards you and settles back, grows
  from a compressed point to full size, trailing a thread of light, and settles
  on its seat. The room answers: the opening wave crosses wall and floor and the
  bloom flares.
- **Choose one** (click, air click while pointing at it, or arrows + Enter): the
  portal folds back into the Core as the application's window comes *out* of it.
- **Dismiss** (click the Core or empty space, air click at nothing, Escape): the
  applications fold back into the Core, the last one out first home.

## Architecture

| Piece | Where | What it does |
| --- | --- | --- |
| State | `spatialStore.portal: { open, at, from }` (`src/types/portal.ts`) | The intent and when it changed. Mutated only by `{ action: 'portal', open }` through `commandBus.dispatch`. |
| Model | `src/systems/portal/portalModel.ts` | Pure: phase (`closed → opening → open → closing`), progress, seats, every application's pose along its flight, the Core's charge. No store, clock, DOM or three.js. |
| Actions | `src/systems/portal/portal.ts` | `requestPortal`, `togglePortal`, `selectPortalApp` — the one implementation every input calls. |
| Scene | `src/components/spatial/PortalDriver.tsx` | Each frame: flies the applications in world space and projects them through the real camera into `portalScreen`. No allocation, no React state. |
| Controls | `src/components/interface/PortalLayer.tsx` | Draws the projected applications as real, focusable buttons; hand highlight and air click via `claimActivation`; arrows / Enter / Escape. |
| Halo | `NovaCore.tsx` | The portal's dot-matrix halo: breath, hover (cyan), charge (warm), open. |

**Catalog.** The portal offers `APP_ORDER` / `APPS` — NOVA's own application
catalog — and nothing else. Choosing sends `open <name>` to `routeUtterance`,
which resolves category names through `genericAppFor` to the spatial
application. Installed desktop applications remain on their existing paths
("open Spotify", the status panel); the portal introduces no second list, no
launcher and no native call.

**Interaction ownership.**

| Input | Owner before | Phase 12 |
| --- | --- | --- |
| Pointer press on the Core | `interactionSystem.onPress` → command line | → `togglePortal` |
| Air click on the Core | `interactionSystem.onActivate` → command line | → `togglePortal` |
| Keyboard | `keyboardCommands` | `O` / Space → `togglePortal`; Escape closes the portal before blurring |
| Hand activation while an overlay is up | `claimActivation` (Command Deck) | The claim now names its owner. The portal claims it while open; it will not open while the deck holds it. |
| Command line | Core, ⌘K, NOVA marks | ⌘K and the two NOVA marks |

The Core's press used to open the command line. That moved: the command line is
still one keystroke (⌘K) or one click (either NOVA mark) away, but a hand-only
user now reaches it through voice or the marks rather than by air-clicking the
Core.

**Windows.** NOVA starts with no windows. A window opened after startup records
the Core's position as its `origin`, and its entering transition travels from
there (`windowPresentation.ts`) — every application visibly comes out of the
portal, however it was opened. Changing workspace folds the portal away.

## Phase 13 compatibility (not implemented)

Seats come from `portalSeat(index, count, depth)`. Phase 12 always passes
`depth = 0`: every application is in the foreground. A later phase can seat
additional applications on the same arc further from the viewer by passing a
depth, and `portalPose` already accepts it — without the bloom's geometry
changing. There is no layer state, layer navigation, swipe, or background stack.

## Tests

`src/systems/portal/verifyPortal.ts` (`npm run test:portal`) — 98 assertions:
the clean first screen; state transitions (phases, linear progress, monotonic,
repeated intent is a no-op, continuous reversal, proportional close); the
catalog (exactly `APP_ORDER`, names resolve back, invalid ids refused, no
portal file names an application); seats (above the Core, mirrored, distinct,
several depths, depth offset moves straight back); the bloom (starts at the
Core, settles at seats, swings towards the viewer, staggered, last out first
home, reduced-motion fade in place); selection (refused while closed, invalid
choices dispatch nothing, closes first then `open notes` on the bus, the window
records and starts at the Core, no launcher or I/O); activation through the real
interaction system with a real camera and raycast (pointer press opens and
closes, air click opens, the command line no longer opens, the deck's claim
blocks the portal for pointer and keyboard, claims release); the room's pulses;
workspace folds the portal; the frame loop allocates nothing; no Phase 13.

Starting with no windows changed what eight existing suites could assume. Each
now opens the applications it needs through ordinary `open` commands on the bus
(`src/systems/testing/openApplications.ts`), never by writing windows into the
store.

## Limitations

- Frame rate on real hardware is unmeasured (headless verification is software
  rendered); the portal adds one halo plane and five DOM transforms per frame.
- When windows are already open, the portal's applications draw over them.
- The portal lists NOVA's five spatial applications, not installed desktop
  applications.
