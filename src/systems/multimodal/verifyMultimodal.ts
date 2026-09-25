import type { ModalitySignal } from '../../types/multimodal';
import type { AppType, SpatialWindow } from '../../types/window';
import { APPS } from '../../data/apps';
import { WORKSPACES } from '../../data/workspaces';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../command/commandBus';
import { routeUtterance } from '../command/intentRouter';
import { buildContextGraph, type ContextSnapshot } from '../context/contextGraph';
import { resolveReference } from '../context/referenceResolver';
import * as engine from '../context/contextEngine';
import { clearMemories, listMemories } from '../memory/memoryManager';
import { InMemoryRepository, setRepository } from '../memory/memoryRepository';
import { getSystemAdapter } from '../native/systemAdapter';
import {
  activeSignals,
  clearInteractionContext,
  currentReferent,
  modalityOfSource,
  notePointing,
  noteSelection,
} from './interactionContext';
import {
  MIN_HAND_CONFIDENCE,
  REFERENT_TTL_MS,
  resolveReferent,
} from './referentResolution';
import { startMultimodalContext } from './multimodalDriver';
import { useTraceStore } from './pipelineTrace';

/**
 * Phase 7 verification.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the command bus, the context graph, the reference resolver, spatial
 *       memory, the intent router, and the priority model itself.
 * MOCK: the *devices*. A mouse ray and a webcam fingertip both arrive at NOVA
 *       as a normalised signal, so the tests supply those signals directly.
 *       No speech recognition is simulated, and no hand tracking is simulated —
 *       the hardware layers are tested in their own suites (verifyVision,
 *       verifyVoice); this suite tests what NOVA does with what they produce.
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

console.log('\n=== NOVA Phase 7 · Multimodal Spatial Intelligence ===\n');

// --- fixtures ---------------------------------------------------------------

function developmentSnapshot(focused: string | null, signals: ModalitySignal[] = []): ContextSnapshot {
  const apps: AppType[] = ['browser', 'code', 'terminal', 'notes', 'files'];
  const windows: SpatialWindow[] = apps.map((app) => {
    const placement = WORKSPACES.development.placements[app];
    const definition = APPS[app];
    return {
      id: app,
      app,
      title: definition.title,
      position: { ...placement.position },
      rotation: { ...placement.rotation },
      scale: placement.scale,
      width: definition.width,
      height: definition.height,
      focused: app === focused,
      minimized: false,
      lifecycle: 'settled',
      lifecycleAt: 0,
    };
  });
  return {
    windows,
    order: apps,
    focusedId: focused,
    workspace: 'development',
    activeTaskId: 'nova-build',
    interactions: {},
    signals,
    at: 10_000,
  };
}

const signal = (
  modality: ModalitySignal['modality'],
  type: ModalitySignal['type'],
  target: string | null,
  at = 10_000,
  confidence = 1,
): ModalitySignal => ({ modality, type, target, confidence, at });

// --- 1. the normalised event model ------------------------------------------

console.log('--- Normalised signals ---');
{
  clearInteractionContext();
  notePointing('mouse', 'browser', 1, 100);
  const [first] = activeSignals(200);
  assert(first.modality === 'mouse', 'a signal records which device produced it');
  assert(first.type === 'point', 'and what kind of observation it was');
  assert(first.target === 'browser', 'and the application identity it refers to');
  assert(first.confidence === 1, 'and how sure the device was');

  // A signal carries no hardware detail — no ray, no landmark, no pixel.
  const serialized = JSON.stringify(first);
  assert(!/ray|landmark|pixel|ndc|mesh|object3d/i.test(serialized), 'and nothing about the hardware');

  assert(modalityOfSource('pointer') === 'mouse', 'the bus’s "pointer" is the mouse modality');
  assert(modalityOfSource('gesture') === 'hand', '"gesture" is the hand modality');
  assert(modalityOfSource('voice') === 'voice', '"voice" is the voice modality');
  assert(modalityOfSource('command-line') === 'text', '"command-line" is the text modality');
  pass('Every device produces the same normalised signal shape');

  // Repeating a target must not churn: the frame loop depends on this.
  clearInteractionContext();
  notePointing('mouse', 'code', 1, 100);
  const before = activeSignals(150).length;
  notePointing('mouse', 'code', 1, 120);
  assert(activeSignals(150).length === before, 'pointing at the same window again adds nothing');
  pass('Unchanged pointing costs nothing, so the frame loop stays free of this');
}

// --- 9, 13. the priority model ----------------------------------------------

console.log('--- Priority model ---');
{
  // Tier 1 beats tier 2: a decision outranks a direction.
  const both = resolveReferent(
    [signal('mouse', 'point', 'terminal', 9_000), signal('hand', 'select', 'code', 9_500)],
    10_000,
  );
  assert(both.status === 'resolved' && both.windowId === 'code', 'a selection outranks a point');
  assert(both.status === 'resolved' && both.tier === 'select', 'and reports which tier decided');

  // Within a tier, the more recent signal from the same device wins.
  const sequential = resolveReferent(
    [signal('hand', 'point', 'browser', 9_000), signal('hand', 'point', 'notes', 9_800)],
    10_000,
  );
  assert(
    sequential.status === 'resolved' && sequential.windowId === 'notes',
    'the newest observation from one device wins',
  );

  // §9: two devices indicating different windows, at the same strength.
  const conflict = resolveReferent(
    [signal('mouse', 'point', 'browser', 9_900), signal('hand', 'point', 'code', 9_950)],
    10_000,
  );
  assert(conflict.status === 'ambiguous', 'two devices pointing at different windows is ambiguous');
  assert(
    conflict.status === 'ambiguous' && conflict.candidates.length === 2,
    'and both candidates are named',
  );
  assert(
    conflict.status === 'ambiguous' &&
      conflict.candidates.some((c) => c.modality === 'mouse') &&
      conflict.candidates.some((c) => c.modality === 'hand'),
    'with the device that indicated each',
  );

  // A documented preference, not a hidden one: pointing outranks an older focus,
  // and focus is not even in this layer — it is the caller's next fallback.
  const pointOnly = resolveReferent([signal('hand', 'point', 'code', 9_990)], 10_000);
  assert(pointOnly.status === 'resolved' && pointOnly.windowId === 'code', 'a lone point resolves');

  // Conflicting devices in *different* tiers is not ambiguous: the ladder decides.
  const laddered = resolveReferent(
    [signal('mouse', 'select', 'browser', 9_000), signal('hand', 'point', 'code', 9_990)],
    10_000,
  );
  assert(
    laddered.status === 'resolved' && laddered.windowId === 'browser',
    'a selection still wins over a newer point — the ladder is strict',
  );
  pass('The priority model is a strict ladder, and disagreement inside a tier asks');
}

// --- 5. temporal context ----------------------------------------------------

console.log('--- Temporal context ---');
{
  const fresh = resolveReferent([signal('hand', 'point', 'code', 10_000 - 1_000)], 10_000);
  assert(fresh.status === 'resolved', 'a signal from a second ago still counts');

  const stale = resolveReferent(
    [signal('hand', 'point', 'code', 10_000 - REFERENT_TTL_MS - 1)], 10_000,
  );
  assert(stale.status === 'none', 'a signal older than the window does not');
  assert(REFERENT_TTL_MS <= 15_000, 'and the window is short enough not to be memory');

  // §6 — a weak hand signal is not a deliberate reference.
  const weak = resolveReferent(
    [signal('hand', 'point', 'code', 9_990, MIN_HAND_CONFIDENCE - 0.01)], 10_000,
  );
  assert(weak.status === 'none', 'a low-confidence hand signal is ignored');
  const strong = resolveReferent(
    [signal('hand', 'point', 'code', 9_990, MIN_HAND_CONFIDENCE + 0.01)], 10_000,
  );
  assert(strong.status === 'resolved', 'a confident one is not');
  assert(
    resolveReferent([signal('mouse', 'point', 'code', 9_990, 0.2)], 10_000).status === 'resolved',
    'the confidence floor applies to vision, not to a mouse that is always certain',
  );
  pass('Referents expire, and weak vision signals never drive a command');
}

// --- 2, 4, 6, 7. referent resolution through the real resolver ---------------

console.log('--- "this", across modalities ---');
{
  // HAND + VOICE. Hand points at Browser; the sentence says "this".
  const handGraph = buildContextGraph(
    developmentSnapshot('code', [signal('hand', 'point', 'browser', 9_800, 0.94)]),
  );
  const handThis = resolveReference(handGraph, 'this');
  assert(
    handThis.status === 'resolved' && handThis.windowId === 'browser',
    `a hand pointing at Browser makes "this" mean Browser, got ${JSON.stringify(handThis)}`,
  );
  assert(handThis.status === 'resolved' && handThis.via === 'pointing', 'resolved via pointing');
  assert(handGraph.focusedId === 'code', 'even though Code is the focused window');

  // MOUSE + VOICE. The same, with a click.
  const mouseGraph = buildContextGraph(
    developmentSnapshot('notes', [signal('mouse', 'select', 'browser', 9_900)]),
  );
  assert(
    resolveReference(mouseGraph, 'move this').status === 'resolved' &&
      (resolveReference(mouseGraph, 'move this') as { windowId: string }).windowId === 'browser',
    'a clicked window becomes the referent for "this"',
  );

  // The multimodal phrasings §4 asks for.
  for (const phrase of [
    'this',
    'that',
    'it',
    'the selected window',
    "the window i'm pointing at",
    'the one i am pointing at',
  ]) {
    const resolved = resolveReference(handGraph, phrase);
    assert(
      resolved.status === 'resolved' && resolved.windowId === 'browser',
      `"${phrase}" resolves to what is being indicated, got ${JSON.stringify(resolved)}`,
    );
  }
  pass('Hand and mouse both supply the referent for "this"');

  // Naming something outright still beats any device. A sentence that says
  // "terminal" means the terminal, whatever a finger happens to be near.
  const named = resolveReference(handGraph, 'the terminal');
  assert(named.status === 'resolved' && named.windowId === 'terminal', 'an explicit name outranks pointing');

  // Spatial descriptions never consult the referent. In this layout Browser
  // (-2.92) and Files (-2.60) are too close to call, so Phase 4 asks — and a
  // hand pointing at Browser must not quietly settle it.
  const pointingAtBrowser = buildContextGraph(
    developmentSnapshot('code', [signal('hand', 'point', 'browser', 9_900, 0.9)]),
  );
  const onLeft = resolveReference(pointingAtBrowser, 'the one on the left');
  assert(
    onLeft.status === 'ambiguous',
    `a spatial phrase keeps Phase 4's answer, got ${JSON.stringify(onLeft)}`,
  );
  const onRight = resolveReference(pointingAtBrowser, 'the one on the right');
  assert(onRight.status === 'ambiguous', 'and the same on the right, as Phase 4 established');
  pass('Naming and spatial description still outrank a device, and never fall back to it');

  // §8, §10 — no devices at all. Phase 4 behaviour must be untouched.
  const bare = buildContextGraph(developmentSnapshot('code'));
  assert(bare.referent.status === 'none', 'with no devices there is no referent');
  const bareThis = resolveReference(bare, 'this');
  assert(
    bareThis.status === 'resolved' && bareThis.windowId === 'code' && bareThis.via === 'focus',
    'and "this" falls back to focus exactly as Phase 4 defined',
  );
  pass('With no device signals, Phase 4 resolution is bit-for-bit unchanged');

  // §8, §9 — conflicting devices reach the user as a question.
  const conflicted = buildContextGraph(
    developmentSnapshot('code', [
      signal('mouse', 'point', 'browser', 9_900),
      signal('hand', 'point', 'terminal', 9_950, 0.9),
    ]),
  );
  const asked = resolveReference(conflicted, 'this');
  assert(asked.status === 'ambiguous', `conflicting devices ask, got ${asked.status}`);
  if (asked.status === 'ambiguous') {
    assert(asked.candidates.length === 2, 'naming both windows');
    assert(/pointing|indicating/i.test(asked.question), `and saying why: "${asked.question}"`);
  }
  pass('Conflicting devices produce a question rather than a silent choice');

  // A referent pointing at a window that no longer exists must not survive.
  const gone = buildContextGraph(
    developmentSnapshot('code', [signal('hand', 'point', 'spreadsheet', 9_900, 0.9)]),
  );
  assert(gone.referent.status === 'none', 'a referent naming an absent window is discarded');
  pass('A stale referent cannot outlive its window');
}

// --- 3, 6, 7, 11, 12. the live pipeline -------------------------------------

console.log('--- Through the real command bus ---');
{
  setRepository(new InMemoryRepository());
  const stopEngine = engine.startContextEngine();
  const stopDriver = startMultimodalContext();
  engine.resetContextEngine();
  clearInteractionContext();
  clearMemories();

  const seen: Array<{ action: string; source: string }> = [];
  const unsubscribe = subscribeToCommands(({ command, source }) =>
    seen.push({ action: command.action, source }),
  );

  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');

  // HAND + VOICE, end to end. The hand indicates; the voice commands.
  clearInteractionContext();
  notePointing('hand', 'browser', 0.94);
  seen.length = 0;
  await routeUtterance('move this beside the terminal', 'voice');

  const moves = seen.filter((entry) => entry.action === 'move');
  assert(moves.length > 0, `a multimodal instruction reached the bus, saw ${JSON.stringify(seen)}`);
  assert(moves.every((entry) => entry.source === 'voice'), 'labelled with the modality that spoke');
  assert(
    engine.getSpatialRelation('browser', 'terminal') === 'beside',
    `Browser — the pointed-at window — was moved, got ${engine.getSpatialRelation('browser', 'terminal')}`,
  );
  pass('Point at Browser + say "move this beside the terminal" → MOVE(browser) on the real bus');

  /**
   * One device, one current intention.
   *
   * A selection outranks a pointing act, and it should — but not after the same
   * device has aimed itself somewhere else. This is the exact demonstration
   * sequence: click a window, then point at another and say "open this".
   */
  clearInteractionContext();
  noteSelection('mouse', 'browser');
  await new Promise((resolve) => setTimeout(resolve, 5));
  notePointing('mouse', 'terminal', 0.95);
  const moved = currentReferent();
  assert(
    moved.status === 'resolved' && moved.windowId === 'terminal',
    `a device's newest aim supersedes its own earlier click, got ${JSON.stringify(moved)}`,
  );

  // But only its own. Two devices disagreeing is real ambiguity, and NOVA asks.
  clearInteractionContext();
  noteSelection('mouse', 'browser');
  await new Promise((resolve) => setTimeout(resolve, 5));
  notePointing('hand', 'terminal', 0.95);
  const contested = currentReferent();
  assert(
    contested.status === 'resolved' && contested.windowId === 'browser',
    `one device pointing does not erase another device's decision, got ${JSON.stringify(contested)}`,
  );

  // And aiming at nothing is not aiming at something else.
  clearInteractionContext();
  noteSelection('mouse', 'browser');
  await new Promise((resolve) => setTimeout(resolve, 5));
  notePointing('mouse', null, 0.95);
  const wandered = currentReferent();
  assert(
    wandered.status === 'resolved' && wandered.windowId === 'browser',
    `moving off every surface does not discard the selection, got ${JSON.stringify(wandered)}`,
  );
  clearInteractionContext();
  pass('A device\'s newest act is its intention; other devices keep theirs');

  /**
   * "Open this" — the phrasing that used to fall through the floor.
   *
   * Opening is the one verb that decides between a NOVA surface and an
   * installed application, and that decision was taken before reference
   * resolution ever ran. So "open this" was handed to the application catalog,
   * which searched the installed software for a program called "this", found
   * none, and reported the sentence as unresolvable — while the answer was
   * sitting under the user's finger. The referent is consulted first now.
   */
  clearInteractionContext();
  dispatch({ action: 'focus', target: 'code' }, 'system');
  notePointing('hand', 'terminal', 0.93);
  seen.length = 0;
  const openThis = await routeUtterance('open this', 'voice');
  assert(openThis.understood === true, '"open this" is understood while something is indicated');
  assert(
    seen.some((entry) => entry.action === 'focus'),
    `"open this" reached the bus, saw ${JSON.stringify(seen)}`,
  );
  assert(
    engine.getFocusedWindow()?.id === 'terminal',
    `and resolved to the pointed-at window, got ${engine.getFocusedWindow()?.id}`,
  );
  assert(
    seen.every((entry) => entry.action !== 'open-application'),
    'and never tried to launch a real program called "this"',
  );
  pass('Point at Terminal + say "open this" → the referent is opened, not the catalog searched');

  // The same sentence with nothing indicated must stay honest rather than
  // guessing at a window or wandering off to the installed applications.
  clearInteractionContext();
  dispatch({ action: 'blur' }, 'system');
  seen.length = 0;
  const openNothing = await routeUtterance('open this', 'voice');
  assert(
    !seen.some((entry) => entry.action === 'open-application'),
    'with nothing indicated, "open this" launches nothing on the computer',
  );
  assert(
    openNothing.commands.every((command) => command.action !== 'open-application'),
    'and produces no launch command at all',
  );
  pass('"Open this" with nothing to point at resolves to nothing, never to a guess');

  // §6 — "close this" while pointing at Notes.
  clearInteractionContext();
  notePointing('hand', 'notes', 0.9);
  seen.length = 0;
  await routeUtterance('hide this', 'voice');
  assert(
    seen.some((entry) => entry.action === 'minimize'),
    `"hide this" acted on the indicated window, saw ${JSON.stringify(seen)}`,
  );
  assert(engine.getWindowContext('notes')?.minimized === true, 'and it was Notes');
  dispatch({ action: 'restore', target: 'notes' }, 'system');
  pass('Point + "hide this" resolves and executes through the existing bus');

  // §7 — MOUSE + VOICE. A click becomes the referent for the next sentence.
  clearInteractionContext();
  dispatch({ action: 'focus', target: 'terminal' }, 'pointer');
  const referentAfterClick = currentReferent();
  assert(
    referentAfterClick.status === 'resolved' &&
      referentAfterClick.windowId === 'terminal' &&
      referentAfterClick.modality === 'mouse',
    `clicking a window records it as a mouse selection, got ${JSON.stringify(referentAfterClick)}`,
  );
  const scaleBefore = engine.getWindowContext('terminal')!.scale;
  await routeUtterance('make this bigger', 'voice');
  assert(
    engine.getWindowContext('terminal')!.scale > scaleBefore,
    'and "make this bigger" enlarged the clicked window',
  );
  pass('Click Terminal + say "make this bigger" → RESIZE(terminal)');

  // §9 live — two devices disagree, so NOVA asks and executes nothing.
  clearInteractionContext();
  notePointing('mouse', 'browser', 1);
  notePointing('hand', 'code', 0.92);
  seen.length = 0;
  const conflicted = await routeUtterance('make this bigger', 'voice');
  assert(
    conflicted.clarification !== null,
    `conflicting devices produce a clarification, got ${JSON.stringify(conflicted.clarification)}`,
  );
  assert(
    /did you mean|which/i.test(conflicted.clarification?.question ?? ''),
    `and a question worth asking: "${conflicted.clarification?.question}"`,
  );
  assert(
    !seen.some((entry) => ['move', 'scale', 'rotate'].includes(entry.action)),
    `and nothing was moved or resized, saw ${JSON.stringify(seen)}`,
  );
  pass('Conflicting devices: NOVA asks, and the environment is untouched');

  // §10 — a modality going away must not strand anything.
  clearInteractionContext();
  notePointing('hand', 'code', 0.9);
  notePointing('hand', null, 0);
  assert(currentReferent().status === 'none', 'a hand leaving the frame clears its referent');
  dispatch({ action: 'focus', target: 'code' }, 'pointer');
  clearInteractionContext();
  const fallback = await routeUtterance('make it bigger', 'voice');
  assert(fallback.understood === true, 'with no devices indicating, focus still answers "it"');
  pass('Modality loss degrades to Phase 4 behaviour rather than failing');

  // §11 — memory through a multimodal referent.
  clearInteractionContext();
  notePointing('hand', 'code', 0.95);
  await routeUtterance('save this as my pointing workspace', 'voice');
  assert(listMemories().length === 1, `a spoken save still reached Phase 5, got ${listMemories().length}`);
  assert(
    listMemories()[0].name === 'pointing workspace',
    'and "this" in a memory sentence still means the whole arrangement, not the pointed-at window',
  );
  pass('Memory sentences are unaffected: "save this" is about the arrangement');

  // §12 — workspace switching, unchanged.
  await routeUtterance('switch to study', 'voice');
  assert(engine.getCurrentContext().workspace.id === 'study', 'workspace switching still works');
  pass('Workspace switching is untouched');

  unsubscribe();
  stopDriver();
  stopEngine();
  clearMemories();
  clearInteractionContext();
}

// --- 15. the developer trace ------------------------------------------------

console.log('--- Developer trace ---');
{
  const stopEngine = engine.startContextEngine();
  const stopDriver = startMultimodalContext();
  useTraceStore.getState().clear();
  clearInteractionContext();

  dispatch({ action: 'workspace', target: 'development' }, 'system');
  notePointing('hand', 'browser', 0.93);
  await routeUtterance('move this beside the code', 'voice');

  const [latest] = useTraceStore.getState().traces;
  assert(Boolean(latest), 'an instruction leaves a trace');
  assert(latest.inputModality === 'hand', `the trace names the device, got ${latest.inputModality}`);
  assert(latest.inputTarget === 'browser', 'and what it indicated');
  assert(latest.utterance === 'move this beside the code', 'and the words');
  assert(latest.utteranceModality === 'voice', 'and where the words came from');
  assert(Boolean(latest.resolution), `and how the reference was settled: "${latest.resolution}"`);
  assert(latest.commands.length > 0, `and the commands produced: ${latest.commands.join(', ')}`);
  assert(/MOVE\(/.test(latest.commands[0]), 'in a readable shorthand');
  assert(latest.result === 'success', 'and the outcome');
  pass(`Trace: ${latest.inputModality}→${latest.inputTarget} · "${latest.utterance}" · ${latest.commands.join(', ')} · ${latest.result}`);

  assert(useTraceStore.getState().traces.length <= 6, 'the trace is bounded, not a log');
  useTraceStore.getState().clear();
  stopDriver();
  stopEngine();
  clearInteractionContext();
}

// --- 16, 20. the native boundary --------------------------------------------

console.log('--- Native boundary ---');
{
  const adapter = getSystemAdapter();
  assert(adapter.available === false, 'no native adapter is installed by default');
  assert(adapter.id === 'none', 'and the seam says so plainly');

  // Phase 8 added `snapshot()` (reading); Phase 9 added `capabilities` and one
  // `perform` (acting, enumerably). The property this test has always guarded
  // is unchanged: whatever the seam can do is *listed*, and the verbs below
  // must never appear on it as methods of their own.
  const surface = Object.keys(adapter).sort().join(',');
  assert(
    surface === 'available,capabilities,describe,id,perform,snapshot',
    `the seam's surface is fixed and enumerable, got ${surface}`,
  );
  assert(
    adapter.capabilities.length === 0,
    'the default adapter can do nothing at all',
  );
  assert(!('launch' in adapter), 'no ad-hoc application launching method exists');
  assert(!('openFile' in adapter), 'no filesystem access exists');
  assert(!('exec' in adapter), 'no shell execution exists');
  assert(!('focus' in adapter), 'no native window control exists');
  assert(!('close' in adapter), 'no native window closing exists');
  pass('The native boundary acts only through an enumerated capability list');
}

// --- no duplicate execution paths -------------------------------------------

/**
 * Presentation mode is a change of dress, not of capability.
 *
 * This exists because of a real regression: a presentation mode was added, the
 * camera control was folded into a status panel at the same time, and hand
 * tracking appeared to have been removed from NOVA. Nothing had been — but
 * nothing asserted that either. These are the assertions that would have
 * caught it, and they will catch it next time.
 */
console.log('--- Presentation mode cannot disable an input ---');
{
  const store = useSpatialStore.getState();

  store.setPresentation(false);
  store.setVisionStatus('active');
  assert(useSpatialStore.getState().visionActive === true, 'the camera is running');

  store.setPresentation(true);
  const presenting = useSpatialStore.getState();
  assert(presenting.presentation === true, 'NOVA is presenting');
  assert(presenting.visionActive === true, 'and the camera is still running');
  assert(presenting.visionStatus === 'active', 'and still reports itself active');

  store.setPresentation(false);
  assert(useSpatialStore.getState().visionActive === true, 'leaving presentation changes nothing either');

  // What presentation mode *is* allowed to do: put the instruments away.
  store.toggleVisionDebug(true);
  store.setPresentation(true);
  assert(useSpatialStore.getState().visionDebug === false, 'entering a presentation closes the camera view');
  assert(useSpatialStore.getState().visionActive === true, 'without touching the camera itself');

  store.setVisionStatus('off');
  store.setPresentation(false);
  pass('Presentation mode hides instruments and disables no input device');
}

console.log('--- Architectural boundary ---');
{
  // The multimodal layer must not be able to change anything. Its whole surface
  // is observation in, referent out.
  const signalsModule = { notePointing, noteSelection, currentReferent, activeSignals };
  for (const [name, fn] of Object.entries(signalsModule)) {
    assert(typeof fn === 'function', `${name} is part of the multimodal surface`);
  }

  clearInteractionContext();
  const before = JSON.stringify(useSpatialStore.getState().windows);
  notePointing('hand', 'browser', 0.99);
  noteSelection('mouse', 'code');
  assert(
    JSON.stringify(useSpatialStore.getState().windows) === before,
    'recording signals changes no spatial state whatsoever',
  );
  assert(currentReferent().status !== 'none', 'though the referent did change');
  clearInteractionContext();
  pass('The multimodal layer observes; it cannot execute');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} multimodal assertions FAILED`);
}
console.log(`ALL ${checks} MULTIMODAL ASSERTIONS PASSED! 🎉`);
console.log('========================================');
