import type { NativeSnapshot } from '../../types/native';
import { NO_CAPABILITIES, unavailableSnapshot } from '../../types/native';
import { WORKSPACES } from '../../data/workspaces';
import { APPS } from '../../data/apps';
import type { AppType, SpatialWindow } from '../../types/window';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { buildContextGraph, type ContextSnapshot } from '../context/contextGraph';
import * as engine from '../context/contextEngine';
import { captureMemorySnapshot } from '../memory/memorySerializer';
import { appTypeForIdentifier, appTypeForProcess, resolveAppType } from './appIdentityMap';
import { normalizeProviderReport } from './nativeBridge';
import { useNativeStore } from './nativeStore';
import {
  BRIDGE_SYSTEM_ADAPTER,
  NO_SYSTEM_ADAPTER,
  getSystemAdapter,
  identityOf,
  setSystemAdapter,
} from './systemAdapter';

/**
 * Phase 8 verification.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the identity mapping, the bridge's validation, the adapter, the context
 *       integration, and the separation between native and spatial state.
 * MOCK: the *provider's reply*. These tests feed the bridge JSON directly —
 *       including malformed and hostile JSON — rather than standing up a
 *       server. The real Linux provider is verified separately against this
 *       actual machine, and its findings are reported as findings, not as
 *       assertions that would pass on any host.
 *
 * Nothing here fabricates native data and calls it real.
 */

let failures = 0;
let checks = 0;

function assert(condition: boolean, message: string) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

const pass = (message: string) => console.log(`✓ ${message}`);

console.log('\n=== NOVA Phase 8 · Native System Adapter (read-only) ===\n');

// --- a mock provider reply, in the shape the real one produces --------------

const mockReport = (overrides: Record<string, unknown> = {}) => ({
  providerId: 'linux',
  at: 1000,
  platform: 'linux',
  osName: 'Fedora Linux',
  osVersion: '44',
  desktopEnvironment: 'GNOME',
  sessionType: 'wayland',
  capabilities: {
    platformDetection: true,
    applicationEnumeration: true,
    runningProcessDetection: true,
    windowEnumeration: false,
    windowGeometry: false,
    workspaceEnumeration: false,
  },
  applications: [
    { id: 'com.brave.Browser', name: 'Brave', exec: undefined, running: true },
    { id: 'org.gnome.Ptyxis', name: 'Terminal', exec: 'ptyxis', running: true },
    { id: 'com.visualstudio.code', name: 'VS Code', exec: 'code', running: false },
    { id: 'org.gnome.Nautilus', name: 'Files', exec: 'nautilus', running: false },
    { id: 'com.spotify.Client', name: 'Spotify', exec: 'spotify', running: false },
  ],
  windows: [],
  notes: ['Native window enumeration is unavailable under Wayland.'],
  ...overrides,
});

// --- 1. the snapshot schema --------------------------------------------------

console.log('--- Snapshot schema ---');
{
  const snapshot = normalizeProviderReport(mockReport(), 2000);

  assert(snapshot.status === 'ok', 'a well-formed reply produces an "ok" snapshot');
  assert(snapshot.at === 2000, 'stamped with when NOVA read it, not when the provider wrote it');
  assert(snapshot.platform === 'linux', 'the platform is normalised');
  assert(snapshot.sessionType === 'wayland', 'and the session type');
  assert(snapshot.osName === 'Fedora Linux' && snapshot.osVersion === '44', 'the distribution is carried through');
  assert(Array.isArray(snapshot.applications), 'applications is always an array');
  assert(Array.isArray(snapshot.windows), 'so is windows');
  assert(Array.isArray(snapshot.notes), 'and notes');

  // The whole snapshot must survive a round trip: it is context, and context
  // gets serialised, logged and inspected.
  const round = JSON.parse(JSON.stringify(snapshot)) as NativeSnapshot;
  assert(round.applications.length === snapshot.applications.length, 'the snapshot is serializable');
  assert(!/function|undefined/.test(JSON.stringify(snapshot)), 'and holds no functions');
  pass('A provider reply becomes a normalised, serializable NativeSnapshot');
}

// --- 2. unavailable provider -------------------------------------------------

console.log('--- Unavailable provider ---');
{
  const none = unavailableSnapshot('No native provider is reachable.', 5);
  assert(none.status === 'unavailable', 'an absent provider is "unavailable", not "error"');
  assert(Object.values(none.capabilities).every((allowed) => allowed === false), 'every capability is false');
  assert(none.applications.length === 0 && none.windows.length === 0, 'and nothing is claimed');
  assert(none.notes.length === 1, 'with a reason a person can read');
  assert(none.platform === 'unknown', 'the platform is not guessed');
  pass('With no provider, NOVA reports unavailable rather than empty');
}

// --- 3, 11. malformed and hostile replies ------------------------------------

console.log('--- Provider failure ---');
{
  for (const junk of [null, undefined, 'a string', 42, [], true]) {
    const snapshot = normalizeProviderReport(junk, 1);
    assert(snapshot.status === 'error', `${JSON.stringify(junk)} is rejected as an error`);
    assert(snapshot.applications.length === 0, 'and produces no applications');
    assert(Boolean(snapshot.error), 'with an error recorded');
  }

  // A reply that parses but says nothing is not a reading of anything.
  const empty = normalizeProviderReport({ applications: [], windows: [] }, 1);
  assert(empty.status === 'error', 'a reply with no platform and no capability is an error');

  // Wrong types in the right fields must not leak through.
  const wrong = normalizeProviderReport(
    mockReport({
      applications: [{ id: 42 }, null, 'nonsense', { name: 'no id' }, { id: 'ok.app', name: 7 }],
      notes: [1, 2, { note: 'x' }],
      capabilities: { applicationEnumeration: 'yes', windowEnumeration: 1 },
    }),
    1,
  );
  assert(wrong.status === 'ok', 'a reply with some bad fields still yields what is good');
  assert(
    wrong.capabilities.applicationEnumeration === false,
    'a non-boolean capability is false, never truthy-coerced',
  );
  assert(wrong.capabilities.windowEnumeration === false, 'and `1` is not true');
  assert(wrong.applications.length === 0, 'applications are dropped when the capability is off');
  assert(wrong.notes.length === 0, 'non-string notes are discarded');
  pass('Malformed, hostile and partially-wrong replies are rejected field by field');
}

// --- 4. platform detection ---------------------------------------------------

console.log('--- Platform detection ---');
{
  assert(normalizeProviderReport(mockReport({ platform: 'linux' }), 1).platform === 'linux', 'linux');
  assert(normalizeProviderReport(mockReport({ platform: 'darwin' }), 1).platform === 'darwin', 'darwin');
  assert(normalizeProviderReport(mockReport({ platform: 'win32' }), 1).platform === 'windows', 'win32 → windows');
  assert(normalizeProviderReport(mockReport({ platform: 'plan9' }), 1).platform === 'unknown', 'anything else is unknown');

  assert(normalizeProviderReport(mockReport({ sessionType: 'wayland' }), 1).sessionType === 'wayland', 'wayland');
  assert(normalizeProviderReport(mockReport({ sessionType: 'x11' }), 1).sessionType === 'x11', 'x11');
  assert(normalizeProviderReport(mockReport({ sessionType: 'quantum' }), 1).sessionType === 'unknown', 'and unknown sessions are unknown');
  pass('Platform and session type are normalised, never guessed');
}

// --- 5, 6, 7. identity mapping ----------------------------------------------

console.log('--- Application identity ---');
{
  // Several native applications legitimately map to one NOVA category.
  for (const id of ['firefox', 'com.brave.Browser', 'google-chrome', 'org.gnome.Epiphany']) {
    assert(appTypeForIdentifier(id) === 'browser', `${id} → browser`);
  }
  for (const id of ['code', 'com.visualstudio.code', 'dev.zed.Zed']) {
    assert(appTypeForIdentifier(id) === 'code', `${id} → code`);
  }
  for (const id of ['org.gnome.Terminal', 'org.gnome.Ptyxis', 'alacritty', 'kitty']) {
    assert(appTypeForIdentifier(id) === 'terminal', `${id} → terminal`);
  }
  assert(appTypeForIdentifier('org.gnome.Nautilus') === 'files', 'nautilus → files');
  assert(appTypeForIdentifier('org.gnome.TextEditor') === 'notes', 'text editor → notes');
  assert(appTypeForIdentifier('firefox.desktop') === 'browser', 'the .desktop suffix is tolerated');
  assert(appTypeForIdentifier('FIREFOX') === 'browser', 'and case');

  // §7 — an unmapped application stays unmapped.
  for (const id of ['com.spotify.Client', 'org.videolan.VLC', 'some.unknown.Thing', '']) {
    assert(appTypeForIdentifier(id) === 'unknown', `${id || '(empty)'} → unknown, not a guess`);
  }

  // Process names, including the kernel's 15-character truncation.
  assert(appTypeForProcess('brave') === 'browser', 'a process name maps');
  assert(appTypeForProcess('gnome-terminal-') === 'terminal', 'a truncated process name maps');
  assert(appTypeForProcess('mysteryd') === 'unknown', 'an unknown process is unknown');

  // Precedence: the stable desktop id outranks a process name.
  assert(
    resolveAppType({ desktopId: 'com.brave.Browser', processName: 'code' }) === 'browser',
    'the desktop id wins over a process name',
  );
  assert(
    resolveAppType({ processName: 'nautilus' }) === 'files',
    'a process name is used when nothing better exists',
  );
  assert(resolveAppType({}) === 'unknown', 'with no identifiers at all, unknown');

  // Mapping must never key on a window title.
  assert(appTypeForIdentifier('main.ts') === 'unknown', 'a document name is not an application');
  assert(appTypeForIdentifier('Inbox — Mail') === 'unknown', 'nor is a window title');
  pass('Identity maps from stable identifiers only, and refuses to guess');

  const snapshot = normalizeProviderReport(mockReport(), 1);
  const brave = snapshot.applications.find((a) => a.nativeId === 'com.brave.Browser')!;
  assert(brave.appType === 'browser', 'a real entry gets its NOVA category');
  assert(brave.name === 'Brave', 'while keeping its own name');
  assert(brave.nativeId === 'com.brave.Browser', 'and its native identity');
  const spotify = snapshot.applications.find((a) => a.nativeId === 'com.spotify.Client')!;
  assert(spotify.appType === 'unknown', 'an uncategorised application is kept, marked unknown');
  assert(spotify.name === 'Spotify', 'and is not discarded');
  pass('Native identity is preserved alongside NOVA’s lossy category');
}

// --- 8, 9. window normalisation ---------------------------------------------

console.log('--- Window normalisation ---');
{
  // Windows are only accepted when the provider claims it can enumerate them.
  const claimed = normalizeProviderReport(
    mockReport({
      capabilities: { ...mockReport().capabilities, windowEnumeration: true },
      windows: [
        {
          id: 'w1',
          applicationId: 'com.brave.Browser',
          title: 'NOVA — spatial computing',
          minimized: false,
          geometry: { x: 10, y: 20, width: 1280, height: 800 },
          workspace: '1',
        },
        { id: 'w2', applicationId: 'org.gnome.Ptyxis', title: 'zsh' },
        { title: 'no id at all' },
      ],
    }),
    1,
  );
  assert(claimed.windows.length === 2, `malformed windows are dropped, got ${claimed.windows.length}`);

  const [first, second] = claimed.windows;
  assert(first.appType === 'browser', 'a window inherits its application’s category');
  assert(first.geometry?.width === 1280, 'geometry is carried when supplied');
  assert(first.workspace === '1', 'and native workspace');
  assert(second.geometry === undefined, 'and omitted entirely when not');
  assert(second.minimized === undefined, 'optional state is absent, never defaulted to false');
  assert(!('nativeHandle' in first), 'no platform-specific handle leaks into NOVA');

  // The default: this host cannot enumerate windows, so it reports none.
  const wayland = normalizeProviderReport(mockReport({ windows: [{ id: 'x', applicationId: 'y' }] }), 1);
  assert(
    wayland.windows.length === 0,
    'windows are ignored when the provider says it cannot enumerate them',
  );
  assert(
    wayland.capabilities.windowEnumeration === false && wayland.notes.length > 0,
    'and the reason is reported rather than left as an empty list',
  );
  pass('Windows are normalised, optional fields stay optional, and "cannot" ≠ "none"');
}

// --- 10. capability reporting ------------------------------------------------

console.log('--- Capabilities ---');
{
  const snapshot = normalizeProviderReport(mockReport(), 1);
  assert(snapshot.capabilities.platformDetection === true, 'what works is reported true');
  assert(snapshot.capabilities.windowEnumeration === false, 'what does not is reported false');
  assert(snapshot.capabilities.windowGeometry === false, 'geometry follows window enumeration');
  assert(snapshot.capabilities.workspaceEnumeration === false, 'as does workspace enumeration');
  assert(
    Object.keys(snapshot.capabilities).length === Object.keys(NO_CAPABILITIES).length,
    'every capability is always present, never omitted',
  );

  const missing = normalizeProviderReport(mockReport({ capabilities: undefined }), 1);
  assert(
    Object.values(missing.capabilities).every((allowed) => allowed === false),
    'a reply with no capabilities block claims nothing',
  );
  pass('Capabilities are explicit, complete, and false until proven');
}

// --- the adapter -------------------------------------------------------------

console.log('--- System adapter ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  assert(getSystemAdapter().available === false, 'with no adapter, nothing is available');
  assert(getSystemAdapter().snapshot().status === 'unavailable', 'and the snapshot says so');
  assert(identityOf('browser').native === false, 'no identity is backed by anything real');

  useNativeStore.getState().setSnapshot(normalizeProviderReport(mockReport(), 1));
  setSystemAdapter(BRIDGE_SYSTEM_ADAPTER);
  assert(getSystemAdapter().available === true, 'with a reading, the adapter is available');
  assert(/Fedora/.test(getSystemAdapter().describe()), `and describes the host: "${getSystemAdapter().describe()}"`);
  assert(/read-only/.test(getSystemAdapter().describe()), 'stating plainly that it is read-only');
  assert(identityOf('browser').native === true, 'an identity the host actually has is backed');
  assert(identityOf('notes').native === false, 'one it does not have is not');

  // §6, §7 — the adapter must expose no way to act.
  const surface = Object.keys(BRIDGE_SYSTEM_ADAPTER).concat(
    Object.getOwnPropertyNames(Object.getPrototypeOf(BRIDGE_SYSTEM_ADAPTER) ?? {}),
  );
  // Phase 9 added one capability, reachable only through `perform` and only
  // when `capabilities` lists it. None of these may ever exist as a method.
  for (const forbidden of [
    'launch', 'open', 'close', 'kill', 'focus', 'move', 'resize', 'minimize',
    'maximize', 'exec', 'run', 'shell', 'command', 'execute', 'write', 'send',
  ]) {
    assert(!surface.includes(forbidden), `the adapter has no "${forbidden}"`);
    assert(!(forbidden in BRIDGE_SYSTEM_ADAPTER), `and no "${forbidden}" anywhere on it`);
  }
  assert(
    Object.keys(BRIDGE_SYSTEM_ADAPTER).sort().join(',') ===
      'available,capabilities,describe,id,perform,snapshot',
    `the adapter surface is fixed, got ${Object.keys(BRIDGE_SYSTEM_ADAPTER).sort().join(',')}`,
  );
  pass('The adapter can be read and cannot be used to act');

  // A provider that stops answering must make NOVA unaware again, not stale.
  useNativeStore.getState().setSnapshot(unavailableSnapshot('provider went away', 2));
  assert(BRIDGE_SYSTEM_ADAPTER.available === false, 'availability follows the latest reading');
  pass('Losing the provider makes NOVA report itself unaware rather than stale');
}

// --- 12, 13. context integration and separation ------------------------------

console.log('--- Context integration ---');
{
  const apps: AppType[] = ['browser', 'code', 'terminal', 'notes', 'files'];
  const windows: SpatialWindow[] = apps.map((app) => {
    const placement = WORKSPACES.development.placements[app];
    return {
      id: app,
      app,
      title: APPS[app].title,
      position: { ...placement.position },
      rotation: { ...placement.rotation },
      scale: placement.scale,
      width: APPS[app].width,
      height: APPS[app].height,
      focused: app === 'code',
      minimized: false,
      lifecycle: 'settled',
      lifecycleAt: 0,
    };
  });

  const native = normalizeProviderReport(
    mockReport({
      capabilities: { ...mockReport().capabilities, windowEnumeration: true },
      windows: [
        {
          id: 'native-1',
          applicationId: 'com.brave.Browser',
          title: 'anything',
          geometry: { x: 4444, y: 5555, width: 1920, height: 1080 },
        },
      ],
    }),
    1,
  );

  const snapshot: ContextSnapshot = {
    windows,
    order: apps,
    focusedId: 'code',
    workspace: 'development',
    activeTaskId: 'nova-build',
    interactions: {},
    native,
    at: 1000,
  };
  const graph = buildContextGraph(snapshot);

  assert(graph.native.status === 'ok', 'the context graph carries the native reading');
  assert(graph.native.applications.length === 5, 'including the applications');
  assert(graph.native.windows.length === 1, 'and native windows');
  assert(graph.windows.length === 5, 'while spatial windows are untouched');

  // §13 — THE critical property. Native and spatial must not contaminate.
  const spatialBrowser = graph.byId.browser;
  const nativeWindow = graph.native.windows[0];
  assert(
    spatialBrowser.position.x === WORKSPACES.development.placements.browser.position.x,
    'a spatial position is the workspace layout’s, never the native geometry',
  );
  assert(
    spatialBrowser.position.x !== nativeWindow.geometry!.x,
    'native geometry did not leak into a spatial coordinate',
  );
  assert(!('geometry' in spatialBrowser), 'a spatial window has no native geometry field');
  assert(!('nativeId' in spatialBrowser), 'and no native id');
  assert(
    !graph.windows.some((win) => win.id === 'native-1'),
    'a native window is never merged into the spatial window list',
  );
  assert(graph.byId['native-1'] === undefined, 'nor addressable as one');

  // A graph built without native information must behave identically.
  const bare = buildContextGraph({ ...snapshot, native: undefined });
  assert(bare.native.status === 'unavailable', 'a graph with no native reading says so');
  assert(bare.windows.length === graph.windows.length, 'and is otherwise identical');
  assert(
    JSON.stringify(bare.byId.browser) === JSON.stringify(graph.byId.browser),
    'native awareness changes nothing about a spatial window',
  );
  pass('Native state rides alongside spatial state and never becomes it');

  // Phase 5 must not persist native state into a memory.
  const memory = captureMemorySnapshot(graph);
  const serialised = JSON.stringify(memory);
  assert(!/nativeId|com\.brave|Fedora|wayland/i.test(serialised), 'a saved memory holds no native state');
  assert(memory.windows.length === 5, 'only the spatial arrangement is remembered');
  pass('Spatial Memory remembers arrangements, not the computer they were on');
}

// --- 14, 15. no render-loop I/O, and graceful absence ------------------------

console.log('--- Refresh model and graceful absence ---');
{
  // The adapter's snapshot() is a getter over stored state: calling it a
  // thousand times must be free, which is what makes it safe to read from
  // anywhere. Native I/O lives only in the refresh path.
  useNativeStore.getState().setSnapshot(normalizeProviderReport(mockReport(), 1));
  setSystemAdapter(BRIDGE_SYSTEM_ADAPTER);

  let fetches = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetches += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  for (let i = 0; i < 1000; i += 1) getSystemAdapter().snapshot();
  assert(fetches === 0, 'reading the adapter performs no I/O at all');

  // And the context engine's snapshot — taken on every graph rebuild — must
  // likewise never reach the host.
  const stop = engine.startContextEngine();
  for (let i = 0; i < 50; i += 1) {
    engine.resetContextEngine();
    engine.getCurrentContext();
  }
  assert(fetches === 0, 'building the context graph performs no native I/O');
  globalThis.fetch = realFetch;

  // §15 — with native awareness gone, everything else keeps working.
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  useNativeStore.getState().setSnapshot(unavailableSnapshot('provider unavailable', 0));

  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');
  assert(useSpatialStore.getState().focusedId === 'code', 'the command bus still works');
  assert(engine.getCurrentContext().workspace.id === 'development', 'the context engine still works');
  assert(engine.getCurrentContext().native.status === 'unavailable', 'and reports native as unavailable');
  assert(engine.resolveReference('this').status === 'resolved', 'reference resolution still works');
  dispatch({ action: 'scale', target: 'code', scale: 1.2 }, 'system');
  assert(engine.getWindowContext('code')!.scale === 1.2, 'and spatial state still changes');
  stop();
  pass('Native I/O never happens on a read path, and its absence breaks nothing');
}

// --- the Phase 8 boundary ----------------------------------------------------

console.log('--- Read-only boundary ---');
{
  const snapshot = normalizeProviderReport(mockReport(), 1);

  // Nothing in a snapshot may be callable. It is data about the world, not a
  // handle on it.
  const values = [snapshot, ...snapshot.applications, ...snapshot.windows];
  for (const value of values) {
    const callable = Object.entries(value).filter(([, v]) => typeof v === 'function');
    assert(callable.length === 0, 'nothing in a native snapshot is callable');
  }

  assert(
    !('pid' in (snapshot.applications[0] as object)),
    'no process id is exposed — nothing to signal or kill',
  );
  assert(
    !JSON.stringify(snapshot).includes('/proc/'),
    'no raw system paths are carried into NOVA',
  );
  assert(
    !/cmdline|argv|--/.test(JSON.stringify(snapshot)),
    'no command lines or arguments are exposed',
  );
  pass('A native snapshot is data about the computer, never a handle on it');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} native assertions FAILED`);
}
console.log(`ALL ${checks} NATIVE ASSERTIONS PASSED! 🎉`);
console.log('========================================');
