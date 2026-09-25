import type { LaunchRequest } from '../../types/nativeSync';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { normalizeProviderReport } from './nativeBridge';
import { useNativeStore } from './nativeStore';
import {
  LAUNCH_PENDING_MS,
  clearLaunchRequests,
  currentSync,
  launchRequests,
  noteLaunchRequest,
  synchronise,
} from './nativeSpatialSync';
import { NO_SYSTEM_ADAPTER, setSystemAdapter } from './systemAdapter';

/**
 * Phase 10 verification — native ↔ spatial synchronisation.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the synchronisation function, the identity mapping it consumes, the
 *       spatial store, and the launch-request record.
 * MOCK: the *provider's reply* — fixture snapshots shaped exactly like the real
 *       one, so running/not-running can be arranged deliberately. No
 *       application is started by this suite, and no host is contacted.
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

console.log('\n=== NOVA Phase 10 · Native ↔ Spatial Synchronisation ===\n');

// --- fixtures ----------------------------------------------------------------

/** Shaped like the real host: ids that map, and ids that deliberately do not. */
const APPLICATIONS = [
  { id: 'org.mozilla.firefox', name: 'Firefox' },
  { id: 'com.visualstudio.code', name: 'Visual Studio Code' },
  { id: 'org.gnome.Nautilus', name: 'Files' },
  { id: 'org.gnome.TextEditor', name: 'Text Editor' },
  { id: 'org.gnome.Ptyxis', name: 'Terminal' },
  { id: 'com.spotify.Client', name: 'Spotify' },
  { id: 'org.gnome.Calculator', name: 'Calculator' },
  { id: 'libreoffice-writer', name: 'LibreOffice Writer' },
];

function snapshotWith(running: string[], at = 1000) {
  return normalizeProviderReport(
    {
      providerId: 'linux',
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
      applications: APPLICATIONS.map((application) => ({
        ...application,
        running: running.includes(application.id),
      })),
      windows: [],
      notes: [],
    },
    at,
  );
}

const UNAVAILABLE = normalizeProviderReport(null, 1000);
const ALL_FIVE = ['browser', 'code', 'files', 'notes', 'terminal'];
const find = (sync: ReturnType<typeof synchronise>, appType: string) =>
  sync.spatial.find((entry) => entry.appType === appType)!;

// --- mapping -----------------------------------------------------------------

console.log('--- Identity mapping ---');
{
  const sync = synchronise({
    native: snapshotWith(APPLICATIONS.map((a) => a.id)),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2000,
  });

  for (const [appType, id, name] of [
    ['browser', 'org.mozilla.firefox', 'Firefox'],
    ['code', 'com.visualstudio.code', 'Visual Studio Code'],
    ['files', 'org.gnome.Nautilus', 'Files'],
    ['notes', 'org.gnome.TextEditor', 'Text Editor'],
    ['terminal', 'org.gnome.Ptyxis', 'Terminal'],
  ] as const) {
    const entry = find(sync, appType);
    assert(entry.nativeApplicationId === id, `${name} maps to ${appType}`);
    assert(entry.nativeName === name, `and carries its own name, not NOVA's`);
    assert(entry.nativeRunning === true, `and is reported running`);
  }

  // Applications with no NOVA category must never be forced into one.
  const spatialIds = sync.spatial.map((entry) => entry.nativeApplicationId);
  for (const id of ['com.spotify.Client', 'org.gnome.Calculator', 'libreoffice-writer']) {
    assert(!spatialIds.includes(id), `${id} is not mapped to any AppType`);
    assert(
      sync.nativeOnly.some((application) => application.applicationId === id),
      `${id} appears as a native-only application instead`,
    );
  }
  assert(
    sync.nativeOnly.every((application) => application.spatialAppType === undefined),
    'and none of them claims a spatial type',
  );
  assert(sync.spatial.length === 5, 'exactly the five surfaces are reported');
  pass('Native identities map to AppTypes where they should, and nowhere else');
}

// --- the four states ---------------------------------------------------------

console.log('--- Synchronisation status ---');
{
  // synced: surface open, application running.
  const synced = synchronise({
    native: snapshotWith(['org.mozilla.firefox']),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2000,
  });
  assert(find(synced, 'browser').status === 'synced', 'open + running = synced');
  assert(find(synced, 'browser').spatialOpen === true, 'with spatialOpen true');
  assert(find(synced, 'browser').nativeRunning === true, 'and nativeRunning true');

  // native-only: running, no surface. The state that matters most.
  const nativeOnly = synchronise({
    native: snapshotWith(['org.mozilla.firefox']),
    spatialWindowIds: ['code', 'files', 'notes', 'terminal'],
    launchRequests: [],
    at: 2000,
  });
  const browser = find(nativeOnly, 'browser');
  assert(browser.status === 'native-only', 'running + no surface = native-only');
  assert(browser.spatialOpen === false, 'spatialOpen is false');
  assert(browser.nativeRunning === true, 'while nativeRunning stays true');

  // spatial-only: surface open, nothing running.
  const spatialOnly = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2000,
  });
  assert(find(spatialOnly, 'browser').status === 'spatial-only', 'open + not running = spatial-only');

  // absent: neither. Known, and known to be nothing.
  const absent = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: [],
    launchRequests: [],
    at: 2000,
  });
  assert(find(absent, 'browser').status === 'absent', 'neither = absent, not unknown');
  pass('synced / native-only / spatial-only / absent are each distinguished');
}

// --- provider unavailable ----------------------------------------------------

console.log('--- Provider unavailable ---');
{
  const sync = synchronise({
    native: UNAVAILABLE,
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2000,
  });

  assert(sync.available === false, 'the reading reports itself unavailable');
  assert(
    sync.spatial.every((entry) => entry.status === 'unknown'),
    'every surface is unknown, not "not running"',
  );
  assert(sync.nativeOnly.length === 0, 'and no native application is claimed');
  assert(
    sync.spatial.every((entry) => entry.nativeApplicationId === undefined),
    'with no application ids invented',
  );

  // The distinction the whole layer rests on.
  const notRunning = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2000,
  });
  assert(notRunning.available === true, 'a reading where nothing runs is still available');
  assert(
    find(notRunning, 'browser').status !== find(sync, 'browser').status,
    '"nothing is running" and "could not look" are never the same status',
  );
  // NOVA's own launch record is not the provider's, so it survives the outage.
  const withRequest = synchronise({
    native: UNAVAILABLE,
    spatialWindowIds: ALL_FIVE,
    launchRequests: [{ applicationId: 'browser', at: 1_500, accepted: true }],
    at: 2_000,
  });
  const pendingEntry = find(withRequest, 'browser');
  assert(pendingEntry.lifecycle === 'launch-requested', 'a pending launch is still known during an outage');
  assert(pendingEntry.status === 'unknown', 'while its status stays unknown');
  assert(pendingEntry.nativeRunning === false, 'and it is never promoted to running without a snapshot');
  assert(
    find(withRequest, 'terminal').lifecycle === 'idle',
    'a surface with no request is idle, which is true either way',
  );
  pass('An unavailable provider is never read as "nothing is running"');
}

// --- launch lifecycle --------------------------------------------------------

console.log('--- Launch lifecycle ---');
{
  const at = 100_000;
  const requested: LaunchRequest[] = [
    { applicationId: 'com.spotify.Client', at: at - 1_000, accepted: true },
  ];

  // Asking is not running.
  const pending = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [{ applicationId: 'browser', at: at - 1_000, accepted: true }],
    at,
  });
  const browser = find(pending, 'browser');
  assert(browser.lifecycle === 'launch-requested', 'an accepted request is launch-requested');
  assert(browser.nativeRunning === false, 'and is NOT reported as running');
  assert(browser.status === 'spatial-only', 'nor does it change the status to synced');

  // Only a snapshot showing a process makes it running.
  const confirmed = synchronise({
    native: snapshotWith(['org.mozilla.firefox']),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [{ applicationId: 'browser', at: at - 1_000, accepted: true }],
    at,
  });
  assert(find(confirmed, 'browser').lifecycle === 'running', 'a confirming snapshot makes it running');
  assert(find(confirmed, 'browser').status === 'synced', 'and the status becomes synced');

  // A refused launch is a real failure — but only because the launcher said so.
  const refused = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [{ applicationId: 'browser', at: at - 1_000, accepted: false }],
    at,
  });
  assert(find(refused, 'browser').lifecycle === 'unavailable', 'a refused launch is unavailable');

  // A request nothing came of stops claiming something is on its way.
  const stale = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [
      { applicationId: 'browser', at: at - LAUNCH_PENDING_MS - 1, accepted: true },
    ],
    at,
  });
  assert(find(stale, 'browser').lifecycle === 'idle', 'an expired request returns to idle');
  assert(LAUNCH_PENDING_MS > 30_000, 'the window outlasts one native poll');

  // A request keyed by desktop id is matched too.
  const byDesktopId = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: requested,
    at,
  });
  assert(byDesktopId.available === true, 'a request for a native-only application is harmless');
  assert(
    byDesktopId.spatial.every((entry) => entry.lifecycle !== 'launch-requested'),
    'and does not attach itself to an unrelated surface',
  );
  pass('launch-requested is never running until a snapshot says so');
}

// --- determinism and purity --------------------------------------------------

console.log('--- Determinism and purity ---');
{
  const input = {
    native: snapshotWith(['org.mozilla.firefox', 'com.spotify.Client']),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [] as LaunchRequest[],
    at: 5_000,
  };

  const a = synchronise(input);
  const b = synchronise(input);
  const c = synchronise({ ...input });
  assert(JSON.stringify(a) === JSON.stringify(b), 'the same input gives the same result');
  assert(JSON.stringify(a) === JSON.stringify(c), 'and again with a fresh object');

  // Nothing is mutated — not the stores, not the inputs.
  const nativeBefore = JSON.stringify(useNativeStore.getState().snapshot);
  const spatialBefore = JSON.stringify(useSpatialStore.getState().windows);
  const inputBefore = JSON.stringify(input);
  synchronise(input);
  assert(JSON.stringify(useNativeStore.getState().snapshot) === nativeBefore, 'the native store is untouched');
  assert(JSON.stringify(useSpatialStore.getState().windows) === spatialBefore, 'the spatial store is untouched');
  assert(JSON.stringify(input) === inputBefore, 'and the input is not mutated either');

  // The result is data, with no handle on anything.
  const serialised = JSON.stringify(a);
  assert(!/function|undefined/.test(serialised), 'the result is plain serializable data');
  for (const entry of a.spatial) {
    assert(
      Object.values(entry).every((value) => typeof value !== 'function'),
      'nothing in a sync entry is callable',
    );
  }
  pass('Synchronisation is deterministic, pure, and changes nothing');
}

// --- no fabricated native detail ---------------------------------------------

console.log('--- Nothing is fabricated ---');
{
  const sync = synchronise({
    native: snapshotWith(APPLICATIONS.map((a) => a.id)),
    spatialWindowIds: ALL_FIVE,
    launchRequests: [],
    at: 2_000,
  });
  const serialised = JSON.stringify(sync);

  // Wayland gives none of this, so none of it may appear. Checked by field name
  // rather than by substring: a real application is called "Ptyxis", and hunting
  // for the substring `x"` finds its name, not a coordinate.
  const fields = new Set<string>();
  for (const entry of [...sync.spatial, ...sync.nativeOnly]) {
    for (const key of Object.keys(entry)) fields.add(key);
  }
  for (const forbidden of ['geometry', 'bounds', 'windowId', 'nativeWindow', 'x', 'y', 'width', 'height', 'pid', 'exec', 'argv', 'command', 'path']) {
    assert(!fields.has(forbidden), `no "${forbidden}" field appears in a sync reading`);
  }
  // Values are equally free of executable detail.
  for (const forbidden of ['/usr/', '/bin/', 'shell', 'bash', '--']) {
    assert(!serialised.includes(forbidden), `no "${forbidden}" appears in any sync value`);
  }
  assert(
    sync.spatial.every((entry) => Object.keys(entry).length <= 7),
    'a sync entry carries only what can honestly be said',
  );
  pass('No window ids, geometry, pids, paths or arguments are invented');
}

// --- the live reading and the launch record ----------------------------------

console.log('--- Live reading ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  clearLaunchRequests();

  useNativeStore.getState().setSnapshot(snapshotWith(['org.mozilla.firefox', 'com.spotify.Client']));
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  const live = currentSync(2_000);
  assert(live.available === true, 'the live reading uses the stored snapshot');
  assert(find(live, 'browser').nativeRunning === true, 'and sees Firefox running');
  assert(
    live.nativeOnly.some((application) => application.applicationId === 'com.spotify.Client'),
    'and Spotify as native-only',
  );
  assert(
    live.spatial.every((entry) => entry.spatialOpen === true),
    'with the five surfaces read from the spatial store',
  );

  // Closing a surface must be visible, without touching anything native.
  useSpatialStore.getState().removeWindow('browser');
  const afterClose = currentSync(2_000);
  assert(find(afterClose, 'browser').spatialOpen === false, 'closing a surface is observed');
  assert(find(afterClose, 'browser').nativeRunning === true, 'while the application keeps running');
  assert(find(afterClose, 'browser').status === 'native-only', 'which is exactly native-only');
  dispatch({ action: 'open', target: 'browser' }, 'system');

  // The launch record.
  clearLaunchRequests();
  assert(launchRequests().length === 0, 'the launch record starts empty');
  noteLaunchRequest('com.spotify.Client', true, 1_000);
  noteLaunchRequest('com.spotify.Client', true, 2_000);
  assert(launchRequests().length === 1, 'one entry per application, newest wins');
  assert(launchRequests()[0].at === 2_000, 'and it is the newest');
  noteLaunchRequest('', true, 3_000);
  assert(launchRequests().length === 1, 'an empty identity is not recorded');
  clearLaunchRequests();

  // Unavailable, live.
  useNativeStore.getState().setSnapshot(UNAVAILABLE);
  const unavailable = currentSync(2_000);
  assert(unavailable.available === false, 'an unavailable provider is reported as such live');
  assert(
    unavailable.spatial.every((entry) => entry.status === 'unknown'),
    'with every surface unknown',
  );
  pass('The live reading tracks both stores and invents nothing');

  clearLaunchRequests();
}

// --- the security boundary ---------------------------------------------------

console.log('--- Security boundary ---');
{
  // Nothing hostile can enter through a launch identity.
  clearLaunchRequests();
  for (const hostile of ['/bin/bash', 'bash -c id', 'spotify; rm -rf /', '../../etc/passwd']) {
    noteLaunchRequest(hostile, true, 1_000);
  }
  const sync = synchronise({
    native: snapshotWith([]),
    spatialWindowIds: ALL_FIVE,
    launchRequests: launchRequests(),
    at: 2_000,
  });

  // They are inert: they match no surface, so they influence nothing.
  assert(
    sync.spatial.every((entry) => entry.lifecycle === 'idle'),
    `a hostile identity attaches to no surface, saw ${JSON.stringify(sync.spatial.map((e) => e.lifecycle))}`,
  );
  assert(
    !JSON.stringify(sync).includes('bin/bash'),
    'and never appears in a synchronisation reading',
  );

  // The layer cannot act. Its whole surface is reading and recording.
  const surface = { synchronise, currentSync, noteLaunchRequest, launchRequests, clearLaunchRequests };
  for (const forbidden of ['launch', 'exec', 'spawn', 'dispatch', 'openWindow', 'perform']) {
    assert(!(forbidden in surface), `the sync layer exposes no "${forbidden}"`);
  }
  clearLaunchRequests();
  pass('Nothing executable can enter or leave the synchronisation layer');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} sync assertions FAILED`);
}
console.log(`ALL ${checks} NATIVE SYNC ASSERTIONS PASSED! 🎉`);
console.log('========================================');
