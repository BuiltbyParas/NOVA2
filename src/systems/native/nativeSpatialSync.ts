import type { NativeSnapshot } from '../../types/native';
import type {
  LaunchLifecycle,
  LaunchRequest,
  NativeRuntimeApplication,
  NativeSpatialStatus,
  NativeSpatialSync,
  SpatialApplicationSync,
} from '../../types/nativeSync';
import type { AppType } from '../../types/window';
import { APP_ORDER } from '../../data/apps';
import { useSpatialStore } from '../../state/spatialStore';
import { useNativeStore } from './nativeStore';

/**
 * Comparing NOVA's spatial world with the real computer.
 *
 * The comparison itself is a **pure function**: a native snapshot, the set of
 * open surfaces and any launches NOVA has asked for go in; a description comes
 * out. It reads no store, performs no I/O, and — most importantly — changes
 * nothing. A synchronisation layer that could act would be a second command
 * path, and NOVA has exactly one.
 *
 * The direction is strictly one-way:
 *
 *     intent → command → commandBus → state → *synchronisation*
 *
 * never the reverse. Nothing here opens a window because an application is
 * running, and nothing here stops an application because a window closed.
 * Reporting the difference is the whole job; deciding what to do about it is a
 * product question nobody has answered yet.
 *
 * Cost is O(applications) over a list the provider already produced, computed
 * only when something asks. There is no new polling — Phase 8's thirty-second
 * cycle remains the only thing that talks to the host.
 */

/**
 * How long a launch stays "requested" before NOVA stops waiting.
 *
 * Longer than one native poll, so a launch always gets at least one snapshot to
 * be confirmed by, and short enough that a request nothing came of does not sit
 * there forever claiming something is on its way.
 */
export const LAUNCH_PENDING_MS = 45_000;

export interface SyncInput {
  native: NativeSnapshot;
  /** Ids of the surfaces NOVA currently has. From `spatialStore`, never derived. */
  spatialWindowIds: readonly string[];
  /** Launches NOVA has asked for, newest per application. */
  launchRequests: readonly LaunchRequest[];
  at: number;
}

/** The most recent request for an application, by either identity it may carry. */
function requestFor(
  requests: readonly LaunchRequest[],
  identities: readonly (string | undefined)[],
): LaunchRequest | null {
  const wanted = new Set(identities.filter((id): id is string => Boolean(id)));
  let best: LaunchRequest | null = null;
  for (const request of requests) {
    if (!wanted.has(request.applicationId)) continue;
    if (!best || request.at > best.at) best = request;
  }
  return best;
}

/**
 * How far along a launch is.
 *
 * `running` outranks everything, because a live process is the only evidence
 * that actually settles the question. A request that was refused reports
 * `unavailable` — but only because the launcher said so; silence is never read
 * as failure.
 */
function lifecycleFor(
  running: boolean,
  request: LaunchRequest | null,
  at: number,
): LaunchLifecycle {
  if (running) return 'running';
  if (!request) return 'idle';
  if (!request.accepted) return 'unavailable';
  return at - request.at <= LAUNCH_PENDING_MS ? 'launch-requested' : 'idle';
}

function statusFor(spatialOpen: boolean, nativeRunning: boolean): NativeSpatialStatus {
  if (spatialOpen && nativeRunning) return 'synced';
  if (nativeRunning) return 'native-only';
  if (spatialOpen) return 'spatial-only';
  return 'absent';
}

/**
 * Compare the two worlds.
 *
 * Deterministic: the same inputs always produce the same description, which is
 * what makes it testable against fixtures and safe to call as often as anything
 * cares to ask.
 *
 * When the provider is unavailable every surface reports `unknown` and
 * `nativeRunning: false` — and `available` is false, which is the field callers
 * must read. "Not running" and "we could not look" are different claims, and
 * only `available` distinguishes them.
 */
export function synchronise(input: SyncInput): NativeSpatialSync {
  const { native, spatialWindowIds, launchRequests, at } = input;
  const available = native.status === 'ok';
  const open = new Set(spatialWindowIds);

  const spatial: SpatialApplicationSync[] = APP_ORDER.map((appType: AppType) => {
    const spatialOpen = open.has(appType);

    // The provider already decided which NOVA category each application belongs
    // to, when it could. This reads that decision rather than re-making it.
    const match = available
      ? native.applications.find(
          (application) => application.appType === appType && application.running,
        )
      : undefined;

    const nativeRunning = Boolean(match);
    const request = requestFor(launchRequests, [appType, match?.nativeId]);

    return {
      appType,
      spatialOpen,
      nativeRunning,
      ...(match ? { nativeApplicationId: match.nativeId, nativeName: match.name } : {}),
      status: available ? statusFor(spatialOpen, nativeRunning) : 'unknown',
      /**
       * The launch record is NOVA's own, so it survives the provider going
       * quiet. `nativeRunning` is forced false there not as a claim that
       * nothing runs — `status` says `unknown` for that — but because only a
       * snapshot can promote something to `running`, and there is no snapshot.
       */
      lifecycle: lifecycleFor(available && nativeRunning, request, at),
    };
  });

  /**
   * Applications NOVA has no surface for.
   *
   * They are reported as what they are — running software on this computer —
   * and given no spatial representation whatsoever. Manufacturing a window for
   * every installed application is what a later phase may decide to do; doing
   * it here would corrupt `AppType` and the workspace layout to no purpose.
   */
  const nativeOnly: NativeRuntimeApplication[] = available
    ? native.applications
        .filter((application) => application.running && application.appType === 'unknown')
        .map((application) => ({
          applicationId: application.nativeId,
          name: application.name,
          running: true,
          lifecycle: 'running' as const,
        }))
    : [];

  return { available, at, spatial, nativeOnly };
}

// --- the live reading --------------------------------------------------------

/**
 * Launches NOVA has asked for.
 *
 * One entry per application, newest wins — a person pressing twice is still one
 * intention. Bounded by construction: there are only as many entries as there
 * are applications anyone has tried to open this session.
 */
const requests = new Map<string, LaunchRequest>();

/**
 * Record that NOVA asked the host to open something.
 *
 * Called from the native action client, which is the single funnel every launch
 * passes through — so this cannot miss one, and it cannot be told about a
 * launch that did not happen.
 */
export function noteLaunchRequest(applicationId: string, accepted: boolean, at = Date.now()) {
  if (!applicationId) return;
  requests.set(applicationId, { applicationId, at, accepted });
}

/** Test seam, and a way to forget a session's history. */
export function clearLaunchRequests() {
  requests.clear();
}

export function launchRequests(): LaunchRequest[] {
  return [...requests.values()];
}

/**
 * The current reading, from live state.
 *
 * A plain read of two stores the rest of NOVA already maintains — no I/O, safe
 * to call from anywhere outside a render path, and cheap enough that the
 * inspector can ask on every command.
 */
export function currentSync(at = Date.now()): NativeSpatialSync {
  return synchronise({
    native: useNativeStore.getState().snapshot,
    spatialWindowIds: Object.keys(useSpatialStore.getState().windows),
    launchRequests: launchRequests(),
    at,
  });
}
