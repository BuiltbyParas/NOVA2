export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * Frame-rate independent exponential approach. `lambda` is roughly "how quickly",
 * higher is snappier. Used everywhere instead of fixed-duration tweens so that
 * interrupting a motion never looks broken.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Gentle overshoot-free ease used for entry and workspace transitions. */
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 5);
