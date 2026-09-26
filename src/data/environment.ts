/** Tuning constants for the spatial environment. Kept in one place, never inlined. */

export const ENVIRONMENT = {
  /** Camera rest position. The user's viewpoint into the space. */
  camera: {
    position: [0, 0.1, 7.2] as const,
    target: [0, 0.05, 0] as const,
    fov: 38,
    near: 0.1,
    far: 60,
  },
  /** How far the viewpoint drifts with the pointer. Enough to read as parallax, not motion. */
  parallax: {
    amountX: 0.42,
    amountY: 0.26,
    damping: 2.4,
  },
  /** Depth range windows are allowed to occupy. */
  depth: {
    back: -3.4,
    front: 1.9,
  },
  bounds: {
    x: 4.6,
    y: 2.4,
  },
  scale: {
    min: 0.42,
    max: 1.75,
  },
  /** Rotation is deliberately narrow — objects must stay physically believable. */
  rotationLimit: {
    x: 0.26,
    y: 0.52,
  },
  /**
   * The far wall. Phase 11 moved it back from z = -7 so the floor recedes
   * further before meeting it: the horizon sits about a quarter of the way up
   * the view, which is what makes the space read as a room rather than as a
   * floor in front of a colour. Sized to fill the view at that distance.
   */
  backdrop: {
    z: -12,
    width: 56,
    height: 30,
  },
  /** The mid layer (Phase 11D): haze and the flowing light ribbons, between the wall and the bloom. */
  midground: {
    z: -9,
    width: 44,
    height: 22,
  },
  /** The floor plane: its height, and where its field is centred. */
  floor: {
    y: -3.15,
    z: -1.2,
    size: 46,
  },
  /**
   * The centre of the room — where the NOVA Spatial Core stands, and what the
   * floor's rings, ticks and spokes are drawn around.
   *
   * Behind the working volume (windows may come no further back than z = -3.4)
   * and far enough back that the floor beneath it is in view, so the core and
   * the floor visibly belong to each other. It is also where a later portal can
   * stand and applications can emerge from, without the environment being
   * redrawn.
   */
  stage: { x: 0, z: -6.2 },
  /** The NOVA Spatial Core (Phase 11B): its height above the floor's plane, and size. */
  spatialCore: { y: -1.45, radius: 0.56 },
  /** Ambient points drifting in the room's volume. Deliberately few. */
  ambient: { count: 150, seed: 20260926 },
  /**
   * Layered parallax (Phase 11C).
   *
   * NOVA's viewpoint pivots on the working plane, so the windows — the text —
   * hold nearly still while the room behind them swings with the pointer, and
   * the floor nearest the viewer moves the other way. Left alone, the far wall
   * would swing *most*. `far` holds the wall and the distant rings back to about
   * a third of that swing, so the layers separate: the far world moves least,
   * the midground (panes, ambient points, the Spatial Core) more, and the near
   * floor against them. Sideways only, so the horizon stays exactly where the
   * floor meets the wall.
   *
   * Phase 11D adds `mid`: the plane of haze and light ribbons between the wall
   * and the bloom, held back less than the wall, so it moves a little more.
   */
  layerParallax: { far: -0.3, mid: -0.12 },
  /** Haze: starts lifting surfaces away at `near`, and has fully settled by `far`. */
  fog: { near: 11, far: 27 },
} as const;

/**
 * The environment's palette (Phase 11E).
 *
 * The WebGL scene cannot read CSS custom properties, so the colours the room is
 * drawn with live here — once — and mirror the tokens at the top of
 * `src/index.css`: `base` is `--environment`, `ink` is `--env-ink`, `accent` is
 * `--accent`; a test holds them equal.
 *
 * Since 11E the room is a darkened physical space — deep blue-grey, graphite and
 * slate, never black, never white — and colour is *light*, each with one
 * meaning, never paint:
 *
 *   warm white / amber   the NOVA Core, lighting what is around it
 *   violet / the accent  intelligence: only while NOVA thinks
 *   cyan                 spatial interaction: hand, pointer, waves — always local
 *   pearl / silver       the room's own light: dots, ribbons, structures
 *
 * The application surfaces stay light, so they float in it.
 */
export const PALETTE = {
  /** The room: deep blue-grey. */
  base: '#0b111b',
  /** The far wall high up, and towards the horizon. */
  wallHigh: '#080d16',
  wallLow: '#111a28',
  /** The floor far away, and nearest the viewer. */
  floorFar: '#0f1724',
  floorNear: '#070b12',
  /** Pale ink for every line and structure drawn in the room. */
  ink: '#e6e4ee',
  /** The light of the room: warm white. */
  light: '#f2eee6',
  /** Haze colour: distant surfaces sink into the room's own air. */
  haze: '#111a28',
  /** The room's atmospheric light: soft slate-blue, moving. */
  slate: '#26384d',
  /** The room's own light, for dots, ribbons and structures. */
  pearl: '#d9e0ea',
  silver: '#9aa8b8',
  /** Spatial interaction. */
  cyan: '#7fd8e6',
  /** Intelligence: a lighter companion to the accent, for light rather than UI. */
  violet: '#8a6cf0',
  /** The Core's light. */
  warmWhite: '#f6e9d2',
  amber: '#e9b47c',
  /** The bloom's petals (pearl-silver) and centre. */
  petal: '#c3ccd6',
  bloomCore: '#efe3cf',
  accent: '#5b5ce2',
} as const;

/**
 * CSS-pixel resolution per spatial unit for DOM-backed window surfaces.
 * Window content is authored at this density and scaled into the 3D scene.
 */
export const PIXELS_PER_UNIT = 260;

/** Corner radius shared by the 3D window slab and its DOM surface, in spatial units. */
export const WINDOW_CORNER_RADIUS = 14 / PIXELS_PER_UNIT;

/** Physical thickness of a window slab. Small, but enough to catch light at the edge. */
export const WINDOW_THICKNESS = 0.028;
