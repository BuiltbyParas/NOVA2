# Phase 11 — Spatial Visual Environment (with 11B, 11C, 11D and 11E)

**Status:** current implementation state.
**Commits:** developed in NOVA2; see this repository's history.

## Phase 11E — a room lit by meaningful light

11D made the room colourful, but its colour zones (blue left, magenta right,
amber centre) read as nebula wallpaper. 11E keeps 11D's motion, depth and dot
language and changes the colour language: the room is a darkened physical space
in deep blue-grey, and colour appears only as *light*, each with one meaning.

| Colour | Meaning | Where it appears |
| --- | --- | --- |
| Blue-grey, graphite, slate | the room | the wall, the air moving through it, the floor |
| Pearl, silver | the room's own light | dot lattice, streams of light, distant structures, floor points |
| Warm white, amber | the NOVA Core | the bloom's heart; the light it spills into the room; its reflection on the floor |
| Violet | intelligence | only while NOVA thinks: the Core's light, streams leaving it, the bloom, floor rings, points (and a command's pulse) |
| Cyan | spatial interaction | only local: hand, pointer, an opening's wave, a command's ripple, the bloom's edges while listening |

### Where it appears

```
┌───────────────────────────────────────────────────────────┐
│   faint giant arc and tall distant frames (pearl)         │
│  soft cool-white key light from the upper left            │
│      pearl dot-streams of light crossing the room         │
│               ✦  bloom: pearl petals, amber heart  ✦      │
│   warm light spilling from the Core; a huge faint ring    │
│   of light lying around it in perspective                 │
│  ── horizon: soft light band and haze ────────────────────│
│  floor: dim pearl points, warm reflection under the Core  │
└───────────────────────────────────────────────────────────┘
```

### What changed

- **Wall** (`BACKDROP_FRAGMENT`): the colour zones are gone. Slate light moves
  through the air on the 11D flow, low in contrast. Enormous smooth falloffs act
  as architectural light: a pearl key from high on the left, drifting; faint
  blue from above; the Core's warm light. A soft horizon band and haze. Two
  distant structures for scale — a giant arc around the Core (also drawn in LED
  dots, with light travelling along it) and a tall frame either side.
- **Mid layer** (`MIDGROUND_FRAGMENT`): the streams are pearl and cyan-white,
  nearer ones brighter, each fading into the distance at its ends; violet only
  while thinking. New: **the orbit**, one enormous ring of light lying around the
  Core in perspective, brighter on its near side, light travelling round it.
- **Floor**: dim pearl points; the Core's warm pool; rings cool towards cyan with
  a hand, turn violet while thinking; an opening's wave is cyan.
- **Bloom**: pearl-silver petals, an amber heart, a very subtle cyan light on the
  outer petals that brightens while listening, a cyan-violet pulse on a command;
  violet from the heart only while thinking (listening no longer brings purple).
- **Points and hand**: pearl at rest, violet only while thinking, cyan near a
  hand; the hand's ring of light is cyan.
- **Small Core**: pale clear glass; its old shadow, which cut a hole in the room,
  is almost gone.

Performance is essentially 11D's (≈795 ms against ≈770 ms a frame in the
headless software renderer — relative figures only); no post-processing, no
render targets, nothing allocated per frame. Real frame rate on the target
laptop is unmeasured.

## Phase 11D — the colourful living environment

11C borrowed the motion reference's palette along with its quality, and the
room became near-black. That was a misreading: the reference was for its
premium motion, atmosphere, depth and composition, not its colours. 11D keeps
everything 11C got right — the dot-matrix bloom, its sway, dissolve, sparkles,
tip flares and state reactions — and places it inside a colourful, living
spatial field. The room is never black.

### Where it appears

```
┌──────────────────────────────────────────────────────────┐
│ upper band: deep indigo / violet atmosphere              │
│   ···· dot-matrix ribbons of light sweeping across ····  │
│ left:                      [bloom]          right:       │
│ blue → cyan      warm amber / coral cloud   magenta →    │
│ currents          behind the Core           violet, pink │
│      (the application windows float in front)            │
│ floor: points in cyan / teal near, violet far,           │
│        warm beneath the Core; the ground reflects above  │
└──────────────────────────────────────────────────────────┘
```

### Layers, far to near

| Layer | What you see | Speed | File |
| --- | --- | --- | --- |
| Far — the colour field | A deep indigo night (`#0d0b26`) lit by large, slowly moving clouds of coloured light: domain-warped noise gives them the texture of flowing ink or aurora; four zones whose centres drift and whose borders the flow bends place blue/cyan left, magenta/violet/pink right, indigo above, teal low; within each zone the hue itself travels. Dark gaps between clouds keep it deep. It deepens towards the ceiling, and the ground reflects it, dimmer. The 11C LED lattice remains as a faint dot texture in the field's own colour | very slow | `BACKDROP_FRAGMENT` |
| Far — the centre | A large cloud of warm amber, coral and a little pink behind the bloom, irregular at its edge (the flow shapes it), slowly breathing | very slow | same |
| Mid — haze and ribbons | A second, additive plane between the wall and the bloom (`z = -9`): a faint haze, and three large ribbons sweeping on long diagonal arcs, drawn as streams of plus-shaped LED dots along a soft glowing band that narrows where it turns, with pulses travelling along them. Thins in front of the Core | slow | `MIDGROUND_FRAGMENT` |
| Mid — the bloom | Unchanged from 11C; now its light reaches the room (below) | slow sway | `SpatialCore.tsx` |
| Near — points | The ambient points; they part around the pointer, strongly around a hand | medium-slow | `AmbientField.tsx` |
| Floor | The 11C point lattice, now in the room's colours: cyan and teal near and left, magenta right, violet towards the horizon, warm beneath the Core, drifting | slow | `FLOOR_FRAGMENT` |
| Foreground | The white application windows, unchanged; the small Core is clear glass holding a warm light | responsive | `NovaCore.tsx` |

**Parallax** (`ENVIRONMENT.layerParallax`): the wall is held back most
(`far: -0.3`), the mid layer less (`mid: -0.12`), so the layers separate as the
pointer moves; the windows hold still.

### How it reacts

| NOVA state | The environment |
| --- | --- |
| Idle | the clouds drift and change hue; the ribbons flow; the centre breathes; the bloom flares every 7.5 s |
| Listening | the flow quickens and follows the microphone; violet enters the centre |
| Thinking | the warm centre turns indigo; indigo streams travel out from the Core; ribbons flow faster, tinted |
| Command | a short cyan-to-violet ripple leaves the Core |
| Application opens | a wave travels across the whole wall (its colour turning with direction) and across the floor |
| Bloom flare | a small wave of warm light spreads from the bloom into the space around it (`spatialCoreLight.flare`) |
| Hand tracked | a local field of cyan-magenta colour follows the hand |
| Pointer | a gentle lift of the local colour |
| AI response | energy settles smoothly |

### Performance

No post-processing, no render targets, no textures, nothing allocated per
frame. The colour field uses two octaves of noise (cheaper than 11C's lattice
field); the mid layer is one additive plane whose ribbons skip pixels nowhere
near them and whose haze is a single noise octave. In the headless software
renderer 11D measured about a quarter more work per frame than 11C (≈770 ms
against ≈610 ms at 1440×900 — a relative figure only). Real frame rate on the
target laptop is unmeasured. Reduced motion holds everything still, and no
flare wave starts.

## Phase 11C — the environment itself

11B gave the room a centrepiece, but the room was still, fundamentally, white:
it read as a web page with 3D objects placed on it. 11C turns the environment
itself into a dark room the windows float in, and then — after a motion
reference (`reference/motion-background-reference.mp4`, `reference/frames/`) —
into a cinematic motion environment. This supersedes the earlier decision to
keep the room light; application surfaces stay light.

**Where the white came from, and what replaced it.** Three things painted it:
the CSS `--environment` token (the page behind the canvas, and the haze veil on
distant windows), the scene's clear colour, and the wall and floor shaders' light
palette. All three now draw from one near-black palette (`PALETTE` in
`src/data/environment.ts`, mirrored by `--environment` and `--env-ink` in
`src/index.css`, held equal by a test). No overlay covers anything: the scene owns
the background. Nothing plays video: the reference is studied, not shipped.

### What the reference taught

A twelve-second loop: about three quarters of the frame is near-black negative
space around one luminous subject, drawn entirely as a lattice of tiny
plus-shaped LED cells whose size and brightness follow the form beneath. Muted
silver-teal petals around a warm cream centre with traces of rose and amber;
a slow sway and breath; the lower half dissolving into dots that fall away; a
few cells twinkling as four-point stars; every few seconds a white flare along
the petal tips. No grids, no rings, no chrome — depth comes from light alone.

NOVA borrows the *language* (dot-matrix light on black, one living subject,
periodic flare, dissolve) and draws an original form: six petals fanned upward
from a warm heart, rising from the Spatial Core.

### Layers

| Layer | What you see | File |
| --- | --- | --- |
| Far — the wall | Near-black (`#0c0c0e`–`#121215`), falling into shadow at the edges, a faint lift of light behind the bloom, and a *living lattice*: single-pixel LED cells whose brightness drifts in slow warped-noise waves, thinning towards the edges | `BACKDROP_FRAGMENT` in `environmentShaders.ts` |
| Midground — the bloom | The NOVA Spatial Core: the dot-matrix bloom, large enough that its petals reach out above and between the windows | `SpatialCore.tsx` |
| Midground — points | The ambient points, drifting; they part around the pointer and strongly around a tracked hand | `AmbientField.tsx` |
| Floor | A world-space lattice of single points fading into the dark, dotted rings around the point beneath the bloom, a faint pool of light | `FLOOR_FRAGMENT` |
| Foreground | The white application windows, with a faint rim of light and deep shadows so they float; the small clickable Core, now dark glass holding a warm light | `NovaCore.tsx` |

The Phase 11/11B distant architecture (`SpatialStructures.tsx`), the vast rings
(`DistantRings.tsx`) and the light trails (`LightTrails.tsx`) were removed: the
reference's lesson is that one subject on black reads as premium, and those
competed with it.

### The bloom

One plane, one fragment shader, no geometry per dot. Each pixel finds its LED
cell, samples the bloom's form at the cell's centre (via screen-space
derivatives), and draws a plus glyph whose arms grow with brightness — with
fractional pixel coverage, so bright regions fade into the lattice instead of
snapping into a solid grid. A contrast curve and two layers of slowly drifting
value noise keep most cells dim and a few catching the light. Each petal has a
brighter midrib, faint veins and a lit edge, so it reads by its outline against
the dark gaps; the heart holds its light through the grain, with rose and
amber drifting through the cream.

| NOVA state | The bloom | The wall lattice |
| --- | --- | --- |
| Idle | slow sway and breath; the dissolve falls; sparkles twinkle; a white flare along the tips every 7.5 s | slow drift in muted silver and warm grey |
| Hand tracked | a little livelier, more sparkles; caption "Hand tracked" | — (the hand's own ring of light follows it) |
| Listening | petals breathe with the real microphone level; a trace of accent | ripples from the Core follow the microphone |
| Thinking | faster; NOVA's purple rises from the heart into the petals | flows faster and takes the accent |
| Command carried out | a flare: the tips whiten and each throws a four-point glint | a brief lift around the Core |
| Application opens | a flare, and a ring of accent dots leaving the heart | a wave leaves the Core across the wall; the floor's wave too |
| Answer complete | a soft flare as thinking settles | energy settles |
| Pointer | — | cells brighten around the pointer; points bend away |

**Time** is real elapsed time, capped at one second a frame so a background
tab cannot leap, and runs faster while NOVA is busy.

**Text on the room.** The identity mark, workspace rail, microphone label,
hints, deck title and Core caption use light-on-dark tokens (`--env-text*`);
the cursor is pale with a dark outline so it reads over both the room and a
white surface. Small instruments on the room itself (the workspace rail, the
Core caption) use a dark glass (`--glass-dark`); the light system glass is
nearly opaque so it does not turn grey over the dark.

**Parallax** (`ENVIRONMENT.layerParallax`). NOVA's viewpoint pivots on the
working plane, so the windows hold nearly still while the room swings behind
them; the far layer is held back so the wall, bloom and windows separate.

**Performance.** No post-processing, no render targets, no textures. The wall
lattice costs three fractal noise sums per pixel (dropped from four octaves to
two when the Performance Governor sets `quality: 'low'`); the bloom a six-petal
loop per pixel plus, only during a flare, six glints. Frame loops allocate
nothing and set no React state (tested). Real frame rate on the target laptop is
unmeasured — the headless renderer is software (SwiftShader).

**Reduced motion.** Sway, breath, dissolve, sparkles, the idle flare, the
lattice's flow and the pulses all hold still; the room stays a static,
readable composition.

## Phase 11B — the revision

The first pass (below) gave the room a floor, a wall, a horizon and a lit
centre. Judged in the running app it was still too plain: faint grids on a
light field. Phase 11B recomposes the room around a centrepiece and gives it
volume and life, keeping NOVA's light palette.

| Element | What you see | Where it lives |
| --- | --- | --- |
| **NOVA Spatial Core** | The room's centrepiece, standing in the gap between the windows: a faceted glass shell around a nucleus, an inner lattice turning against it, three thin rings at different tilts and speeds, a ring of orbiting points, a soft halo and a faint column of light down to the floor | `src/components/spatial/SpatialCore.tsx` |
| **Core caption** | "NOVA · Ready / Home · 5 surfaces" beside the Core on a hairline leader — the only text in the room | `src/components/interface/SpatialCoreLabel.tsx` |
| **Floor** | Rings around the point beneath the Core, alignment ticks every 10° (longer every 30°), eight spokes, a centre mark, over a quieter grid | `environmentShaders.ts` (`FLOOR_FRAGMENT`) |
| **Wall** | Large arcs centred behind the Core and a dashed scale ring, two long horizontal light paths with ticks, the horizon band — replacing the faint wall grid | `environmentShaders.ts` (`BACKDROP_FRAGMENT`) |
| **Distant architecture** | Six tall translucent panes, three each side at three depths, turned towards the centre | `src/components/spatial/SpatialStructures.tsx` |
| **Ambient points** | 150 small points, mostly in three quiet horizontal strata, drifting very slowly; a few carry the accent | `src/components/spatial/AmbientField.tsx`, layout in `src/systems/environment/ambientField.ts` |
| **Hand field** | With the camera on, a small field of concentric light follows the hand; nearby points brighten and part | `AmbientField.tsx` |
| **Far parallax** | The wall and the distant architecture travel slightly further with the pointer than perspective alone carries them (≈44 px across a full pointer sweep) | `EnvironmentRig.tsx` |

### How the Core responds

| NOVA state | The Core |
| --- | --- |
| Idle | slow drift of the rings and a slow breath; caption "Ready" |
| Hand tracked | a little livelier; halo and floor rings firm up; caption "Hand tracked" |
| Listening | quicker; the nucleus follows the real microphone level; accent tint; caption "Listening" |
| Thinking (Intelligence Core) | fastest; the middle ring counter-rotates; the nucleus fills with the accent; the column of light strengthens; caption "Thinking" |
| A sentence carried out (typed, spoken, Intelligence action, air click) | a quick kick of the shell and rings |
| An application opens | a ring of accent light expands outward from the Core and a wave crosses the floor |
| An answer completes (thinking → idle) | a brief settle |

Clicking, dragging and pointing never pulse — those are the user's own hands.
Under `prefers-reduced-motion` the drift, breath and pulses stop.

### Composition

The Intelligence Surface moved to the right-hand column beneath the status
panel, so the Spatial Core stays in view — and visibly thinks — while you talk
to it. The small clickable Core at the front of the room is unchanged; it stands
over the centre of the floor's rings, beneath the Spatial Core.

### Performance (11B)

Added: one points draw (150 points, drift computed in the vertex shader), six
static panes sharing one material, and the Core's handful of meshes. No
post-processing, no transmission/refraction pass, no bloom. Three frame loops
(`EnvironmentRig`, `SpatialCore`, `AmbientField`) write transforms and uniforms
only; tests check they allocate no objects and set no React state, and that none
of the environment files fetch, launch or dispatch. Real frame rate on the target
laptop is still unmeasured.

## Phase 11 — the first pass

### Purpose

The environment behind NOVA's windows read as a plain, near-white field. Phase 11
makes it a room — with a floor, a far wall, a horizon, a lit centre and edges
that settle — so the windows read as objects standing in a spatial computer
rather than rectangles on a background. It keeps NOVA's established light,
warm-neutral identity; it does not introduce a dark theme or a new colour
system.

## Visual architecture

The room is drawn in `src/components/spatial/EnvironmentRig.tsx`, back to front:

| Layer | What it is | How it is drawn |
| --- | --- | --- |
| Far wall | Brightest where the stage light falls, settling a few steps deeper towards its sides and top; a faint grid continuing the floor's major lines upward, fading with height | shader on one plane, `z = -12` (moved back from `-7`) |
| Horizon | A narrow band of light where the floor meets the wall — the line that gives the room its scale | same shader |
| Floor tone | The floor seen through the grid: lighter at the horizon, deeper towards the viewer | same shader, below the horizon |
| Stage light | A wide, soft light behind the centre of the working volume | same shader |
| Edge falloff | The room settles towards the edges of the view; it lives on the wall, behind the windows, and never darkens a window | same shader |
| Field | A world-space grid on the floor (1.15 and 4.6 unit lines), anti-aliased with screen-space derivatives; two faint rings around the stage; fades long before its own edge | shader on the floor plane |
| Haze | Fog lifting distant surfaces away | unchanged from Phase 1 |
| Light | Mostly ambient with one soft key and a fill; no shadow pass | unchanged from Phase 1 |

The two shaders (`environmentShaders.ts`) replace the two canvas textures the
room used before; `src/utils/textures.ts` keeps only the Core's soft shadow.

**Depth.** Foreground: the Core and the nearest windows. Midground: the working
volume. Background: the wall, its grid and the horizon. The white application
surfaces now stand clear of a room that is a few steps deeper than they are,
rather than white on near-white.

## Colour

All room colours live in one place, `PALETTE` in `src/data/environment.ts`,
because the WebGL scene cannot read CSS custom properties. `base` equals CSS
`--environment`, `accent` equals `--accent`, `ink` equals `--text`; the other
entries are steps of the same warm neutral, all in NOVA's light range. A test
holds those equalities and that the room itself is neutral.

The accent appears in the room only as NOVA's own activity (below), never as
decoration. One new CSS token was added, `--glass-reading`, for the
Intelligence Surface's reading glass.

## Interaction response

`src/systems/environment/ambience.ts` turns existing state into a few numbers
the renderer eases towards. Nothing loops or drifts on its own.

| NOVA state | The room |
| --- | --- |
| Pointer movement | Parallax — unchanged, from Phase 1's `CameraRig` |
| A confident hand in view (camera on) | The floor and wall grids firm up slightly ("the room wakes") |
| Microphone listening | The stage light takes a faint tint of the accent; the Core's activity rises |
| Intelligence Core thinking | A slightly stronger tint; the Core's activity rises further |
| An application opens — air click, Command Deck, typed or spoken `open` | One ring of accent light spreads once across the wall, directly behind the window that opened (1.4 s) |
| A native application launches | The same ring, from behind the Core |

Focusing, dragging and pointing do not ripple. The ripple is drawn on the wall
rather than the floor because at NOVA's viewing angle the floor beneath the
windows is below the frame. Under `prefers-reduced-motion` there is no ripple.
Existing gesture feedback — hover lift, the air-click armed outline, the focus
ring — is unchanged.

The Core (`NovaCore.tsx`) reads the same signals, so NOVA's presence and the
room's light always agree.

## Performance

- Two single-pass fragment shaders with no texture reads replace two canvas
  textures; no post-processing, no particles, no bloom, no shadow pass.
- One new `useFrame` in `EnvironmentRig`: it reads a few store values, eases
  three uniforms and projects one point. It allocates nothing (tested), and does
  no network or native I/O (tested).
- Signals are push-based — the command bus and hand frames — so nothing slow is
  polled.
- Real frame rate on the target laptop is **not measured**: frame rates under
  headless software rendering say nothing about real hardware.

## Relationship to Phase 10

The Intelligence Surface is unchanged in function. Its glass now uses the
`--glass-reading` token, and the room responds to it: while NOVA thinks, the
stage light carries the accent. The surface stays the brightest, most forward
element when open.

## Future compatibility (not implemented)

- **Phase 12 — portal and application reveal.** The stage (`ENVIRONMENT.stage`,
  the centre of the room, ringed on the floor, lit on the wall) is kept clear for
  a portal to stand in and applications to emerge from.
- **Phase 13 — spatial layers and swipe navigation.** The wall now stands at
  `z = -12`, leaving depth between the working volume (`z ≥ -3.4`) and the wall
  for further layers, and the ripple/ambience mechanism is the place a layer
  transition's feedback would attach.

Neither phase is implemented.

## Files

**Introduced:** `src/components/spatial/environmentShaders.ts`,
`src/systems/environment/ambience.ts`, `src/systems/environment/verifyEnvironment.ts`;
in 11B, `src/components/spatial/{SpatialCore,AmbientField}.tsx` (`SpatialCore.tsx`
redrawn in 11C as the bloom), `src/components/spatial/spatialCoreState.ts`;
`src/systems/environment/ambientField.ts`, `src/components/interface/SpatialCoreLabel.tsx`.

**Added in 11D:** `MIDGROUND_FRAGMENT` and the mid layer in `EnvironmentRig.tsx`,
`spatialCoreLight` in `spatialCoreState.ts`, the field colours in `PALETTE`,
`ENVIRONMENT.midground` and `layerParallax.mid`.

**Removed in 11C:** `SpatialStructures.tsx` (11B), and the 11C first-pass
`DistantRings.tsx` and `LightTrails.tsx` (never committed).

**Modified:** `src/components/spatial/EnvironmentRig.tsx`, `src/data/environment.ts`
(`PALETTE`, `floor`, `stage`, `fog`, wall moved to `z = -12`),
`src/components/core/NovaCore.tsx`, `src/utils/textures.ts` (unused canvas
textures removed), `src/index.css` (`--glass-reading`; the microphone panel's
detail line moved to secondary text for contrast on the deeper floor; in 11B the
Core caption, and the Intelligence Surface moved to the right-hand column),
`src/components/spatial/SpatialScene.tsx` and
`src/components/interface/SystemLayer.tsx` (mounting), `package.json`.

## Tests

`src/systems/environment/verifyEnvironment.ts` (`npm run test:environment`) — 274
assertions after 11E (256 after 11D, 213 after 11C, 166 after 11B, 74 in the first pass). 11D adds:
the room is a deep indigo night, never black or white; the field colours span
the wheel, include warmth and are never neon; the zones drift and their hues
travel; the warm centre is irregular, breathes and turns indigo while thinking;
thinking sends streams; the mid layer lies between wall and bloom, moves more
than the wall, only adds light, and thins before the Core; three dot-matrix
ribbons with travelling pulses; the floor takes the room's colours; the bloom
shares its flare and each flare sends one wave (never under reduced motion); a
hand carries a local colour field; the colour uses two octaves and there is no
post-processing. 11E replaces the colour-zone checks: the room tones are blue-grey
(never black, white or a hue); pearl and silver are nearly colourless; warm,
violet and cyan each have their hue; the 11D zone colours are gone; there are no
colour zones; slate atmosphere, key light, horizon, arc, frames and orbit exist;
every use of violet in wall, floor and mid layer is gated by thinking or a
command; the bloom and points turn violet only while thinking; hand, pointer,
opening and listening bring cyan; the streams are pearl and fade with distance. 11C adds: the page
and the scene are the dark room, not white; the palette is near-black and
neutral; surfaces stay white; the removed layers stay removed and the far group
holds only the wall; the wall lattice is procedural, cell-sampled, fed by every
state input, thinned at the edges, lower detail on modest hardware and still
under reduced motion; the bloom samples per cell, draws plus glyphs, has six
swaying and breathing petals, dissolves, sparkles and flares, answers the
Core's modes, the microphone and the command, open and settle pulses (each
checked separately), is large, holds still under reduced motion, and never
fetches or sets React state. Earlier
checks: the state-to-room mapping, live signal reading, ripple lifecycle and
reduced motion, which commands ripple, ripple placement geometry, the Core's
modes and their ordering, which commands pulse (and that drags and clicks never
do), the settle when an answer completes, the ambient points being deterministic,
capped and behind the windows, the Core standing behind the working volume with
its floor in view, the palette
matching CSS tokens and staying light and neutral, the room enclosing the view
and keeping the centre clear, and no I/O or allocation in the render path. The
look itself was checked by eye in rendered frames, not by screenshot tests.

## Limitations

- Performance on real hardware is unmeasured.
- The bottom-edge hint line (onboarding, drawn at half opacity) has lower
  contrast on the deeper floor; it retires after the first command.
- The ripple starts behind the window that opened and becomes visible as it
  widens past the window's edge.
- Most of the bloom sits behind the default window arrangement; its petal tips,
  heart and dissolve show between and above the windows.
- The Spatial Core and the small clickable Core are two objects; the small one
  is still the control. Merging them would move the workspace-defined Core and
  its interaction target, which 11B deliberately left alone.
- The Core caption is placed for the default arrangement; in other workspaces a
  window can sit over it.
- Live testing drew heavily on the Gemini free-tier quota (429 responses were
  seen); the Intelligence Surface handled them gracefully.
- Hand and microphone states were exercised with simulated input, not a live
  camera or microphone.
- The listening transcript bar can overlap the Core caption (pre-existing).
