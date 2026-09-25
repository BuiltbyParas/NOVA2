import type {
  NativeApplication,
  NativeCapabilities,
  NativePlatform,
  NativeSessionType,
  NativeSnapshot,
  NativeWindow,
} from '../../types/native';
import { NO_CAPABILITIES, unavailableSnapshot } from '../../types/native';
import { resolveAppType } from './appIdentityMap';

/**
 * The boundary between NOVA and whatever is telling it about the computer.
 *
 * Two jobs, and deliberately only two: ask a local provider once, and **distrust
 * the answer**. Everything that arrives is unknown JSON from across a network
 * hop, so it is validated field by field and rebuilt into NOVA's own types.
 * Nothing is spread, nothing is cast, and a malformed reply becomes a structured
 * error rather than a plausible-looking snapshot.
 *
 * This is also where the platform's vocabulary becomes NOVA's: the provider
 * reports a desktop id and an executable name, and `resolveAppType` turns those
 * into an `AppType` — or into `unknown`, which is a real answer.
 *
 * The request is a parameterless `GET`. There is nothing for a caller to steer,
 * no path to supply and no command to name, so the endpoint cannot be used as a
 * file-read oracle or an execution channel.
 */

export const NATIVE_ENDPOINT = '/api/native/snapshot';

/**
 * Beyond this, the provider is treated as unavailable rather than waited on.
 *
 * Generous, because a cold reading scans a few hundred small files and may be
 * queued behind a development server compiling the application. Readings are
 * thirty seconds apart, so waiting a few extra seconds costs nothing — while
 * reporting "unavailable" when the host was merely busy would be a lie.
 */
const TIMEOUT_MS = 8_000;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asBoolean = (value: unknown): boolean => value === true;

function asPlatform(value: unknown): NativePlatform {
  const name = asString(value)?.toLowerCase();
  if (name === 'linux') return 'linux';
  if (name === 'darwin') return 'darwin';
  if (name === 'win32' || name === 'windows') return 'windows';
  return 'unknown';
}

function asSessionType(value: unknown): NativeSessionType {
  const name = asString(value)?.toLowerCase();
  if (name === 'wayland') return 'wayland';
  if (name === 'x11') return 'x11';
  if (name === 'tty') return 'tty';
  return 'unknown';
}

function asCapabilities(value: unknown): NativeCapabilities {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    platformDetection: asBoolean(raw.platformDetection),
    applicationEnumeration: asBoolean(raw.applicationEnumeration),
    runningProcessDetection: asBoolean(raw.runningProcessDetection),
    windowEnumeration: asBoolean(raw.windowEnumeration),
    windowGeometry: asBoolean(raw.windowGeometry),
    workspaceEnumeration: asBoolean(raw.workspaceEnumeration),
  };
}

function asApplications(value: unknown): NativeApplication[] {
  if (!Array.isArray(value)) return [];
  const applications: NativeApplication[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const nativeId = asString(raw.id) ?? asString(raw.nativeId);
    if (!nativeId) continue;

    const executable = asString(raw.exec) ?? asString(raw.executable);
    applications.push({
      nativeId,
      name: asString(raw.name) ?? nativeId,
      // NOVA's category is decided here, from stable identifiers only.
      appType: resolveAppType({ desktopId: nativeId, executable }),
      desktopId: nativeId,
      ...(executable ? { executable } : {}),
      running: asBoolean(raw.running),
    });
  }
  return applications;
}

function asWindows(value: unknown): NativeWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: NativeWindow[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const nativeId = asString(raw.id) ?? asString(raw.nativeId);
    const applicationId = asString(raw.applicationId);
    if (!nativeId || !applicationId) continue;

    const geometry = raw.geometry as Record<string, unknown> | undefined;
    const hasGeometry =
      geometry &&
      ['x', 'y', 'width', 'height'].every((key) => typeof geometry[key] === 'number');

    windows.push({
      nativeId,
      applicationId,
      title: asString(raw.title) ?? '',
      // Mapped from the owning application, never from the window title: a
      // title is whatever document is open, not what the application is.
      appType: resolveAppType({ desktopId: applicationId }),
      ...(typeof raw.visible === 'boolean' ? { visible: raw.visible } : {}),
      ...(typeof raw.minimized === 'boolean' ? { minimized: raw.minimized } : {}),
      ...(typeof raw.maximized === 'boolean' ? { maximized: raw.maximized } : {}),
      ...(hasGeometry
        ? {
            geometry: {
              x: geometry.x as number,
              y: geometry.y as number,
              width: geometry.width as number,
              height: geometry.height as number,
            },
          }
        : {}),
      ...(asString(raw.workspace) ? { workspace: asString(raw.workspace)! } : {}),
    });
  }
  return windows;
}

function asNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((note): note is string => Boolean(note)).slice(0, 12);
}

/**
 * Rebuild a provider's reply as a `NativeSnapshot`.
 *
 * Pure, so the whole validation surface can be tested against hostile input
 * without a server: missing fields, wrong types, nulls, arrays where objects
 * belong. A reply that carries nothing usable becomes an `error` snapshot, and
 * never an empty `ok` one — "no windows" and "could not look" must not be
 * reported the same way.
 */
export function normalizeProviderReport(raw: unknown, at: number): NativeSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...unavailableSnapshot('The native provider returned something unreadable.', at),
      status: 'error',
      error: 'malformed provider response',
    };
  }

  const report = raw as Record<string, unknown>;
  const capabilities = asCapabilities(report.capabilities);
  const platform = asPlatform(report.platform);

  // A reply with no platform and no capability is not a reading of anything.
  if (platform === 'unknown' && !Object.values(capabilities).some(Boolean)) {
    return {
      ...unavailableSnapshot('The native provider reported no usable information.', at),
      status: 'error',
      error: 'provider reported nothing',
      notes: asNotes(report.notes).length
        ? asNotes(report.notes)
        : ['The native provider reported no usable information.'],
      capabilities: { ...NO_CAPABILITIES },
    };
  }

  return {
    status: 'ok',
    at,
    platform,
    ...(asString(report.osName) ? { osName: asString(report.osName)! } : {}),
    ...(asString(report.osVersion) ? { osVersion: asString(report.osVersion)! } : {}),
    ...(asString(report.desktopEnvironment)
      ? { desktopEnvironment: asString(report.desktopEnvironment)! }
      : {}),
    sessionType: asSessionType(report.sessionType),
    capabilities,
    applications: capabilities.applicationEnumeration ? asApplications(report.applications) : [],
    // Windows are only accepted when the provider says it can enumerate them.
    // Otherwise an empty list would read as "no windows are open", which is a
    // different claim from "this host will not tell us".
    windows: capabilities.windowEnumeration ? asWindows(report.windows) : [],
    notes: asNotes(report.notes),
  };
}

/**
 * Ask the local provider for one reading.
 *
 * Never throws and never leaves NOVA waiting: no provider, a slow provider, a
 * 404 from plain `vite`, or a reply that is not JSON all resolve to a snapshot
 * that says so. Native awareness is an enhancement — the spatial environment
 * must not depend on it in any way.
 */
export async function fetchNativeSnapshot(at: number = Date.now()): Promise<NativeSnapshot> {
  if (typeof fetch !== 'function') {
    return unavailableSnapshot('No network transport is available in this environment.', at);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(NATIVE_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (response.status === 404) {
      return unavailableSnapshot(
        'No native provider is running. NOVA is a browser application here; start it with ' +
          '`npx tsx server.ts` for native awareness.',
        at,
      );
    }
    if (!response.ok) {
      return {
        ...unavailableSnapshot(`The native provider answered with ${response.status}.`, at),
        status: 'error',
        error: `HTTP ${response.status}`,
      };
    }

    return normalizeProviderReport(await response.json(), at);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return unavailableSnapshot(
      aborted
        ? 'The native provider did not answer in time.'
        : 'No native provider is reachable.',
      at,
    );
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
