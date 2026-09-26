import type { SpatialPosition, SpatialRotation } from './spatial';

/** The applications NOVA can represent spatially. Later these map to real processes. */
export type AppType = 'browser' | 'code' | 'files' | 'notes' | 'terminal';

/**
 * Lifecycle is separate from `minimized` because minimizing is a *state* the user
 * can move in and out of, while entering/closing are one-way spatial transitions.
 */
export type WindowLifecycle = 'entering' | 'settled' | 'closing';

/**
 * The single source of truth for one spatial window.
 *
 * Nothing in the render layer owns any of these values — renderers read this state
 * and interpolate toward it. That is what lets a future hand gesture, a voice
 * command or the AI write the exact same fields the mouse writes today.
 */
export interface SpatialWindow {
  id: string;
  app: AppType;
  title: string;

  /** Target transform. Rendering damps toward these, it never writes back to them. */
  position: SpatialPosition;
  rotation: SpatialRotation;
  scale: number;

  /** Intrinsic size in spatial units, before `scale` is applied. */
  width: number;
  height: number;

  focused: boolean;
  minimized: boolean;

  lifecycle: WindowLifecycle;
  /** Timestamp (ms) the current lifecycle phase began, used to drive its transition. */
  lifecycleAt: number;
  /**
   * Where the window came out of, if anywhere (Phase 12): the NOVA Core. Its
   * entering transition travels from here to its place. Presentation only.
   */
  origin?: SpatialPosition;
}

/** A transform without identity — what a workspace layout stores for each app. */
export interface WindowPlacement {
  position: SpatialPosition;
  rotation: SpatialRotation;
  scale: number;
}
