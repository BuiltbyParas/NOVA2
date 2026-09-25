# Main NOVA — Phases 1 and 2 (the core)

**Status:** complete — the foundation every later phase builds on.

Phases 1 and 2 are the core application. Every later phase adds a producer,
a consumer or a layer *around* this core; none replaces it.

## Phase 1 — Spatial Environment

**Commits:** `f8d2fcc` Phase 1: spatial desktop foundation (2026-09-17),
`dc3c643` Phase 1 polish: legend placement, Core contrast, `ef20867` Document
Phase 1 status in the README.

**Purpose** (from `f8d2fcc`): a spatial computing shell where the screen is a
room with depth and applications are surfaces placed in it, resting on one
rule — *nothing changes NOVA's state except a `NovaCommand`*.

**Major features** (from `f8d2fcc`):

- spatial environment with perspective, parallax, haze and depth-based scale
- the NOVA Core as the system's anchor and state indicator
- five spatial windows — browser, code, files, notes, terminal — rendered as
  real DOM in a CSS3D pass over slab meshes that take pointer hits
- focus, move, rotate, scale, depth, minimize-to-dock and close, all through
  the command bus
- three hand-authored workspaces: home, development, study
- a local text-to-intent matcher standing where Gemini later sits
- a performance governor that sheds depth-softening if frame time degrades

**Files introduced:** the whole initial tree — `src/state/spatialStore.ts`,
`src/systems/command/{commandBus,commandParser}.ts`,
`src/systems/input/{inputRouter,mouseInputSource,keyboardCommands,types}.ts`,
`src/systems/interaction/{interactionSystem,targetRegistry}.ts`,
`src/systems/window/windowPresentation.ts`,
`src/systems/workspace/layoutEngine.ts`, `src/data/{apps,environment,workspaces}.ts`,
`src/types/{command,spatial,window,workspace}.ts`, and the components under
`src/components/{core,interface,spatial,windows}/`. See
[FILE-MAP.md](FILE-MAP.md) for the complete list.

**Tests:** none automated at this point; the commit records a typecheck and
end-to-end browser verification at 1366×768 and 1920×1080.

## Phase 2 — Hand Interaction

**Commit:** `7246972` Phase 2: webcam-based spatial hand interaction layer
(2026-09-17). The commit has no message body; the description below is from
the README at that commit.

**Purpose:** webcam hand interaction with parity with the mouse, running fully
client-side with local MediaPipe Tasks Vision WASM and model assets.

**Major features:** point/hover, pinch to grab and move, open palm to drop,
double-pinch activation, pinch-and-hold resize, and horizontal open-palm swipe
to change workspace, all smoothed by a 1€ filter with pinch hysteresis.

**Files introduced:** `src/vision/{gestureRecognizer,handTracker,smoothing,visionTypes,verifyVision}.ts`,
`src/systems/input/handInputSource.ts`, `src/components/spatial/HandInputDriver.tsx`,
`src/components/debug/VisionDebugPanel.tsx`, and the MediaPipe assets under
`public/models/` and `public/wasm/`.

**Files modified:** `interactionSystem.ts`, `input/types.ts`, `keyboardCommands.ts`,
`commandBus.ts`, `spatialStore.ts`, `windowPresentation.ts`, `SpatialWindowView.tsx`,
`SystemLayer.tsx`, `App.tsx`, `types/command.ts`, `index.css`, `package.json`.

**Tests:** `npm test` = `src/vision/verifyVision.ts` (today: `npm run test:vision`).

**Depends on:** Phase 1's `InputSource` → `inputRouter` → `interactionSystem`
seam. The hand is a second `InputSource` emitting the same `PointerFrame`s as
the mouse.
