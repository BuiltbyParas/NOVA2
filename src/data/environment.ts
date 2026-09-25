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
  backdrop: {
    z: -7,
    width: 44,
    height: 26,
  },
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
