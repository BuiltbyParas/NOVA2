/** Core spatial primitives. Every object in NOVA lives in this coordinate space. */

/**
 * NOVA world space, in "spatial units" (~1 unit reads as ~25cm of perceived space).
 *
 *   +x → right      +y → up      +z → toward the user (front)
 *
 * The camera sits on the +z axis looking toward the origin, so a more negative
 * z means "further back in the environment".
 */
export type SpatialPosition = {
  x: number;
  y: number;
  z: number;
};

/** Euler rotation in radians. NOVA deliberately keeps these small and believable. */
export type SpatialRotation = {
  x: number;
  y: number;
  z: number;
};

export type SpatialSize = {
  width: number;
  height: number;
};

export const position = (x: number, y: number, z: number): SpatialPosition => ({ x, y, z });
export const rotation = (x: number, y: number, z: number): SpatialRotation => ({ x, y, z });
