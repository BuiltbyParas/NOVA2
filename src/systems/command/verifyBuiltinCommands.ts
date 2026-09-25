import { routeUtterance } from './intentRouter';
import { interpret } from './commandParser';
import { useSpatialStore } from '../../state/spatialStore';
import { normalizeProviderReport } from '../native/nativeBridge';
import { useNativeStore } from '../native/nativeStore';
import { NO_SYSTEM_ADAPTER, setSystemAdapter } from '../native/systemAdapter';
import type { SystemAdapter } from '../native/systemAdapter';
import { APP_ORDER } from '../../data/apps';
import type { AppType } from '../../types/window';

/**
 * The five built-in applications, pinned.
 *
 * NOVA's five spatial surfaces are the product. Every phase since has added a
 * way to *also* talk to the real computer — an installed-application catalog, a
 * launcher, a synchronisation layer — and each of those widened what an OPEN
 * could mean. This suite exists so that widening can never again quietly
 * swallow the five commands the whole interface is built on.
 *
 * It asserts the observable outcome, not the internal route: the command that
 * comes out, and the window that exists afterwards. A refactor is free to
 * change which tier answers, and is not free to change the answer.
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

/**
 * An adapter that launches nothing and writes down every request.
 *
 * A stub that simply refuses would let "the built-ins no longer launch
 * anything" pass for the wrong reason. This one reports itself *available* and
 * capable, so a built-in that still tried to launch would succeed loudly and be
 * caught here.
 */
const launches: string[] = [];
const RECORDING_ADAPTER: SystemAdapter = {
  id: 'recording',
  available: true,
  capabilities: ['OPEN_APPLICATION'],
  describe: () => 'recording — launches nothing, remembers everything',
  snapshot: () => CATALOG,
  perform: async (request) => {
    launches.push(String(request.applicationId ?? ''));
    return {
      ok: true,
      capability: request.capability,
      applicationId: String(request.applicationId ?? ''),
    };
  },
};

/** Nothing open, so "open" has visible work to do and cannot pass vacuously. */
function clearWindows() {
  const store = useSpatialStore.getState();
  for (const id of Object.keys(store.windows)) store.removeWindow(id as AppType);
}

const windowIds = () => Object.keys(useSpatialStore.getState().windows);

/** A catalog shaped like the real host, including its traps. */
const CATALOG = normalizeProviderReport(
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
    applications: [
      // The traps: real applications literally named "Terminal" and "Files".
      { id: 'org.gnome.Ptyxis', name: 'Terminal', running: true },
      { id: 'org.gnome.Nautilus', name: 'Files', running: false },
      { id: 'com.google.Chrome', name: 'Google Chrome', running: false },
      { id: 'com.spotify.Client', name: 'Spotify', running: false },
      { id: 'org.gnome.Calculator', name: 'Calculator', running: false },
      { id: 'org.mozilla.firefox', name: 'Firefox', running: false },
    ],
    windows: [],
    notes: [],
  },
  1000,
);

setSystemAdapter(RECORDING_ADAPTER);

console.log('\n=== NOVA · built-in command regression ===\n');

// --- the five, from nothing ---------------------------------------------------

console.log('--- The five built-in applications ---');
for (const app of APP_ORDER) {
  clearWindows();
  useNativeStore.getState().setSnapshot(CATALOG);

  const result = await routeUtterance(`open ${app}`, 'command-line');

  assert(result.understood, `"open ${app}" is understood`);
  assert(
    JSON.stringify(result.commands) === JSON.stringify([{ action: 'open', target: app }]),
    `"open ${app}" produces exactly {action:'open', target:'${app}'}, saw ${JSON.stringify(result.commands)}`,
  );
  assert(
    !result.commands.some((command) => command.action === 'open-application'),
    `"open ${app}" is never diverted to open-application`,
  );
  assert(result.clarification === null, `"open ${app}" asks no question`);
  assert(windowIds().includes(app), `"open ${app}" leaves the ${app} window open`);
}
pass('All five built-in applications open from their own name');

// --- their aliases ------------------------------------------------------------

console.log('--- Aliases ---');
const ALIASES: [string, AppType][] = [
  ['open shell', 'terminal'],
  ['open console', 'terminal'],
  ['open editor', 'code'],
  ['open code editor', 'code'],
  ['open ide', 'code'],
  ['open file manager', 'files'],
  ['open folders', 'files'],
  ['open explorer', 'files'],
  ['open writing', 'notes'],
  ['open note', 'notes'],
  ['open document', 'notes'],
  ['open web browser', 'browser'],
  ['open internet', 'browser'],
  ['launch terminal', 'terminal'],
  ['start notes', 'notes'],
];
for (const [utterance, expected] of ALIASES) {
  clearWindows();
  useNativeStore.getState().setSnapshot(CATALOG);

  const result = await routeUtterance(utterance, 'command-line');
  assert(
    JSON.stringify(result.commands) === JSON.stringify([{ action: 'open', target: expected }]),
    `"${utterance}" → open ${expected}, saw ${JSON.stringify(result.commands)}`,
  );
  assert(windowIds().includes(expected), `"${utterance}" opens the ${expected} window`);
}
pass('Every alias still reaches its own spatial surface');

// --- the catalog must not steal them -----------------------------------------

console.log('--- The catalog must not steal a category ---');
{
  // "Terminal" and "Files" are also real installed applications on this host.
  // A category must win, or "open terminal" launches Ptyxis instead of opening
  // NOVA's Terminal — the exact shape of the Chrome/Firefox defect.
  for (const [utterance, app] of [
    ['open terminal', 'terminal'],
    ['open files', 'files'],
  ] as const) {
    clearWindows();
    useNativeStore.getState().setSnapshot(CATALOG);
    const result = await routeUtterance(utterance, 'command-line');
    assert(
      JSON.stringify(result.commands) === JSON.stringify([{ action: 'open', target: app }]),
      `"${utterance}" resolves to the category even though an application shares its name`,
    );
  }

  // And with no native provider at all, the five must still work.
  clearWindows();
  useNativeStore.getState().setSnapshot(normalizeProviderReport(null, 1000));
  const offline = await routeUtterance('open terminal', 'command-line');
  assert(
    JSON.stringify(offline.commands) === JSON.stringify([{ action: 'open', target: 'terminal' }]),
    'with no native provider, "open terminal" still opens the spatial surface',
  );
  assert(windowIds().includes('terminal'), 'and the window is really there');
  pass('A category outranks the catalog, and survives the catalog being absent');
}

// --- an already-open surface --------------------------------------------------

console.log('--- Already open ---');
{
  useNativeStore.getState().setSnapshot(CATALOG);
  clearWindows();
  await routeUtterance('open browser', 'command-line');
  const first = windowIds();
  await routeUtterance('open browser', 'command-line');
  const second = windowIds();

  assert(second.filter((id) => id === 'browser').length === 1, 'opening twice makes one window, not two');
  assert(first.length === second.length, 'and does not accumulate windows');
  assert(
    useSpatialStore.getState().focusedId === 'browser',
    'the second "open browser" leaves the browser focused',
  );
  pass('Opening an already-open surface reveals it rather than duplicating it');
}

// --- product names still reach the catalog -----------------------------------

console.log('--- Product names ---');
{
  useNativeStore.getState().setSnapshot(CATALOG);
  for (const [utterance, id] of [
    ['open Chrome', 'com.google.Chrome'],
    ['open Spotify', 'com.spotify.Client'],
    ['open Calculator', 'org.gnome.Calculator'],
    ['open Firefox', 'org.mozilla.firefox'],
  ] as const) {
    clearWindows();
    const result = await routeUtterance(utterance, 'command-line');
    const command = result.commands[0];
    assert(
      command?.action === 'open-application' && command.applicationId === id,
      `"${utterance}" launches ${id}, saw ${JSON.stringify(result.commands)}`,
    );
    assert(
      !result.commands.some((entry) => entry.action === 'open'),
      `"${utterance}" opens no spatial surface — it is not one of the five`,
    );
  }
  // The regression that started all of this.
  clearWindows();
  const chrome = await routeUtterance('open Chrome', 'command-line');
  assert(
    JSON.stringify(chrome.commands).includes('com.google.Chrome'),
    '"open Chrome" does not launch Firefox',
  );
  assert(!windowIds().includes('browser'), 'and does not open NOVA’s Browser surface instead');
  pass('Product names still resolve to their own installed application');
}

// --- nothing executable gets through -----------------------------------------

console.log('--- Dangerous input ---');
{
  useNativeStore.getState().setSnapshot(CATALOG);
  for (const hostile of [
    'open /bin/bash',
    'open bash -c id',
    'open terminal -c something',
    'open ../../etc/passwd',
    'open terminal; rm -rf /',
    'open $(whoami)',
    'open `id`',
  ]) {
    clearWindows();
    const result = await routeUtterance(hostile, 'command-line');
    assert(result.commands.length === 0, `"${hostile}" produces no command at all`);
    assert(
      !JSON.stringify(result.commands).includes('open-application'),
      `"${hostile}" launches nothing`,
    );
    assert(windowIds().length === 0, `"${hostile}" opens no window either`);
  }
  // The parser rejects them before anything downstream is consulted.
  assert(interpret('open /bin/bash').understood === false, 'a path is not an application name');
  assert(interpret('open terminal -c something').understood === false, 'an argument is not one either');
  pass('No path, flag or shell fragment reaches the launcher');
}

// --- voice takes the identical path ------------------------------------------

console.log('--- Voice ---');
{
  useNativeStore.getState().setSnapshot(CATALOG);
  for (const app of APP_ORDER) {
    clearWindows();
    const spoken = await routeUtterance(`open ${app}`, 'voice');
    clearWindows();
    const typed = await routeUtterance(`open ${app}`, 'command-line');
    assert(
      JSON.stringify(spoken.commands) === JSON.stringify(typed.commands),
      `spoken and typed "open ${app}" produce identical commands`,
    );
    assert(spoken.via === typed.via, `and travel by the same route (${spoken.via})`);
  }
  clearWindows();
  const spokenGesture = await routeUtterance('open terminal', 'gesture');
  assert(
    JSON.stringify(spokenGesture.commands) === JSON.stringify([{ action: 'open', target: 'terminal' }]),
    'a gesture-sourced utterance takes the same path as well',
  );
  pass('Voice and gesture converge on the one pipeline, with no second implementation');
}

// --- a built-in launches nothing on the real computer -------------------------

console.log('--- A category launches nothing ---');
{
  useNativeStore.getState().setSnapshot(CATALOG);

  for (const app of APP_ORDER) {
    clearWindows();
    launches.length = 0;
    await routeUtterance(`open ${app}`, 'command-line');
    // Give the bus's own fire-and-forget window a chance to misbehave.
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert(launches.length === 0, `"open ${app}" starts no real application, saw ${JSON.stringify(launches)}`);
    assert(windowIds().includes(app), `while the ${app} surface still opens`);
  }

  // The same for the aliases, which travel the same branch.
  for (const utterance of ['open shell', 'open editor', 'open file manager', 'open writing']) {
    clearWindows();
    launches.length = 0;
    await routeUtterance(utterance, 'command-line');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert(launches.length === 0, `"${utterance}" starts no real application`);
  }

  // And the counterpart: naming a product still does launch it, so this suite
  // cannot pass by the launcher simply being broken.
  clearWindows();
  launches.length = 0;
  await routeUtterance('open Spotify', 'command-line');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(
    launches.includes('com.spotify.Client'),
    `"open Spotify" does still launch Spotify, saw ${JSON.stringify(launches)}`,
  );

  clearWindows();
  launches.length = 0;
  await routeUtterance('open Chrome', 'command-line');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(launches.includes('com.google.Chrome'), '"open Chrome" does still launch Chrome');
  assert(!launches.includes('org.mozilla.firefox'), 'and still does not launch Firefox');

  launches.length = 0;
  pass('A category opens a surface; only a product name starts a program');
}

setSystemAdapter(NO_SYSTEM_ADAPTER);

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} built-in command assertions FAILED`);
}
console.log(`ALL ${checks} BUILT-IN COMMAND ASSERTIONS PASSED! 🎉`);
console.log('========================================');
