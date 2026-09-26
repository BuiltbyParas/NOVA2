/**
 * Where the room's ambient points are (Phase 11B).
 *
 * Generated, not random: a seeded generator lays the same points out on every
 * launch, so the room has a composition rather than a new scatter each time,
 * and a test can pin it.
 *
 * Most points sit in three quiet horizontal strata — which reads as structure,
 * data held in the room, rather than as a starfield — and the rest are spread
 * through the volume. All of them stay behind the working volume (windows may
 * come no further back than z = -3.4), so none can drift in front of a window's
 * text.
 */

export interface AmbientPoints {
  count: number;
  positions: Float32Array;
  /** 0..1 per point: phase of its drift, and whether it carries the accent. */
  seeds: Float32Array;
  /** Point size, in the renderer's units. */
  sizes: Float32Array;
}

/** Bounds the points are generated within. Exported so a test can hold them to it. */
export const AMBIENT_BOUNDS = {
  x: [-12, 12],
  y: [-2.9, 4.4],
  z: [-11.2, -3.9],
} as const;

/** The heights of the three strata, and how loosely points gather around them. */
const STRATA = [-2.35, 0.95, 3.1];
const STRATA_SPREAD = 0.16;
const STRATA_SHARE = 0.62;

/** Mulberry32: tiny, fast, and the same sequence for the same seed everywhere. */
function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: () => number, [low, high]: readonly [number, number]) => low + random() * (high - low);

export function generateAmbientPoints(count: number, seed: number): AmbientPoints {
  const n = Math.max(0, Math.min(Math.floor(count), 400));
  const random = generator(seed);
  const positions = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const sizes = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const inStratum = random() < STRATA_SHARE;
    const x = between(random, AMBIENT_BOUNDS.x);
    const y = inStratum
      ? STRATA[Math.floor(random() * STRATA.length)] + (random() - 0.5) * 2 * STRATA_SPREAD
      : between(random, AMBIENT_BOUNDS.y);
    const z = between(random, AMBIENT_BOUNDS.z);

    positions[i * 3] = x;
    positions[i * 3 + 1] = Math.min(Math.max(y, AMBIENT_BOUNDS.y[0]), AMBIENT_BOUNDS.y[1]);
    positions[i * 3 + 2] = z;
    seeds[i] = random();
    // Mostly small; a few a little larger, so the field has scale rather than grain.
    sizes[i] = random() < 0.12 ? 2.6 + random() * 1.2 : 1.3 + random() * 0.9;
  }

  return { count: n, positions, seeds, sizes };
}
