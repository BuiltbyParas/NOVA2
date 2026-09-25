import type { AppType } from '../../types/window';
import type { NativeSnapshot } from '../../types/native';
import { unavailableSnapshot } from '../../types/native';
import type {
  NativeActionRequest,
  NativeActionResult,
  NativeCapability,
} from '../../types/nativeAction';
import { failedAction } from '../../types/nativeAction';
import { APPS } from '../../data/apps';
import { nativeState } from './nativeStore';
import { requestNativeAction } from './nativeActions';

/**
 * The boundary where NOVA meets the operating system.
 *
 * Phase 7 declared this seam and left it empty. Phase 8 fills it with **eyes and
 * nothing else**: an adapter can now report what the host *is* and what is
 * running on it, and there is still no way through here to change any of it.
 *
 * The distinction the seam exists to keep, unchanged since Phase 7:
 *
 *     "browser"                       is an application *identity*
 *     the slab in the Three.js scene  is its spatial *representation*
 *
 * Everything upstream of rendering — the command bus, the context graph, spatial
 * memory — already refers to windows by identity and never by scene object.
 * That is what makes a future native layer insertable rather than a rewrite:
 *
 *     NOVA UI
 *       ↓
 *     NOVA Command System        ← identities, relations, intent
 *       ↓
 *     Native System Adapter      ← this seam; no implementation exists
 *       ↓
 *     Operating System
 *
 * Phase 9 adds exactly **one** thing an adapter may do: open an approved
 * application. Everything else an adapter might eventually act on — focusing a
 * native window, moving one, closing one — remains deliberately absent, because
 * each needs its own safety argument and Wayland does not currently permit them
 * anyway. The capability set is declared, so what an adapter can do is always
 * enumerable rather than discovered by reading its methods.
 */

/**
 * An application NOVA can represent, independent of how it is drawn.
 *
 * Today every identity is a spatial stand-in. A native adapter would attach a
 * real handle without any of the layers above needing to know it had.
 */
export interface ApplicationIdentity {
  id: AppType;
  name: string;
  /** True once something real backs this identity. Always false in Phase 7. */
  native: boolean;
}

export interface SystemAdapter {
  readonly id: string;
  readonly available: boolean;
  /**
   * Everything this adapter is permitted to do, enumerated.
   *
   * An empty list is the honest description of a read-only adapter, and is what
   * lets a caller ask "may I?" without calling `perform` to find out.
   */
  readonly capabilities: readonly NativeCapability[];
  /** One line, for the developer inspector. */
  describe(): string;
  /**
   * Ask the host to do one thing.
   *
   * Always resolves — never throws and never rejects. A refusal is a structured
   * result, because the spatial environment must survive anything the operating
   * system does or declines to do.
   */
  perform(request: NativeActionRequest): Promise<NativeActionResult>;
  /**
   * The most recent reading of the host.
   *
   * A *getter*, not a query: reading this never touches the operating system.
   * Refreshing is explicit and lives in `useNativeAwareness`, so nothing can
   * accidentally perform native I/O from a render path by calling this.
   */
  snapshot(): NativeSnapshot;
}

/**
 * What NOVA runs on now: nothing. Stated plainly so the inspector can show it,
 * rather than leaving "no native integration" as an unwritten assumption.
 */
export const NO_SYSTEM_ADAPTER: SystemAdapter = {
  id: 'none',
  available: false,
  capabilities: [],
  describe: () => 'none — windows are spatial representations',
  snapshot: () => unavailableSnapshot('No system adapter is installed.'),
  perform: async (request) =>
    failedAction(
      request.capability,
      String(request.applicationId ?? ''),
      'NATIVE_PROVIDER_UNAVAILABLE',
      'No native provider is reachable.',
    ),
};

/**
 * The adapter NOVA uses when a local provider is reachable.
 *
 * It owns no state of its own: it reads the last snapshot the refresh loop
 * stored, so "what does the adapter know" and "what did we last see" cannot
 * drift apart. `available` is derived from that snapshot, which means the
 * adapter reports itself unavailable the moment the provider stops answering.
 */
export const BRIDGE_SYSTEM_ADAPTER: SystemAdapter = {
  id: 'local-bridge',
  get available() {
    return nativeState().snapshot.status === 'ok';
  },
  describe() {
    const snapshot = nativeState().snapshot;
    if (snapshot.status !== 'ok') return `unavailable — ${snapshot.notes[0] ?? 'not queried'}`;
    const platform = snapshot.osName ?? snapshot.platform;
    const session = [snapshot.desktopEnvironment, snapshot.sessionType]
      .filter(Boolean)
      .join('/');
    return session ? `${platform} · ${session} · read-only` : `${platform} · read-only`;
  },
  snapshot: () => nativeState().snapshot,

  /**
   * Launching is offered only on a host that reports itself Linux.
   *
   * Derived from the last reading rather than assumed, so an adapter attached
   * to a platform with no launcher says so instead of failing at the boundary.
   */
  get capabilities(): readonly NativeCapability[] {
    const snapshot = nativeState().snapshot;
    return snapshot.status === 'ok' && snapshot.platform === 'linux'
      ? (['OPEN_APPLICATION'] as const)
      : [];
  },

  async perform(request: NativeActionRequest): Promise<NativeActionResult> {
    if (!this.capabilities.includes(request.capability)) {
      return failedAction(
        request.capability,
        String(request.applicationId ?? ''),
        'CAPABILITY_UNAVAILABLE',
        'This host does not offer that capability.',
      );
    }
    return requestNativeAction(request);
  },
};

let adapter: SystemAdapter = NO_SYSTEM_ADAPTER;

export function getSystemAdapter(): SystemAdapter {
  return adapter;
}

/** The single seam a future native layer would be installed through. */
export function setSystemAdapter(next: SystemAdapter) {
  adapter = next;
}

/** Whether the installed adapter offers a capability right now. */
export function hasNativeCapability(capability: NativeCapability): boolean {
  const current = getSystemAdapter();
  return current.available && current.capabilities.includes(capability);
}

/**
 * NOVA's identity for an application, and whether anything real backs it.
 *
 * `native` is true only when the host actually reports a matching application
 * as installed — not merely when an adapter exists. A spatial window called
 * "Terminal" on a machine with no terminal installed is still a representation
 * of nothing, and should say so.
 */
export function identityOf(app: AppType): ApplicationIdentity {
  const current = getSystemAdapter();
  const backed =
    current.available &&
    current.snapshot().applications.some((application) => application.appType === app);
  return { id: app, name: APPS[app].name, native: backed };
}
