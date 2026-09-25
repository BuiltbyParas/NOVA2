import type { AppType } from './window';

/**
 * NOVA's vocabulary for the computer it is running on.
 *
 * Phase 8 is **read-only**. Every type here describes something observed; none
 * of them describes something done. There is deliberately no action, no handle
 * and no command in this file, because the moment one appears the native layer
 * stops being a pair of eyes and becomes a pair of hands, and that is a later
 * phase with a different safety argument.
 *
 * The other rule this file exists to hold: *native state is not spatial state*.
 * A native window has a title, a process and a compositor; a NOVA window has a
 * position, a scale and a relation to other surfaces. They are different objects
 * about different things, and Phase 8 does not reconcile them.
 */

/** Whether NOVA managed to look at the host at all. */
export type NativeStatus =
  /** No provider is reachable — NOVA is running as an ordinary web page. */
  | 'unavailable'
  /** A provider answered. Individual capabilities may still be false. */
  | 'ok'
  /** A provider was reachable but failed or answered with nonsense. */
  | 'error';

export type NativePlatform = 'linux' | 'darwin' | 'windows' | 'unknown';

export type NativeSessionType = 'wayland' | 'x11' | 'tty' | 'unknown';

/**
 * What the host actually permits, stated one capability at a time.
 *
 * Every one of these is false until proven otherwise. A platform that cannot do
 * something must say so — reporting an empty list as though it were an answer
 * is how a system starts lying about the world it claims to understand.
 */
export interface NativeCapabilities {
  /** Operating system, distribution, desktop environment, session type. */
  platformDetection: boolean;
  /** Which applications are installed, from desktop-entry metadata. */
  applicationEnumeration: boolean;
  /** Which of them are currently running, from process names. */
  runningProcessDetection: boolean;
  /** Which native windows exist. Unavailable under Wayland without a shell extension. */
  windowEnumeration: boolean;
  /** Where those windows are. Requires window enumeration first. */
  windowGeometry: boolean;
  /** Which native workspace each window is on. */
  workspaceEnumeration: boolean;
}

export const NO_CAPABILITIES: NativeCapabilities = {
  platformDetection: false,
  applicationEnumeration: false,
  runningProcessDetection: false,
  windowEnumeration: false,
  windowGeometry: false,
  workspaceEnumeration: false,
};

/**
 * A real application on the host.
 *
 * `nativeId` is the stable identifier the platform gives it — a desktop entry
 * id on Linux — and is what identity mapping keys on. `appType` is NOVA's
 * category for it, which is a *lossy* reading: Firefox, Chrome and Brave are
 * all `browser`, and each keeps its own name and native id alongside.
 */
export interface NativeApplication {
  nativeId: string;
  name: string;
  /** NOVA's category, or `unknown` when no reliable mapping exists. */
  appType: AppType | 'unknown';
  /** The desktop entry this came from, where the platform has such a thing. */
  desktopId?: string;
  /** Executable name, when the platform exposes it safely. Never arguments. */
  executable?: string;
  /** Whether a process for it was observed. False when detection is unavailable. */
  running: boolean;
}

/**
 * A real window on the host.
 *
 * Every field beyond identity is optional, because most platforms will not
 * supply them and NOVA must not invent them. On a Wayland session this list is
 * empty and `windowEnumeration` is false — that is the honest answer, not a
 * failure to try hard enough.
 */
export interface NativeWindow {
  nativeId: string;
  /** The `nativeId` of the owning application. */
  applicationId: string;
  title: string;
  appType: AppType | 'unknown';
  visible?: boolean;
  minimized?: boolean;
  maximized?: boolean;
  /** In native screen pixels. **Never** to be read as a NOVA spatial position. */
  geometry?: { x: number; y: number; width: number; height: number };
  /** The host's own workspace, which is not a NOVA workspace. */
  workspace?: string;
}

/**
 * One reading of the host computer.
 *
 * Plain and serializable, like every other snapshot in NOVA, so it can be
 * inspected, logged, diffed and tested without a live machine.
 */
export interface NativeSnapshot {
  status: NativeStatus;
  at: number;
  platform: NativePlatform;
  osName?: string;
  osVersion?: string;
  desktopEnvironment?: string;
  sessionType: NativeSessionType;
  capabilities: NativeCapabilities;
  applications: NativeApplication[];
  windows: NativeWindow[];
  /**
   * Why things are the way they are, in plain language.
   *
   * A capability being false is only half an answer; this is the other half,
   * and it is what stops "window enumeration: false" from reading like a bug.
   */
  notes: string[];
  /** Set when `status` is `error`. */
  error?: string;
}

/** What NOVA reports before it has looked, or when there is nothing to look at. */
export function unavailableSnapshot(reason: string, at = 0): NativeSnapshot {
  return {
    status: 'unavailable',
    at,
    platform: 'unknown',
    sessionType: 'unknown',
    capabilities: { ...NO_CAPABILITIES },
    applications: [],
    windows: [],
    notes: [reason],
  };
}
