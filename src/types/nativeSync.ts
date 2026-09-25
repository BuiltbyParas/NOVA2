import type { AppType } from './window';

/**
 * Where NOVA's two worlds meet.
 *
 * NOVA has a spatial world — five surfaces, a focus, a workspace — and, since
 * Phase 8, a reading of the real computer. Until now they sat side by side and
 * were deliberately never compared. This vocabulary is the comparison, and
 * nothing more: it *describes* the relationship between them and never changes
 * either one.
 *
 * The distinction the whole file exists to keep: a spatial surface called
 * "Browser" and a running Firefox are two different facts about two different
 * objects. Synchronisation reports whether they agree. It does not make them
 * agree, because deciding that a running application should conjure a window —
 * or that a closed window should kill a process — is a product decision nobody
 * has made yet.
 */

/**
 * How a spatial surface and its native counterpart stand to one another.
 *
 * `absent` is the fifth because the four named in the brief leave a real case
 * uncovered: a surface that is closed *and* an application that is not running.
 * Calling that `spatial-only` would be false, and calling it `unknown` would
 * conflate "nothing is there" with "we could not look" — a distinction that has
 * to survive, because one is an answer and the other is a failure.
 */
export type NativeSpatialStatus =
  /** The surface is open and the application is running. */
  | 'synced'
  /** The application is running; NOVA has no surface open for it. */
  | 'native-only'
  /** The surface is open; no matching application is running. */
  | 'spatial-only'
  /** Neither exists. Known, and known to be nothing. */
  | 'absent'
  /** The provider could not be reached, so nothing can be said. */
  | 'unknown';

/**
 * How far a launch has got.
 *
 * `launch-requested` is emphatically **not** `running`. NOVA asks the desktop to
 * activate an entry and gets told the request was accepted — which says nothing
 * about whether the application started, is still starting, or failed a second
 * later. Only a subsequent snapshot showing a live process makes it `running`.
 * Collapsing the two would make NOVA confidently wrong about the computer.
 */
export type LaunchLifecycle =
  | 'idle'
  | 'launch-requested'
  | 'running'
  /** The launcher reported a real failure — not merely an absence of news. */
  | 'unavailable';

/**
 * A real application, reduced to what can honestly be said about it.
 *
 * No window id and no geometry: Wayland does not expose them, and inventing
 * them would be the one thing this layer must never do. The stable identity is
 * the desktop entry id, exactly as it is everywhere else in NOVA.
 */
export interface NativeRuntimeApplication {
  applicationId: string;
  name: string;
  running: boolean;
  /** NOVA's spatial category, when it has one. Absent for most applications. */
  spatialAppType?: AppType;
  lifecycle: LaunchLifecycle;
}

/** One of NOVA's five surfaces, next to whatever is running for it. */
export interface SpatialApplicationSync {
  appType: AppType;
  spatialOpen: boolean;
  nativeRunning: boolean;
  /** The desktop id observed running, when one was. */
  nativeApplicationId?: string;
  nativeName?: string;
  status: NativeSpatialStatus;
  lifecycle: LaunchLifecycle;
}

/** One reading of how the two worlds line up. Plain, serializable, inert. */
export interface NativeSpatialSync {
  /** False when the provider could not be reached. Never means "nothing runs". */
  available: boolean;
  at: number;
  /** Always all five surfaces, in a stable order. */
  spatial: SpatialApplicationSync[];
  /** Running applications NOVA has no surface for — Spotify, Calculator, … */
  nativeOnly: NativeRuntimeApplication[];
}

/** A launch NOVA asked for, and what the launcher said about the asking. */
export interface LaunchRequest {
  applicationId: string;
  at: number;
  accepted: boolean;
}
