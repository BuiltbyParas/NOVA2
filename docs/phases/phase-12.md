# Phase 12 — NOVA Application Portal

**Status:** current implementation state.
**Commits:** developed in NOVA2; not yet committed.

## What changed, and where

NOVA no longer opens with five windows standing in the room. The first screen is
the Phase 11 environment and the **NOVA portal** — the small glass Core at the
bottom centre, ringed by a slowly breathing halo of light-dots. The portal is
where applications come from.

- **Point at the Core** (mouse or hand): the halo widens and turns cyan; the
  cursor reads "Applications".
- **Activate it** — click, air click (the existing double pinch), or `O` / Space:
  the Core gathers warm light, then NOVA's **real spatial windows** come out of
  it one after another, each flying from the Core's heart to its place in the
  room. The room answers: the opening wave crosses wall and floor and the bloom
  flares. Applications of another spatial layer settle behind (Phase 13).
- **Use them**: they are ordinary NOVA windows — drag, resize from the corner,
  pinch and air click, focus, minimise, close — handled by the existing window
  and interaction systems. The portal draws no controls of its own.
- **Activate the Core again** (the cursor reads "Gather applications"): every
  window folds back into the Core.

## Architecture

| Piece | Where | What it does |
| --- | --- | --- |
| State | `spatialStore.portal: { open, at, from }` | The portal's moment. Changed only by `{ action: 'portal', open }` through the bus. |
| Model | `src/systems/portal/portalModel.ts` | Pure: phase, progress, the Core's charge, each application's moment in the bloom (`portalRevealDelay`). |
| Actions | `src/systems/portal/portal.ts` | `requestPortal` / `togglePortal`, the one implementation every input calls. Opening dispatches `portal` and an ordinary `open` for each application with `reveal: { delayMs }`; gathering dispatches `close` for each window. |
| Windows | `spatialStore.openWindow(app, reveal)`, `windowPresentation.ts` | A revealed window is created with the Core as its `origin` and its entry delayed; it does not take focus and does not move NOVA to its layer. Entering flies from the origin; closing folds back into it. |
| Scene | `PortalDriver.tsx` | Derives the portal's phase and the Core's charge each frame. |
| Glow / halo | `PortalLayer.tsx`, `NovaCore.tsx` | The Core's warm light and its dot-matrix halo. |

**The Core decides by the room.** `togglePortal` brings applications out when
none are out, and gathers them when any are — however they were opened.
Clicking empty space and Escape keep their old meaning (unfocus); they never
gather the user's windows.

**Interaction ownership.** The Core's pointer press and air click call
`togglePortal` (the command line stays on ⌘K and the NOVA marks). The portal
holds no hand claim, so pinches and air clicks reach the windows; it will not
open while the Command Deck holds the hand.

## Phase 13 compatibility (not implemented)

Seats come from `portalSeat(index, count, depth)`. Phase 12 always passes
`depth = 0`: every application is in the foreground. A later phase can seat
additional applications on the same arc further from the viewer by passing a
depth, and `portalPose` already accepts it — without the bloom's geometry
changing. There is no layer state, layer navigation, swipe, or background stack.

## Tests

`src/systems/portal/verifyPortal.ts` (`npm run test:portal`) — 66 assertions:
the clean first screen; the portal's phases; one catalog; the bloom is an
ordinary `open` per application, in order, staggered, from the Core, unfocused,
without a layer change, with other-layer applications seated behind; a
revealed window is dragged by the real interaction system (pointer press and
move on its raycast target), focused, resized, minimised and restored; gathering
folds every window into the Core, a quick reopen is not eaten by the earlier
close, and the Core gathers windows however they were opened; pointer press and
air click through the real interaction system, the Command Deck's claim
respected; an ordinary open still changes layer; the room's pulses; no store
writes, launches or I/O in the portal; the stylesheet parses whole.

## Limitations

- Frame rate on real hardware is unmeasured (headless verification is software
  rendered); the portal adds one halo plane and five DOM transforms per frame.
- The portal reveals NOVA's five spatial applications, not installed desktop
  applications.
