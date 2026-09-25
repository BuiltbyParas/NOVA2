import type { MultimodalReferent } from '../../types/multimodal';
import type { AppType } from '../../types/window';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../command/commandBus';
import * as engine from '../context/contextEngine';
import { NO_SYSTEM_ADAPTER, setSystemAdapter } from '../native/systemAdapter';
import { gestureIntent } from './gestureIntent';
import { performGestureIntent } from './gestureCommands';
import {
  clearInteractionContext,
  currentReferent,
  notePointing,
  noteSelection,
} from './interactionContext';
import { MIN_HAND_CONFIDENCE, REFERENT_TTL_MS } from './referentResolution';
import { Mesh, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { cursor, HAND_DRAG_DEAD_ZONE, interaction } from '../interaction/interactionSystem';
import { registerTarget, unregisterTarget } from '../interaction/targetRegistry';
import { inputRouter } from '../input/inputRouter';
import type { InputSource, PointerFrame } from '../input/types';
import type { CommandSource } from '../../types/command';
import { startMultimodalContext } from './multimodalDriver';
import { TAP_MAX_MS } from '../../vision/gestureRecognizer';

/**
 * Phase 9.5B verification — gestures as a producer of ordinary commands.
 *
 * ── What is real and what is mocked ──────────────────────────────────────────
 * REAL: the pure gesture layer, the referent resolver, the intent router, the
 *       command bus, and the interaction system's activation lifecycle.
 * MOCK: the *hand*. A camera and a moving hand cannot be summoned in a unit
 *       test, so gestures arrive as the `GestureObservation` the recogniser
 *       would have produced. Nothing here simulates MediaPipe or claims a real
 *       hand was tracked — the recogniser has its own suite for that.
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

console.log('\n=== NOVA Phase 9.5B · Gesture → Command Pipeline ===\n');

// --- fixtures ----------------------------------------------------------------

const resolved = (windowId: string, confidence = 0.9): MultimodalReferent => ({
  status: 'resolved',
  windowId,
  modality: 'hand',
  tier: 'point',
  confidence,
  at: 1000,
});

const NONE: MultimodalReferent = { status: 'none' };
const AMBIGUOUS: MultimodalReferent = {
  status: 'ambiguous',
  tier: 'point',
  candidates: [
    { windowId: 'browser', modality: 'mouse', confidence: 1 },
    { windowId: 'code', modality: 'hand', confidence: 0.9 },
  ],
};

const SPATIAL: AppType[] = ['browser', 'code', 'files', 'notes', 'terminal'];

// --- 1-6. the pure layer -----------------------------------------------------

console.log('--- Gesture semantics ---');
{
  // 2-6. Each of the five spatial surfaces.
  for (const app of SPATIAL) {
    const intention = gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.9 }, resolved(app));
    assert(intention !== null, `DOUBLE_PINCH on ${app} produces an intention`);
    assert(intention?.action === 'OPEN', `and it is OPEN`);
    assert(intention?.target === app, `targeting ${app}`);
    assert(
      intention?.utterance === `open ${app}`,
      `expressed as the sentence "open ${app}", got "${intention?.utterance}"`,
    );
  }
  pass('DOUBLE_PINCH on each spatial surface means "open <that surface>"');

  // 1, 10-12, 14. Every other gesture is silent.
  for (const gesture of [
    'POINT', 'PINCH_START', 'PINCHING', 'PINCH_END', 'OPEN_PALM', 'SWIPE', 'IDLE',
    'double_pinch', 'DOUBLEPINCH', '', 'ACTIVATE',
  ]) {
    assert(
      gestureIntent({ gesture, confidence: 0.95 }, resolved('terminal')) === null,
      `"${gesture}" produces no command, even with a perfect referent`,
    );
  }
  pass('POINT, PINCH_START, PINCHING, PINCH_END, OPEN_PALM and SWIPE stay silent');

  // 7. No referent.
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.95 }, NONE) === null,
    'DOUBLE_PINCH with nothing indicated produces no command',
  );
  // Two devices disagreeing is a question, not a command.
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.95 }, AMBIGUOUS) === null,
    'DOUBLE_PINCH with an ambiguous referent produces no command',
  );

  // 9. Low confidence.
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: MIN_HAND_CONFIDENCE - 0.01 }, resolved('code')) === null,
    'a hand below the confidence floor produces no command',
  );
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: MIN_HAND_CONFIDENCE }, resolved('code')) !== null,
    'and exactly at the floor it does',
  );
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0 }, resolved('code')) === null,
    'a zero-confidence hand produces nothing',
  );
  pass('No referent, an ambiguous one, or a doubtful hand all mean no command');

  // 16-17. The layer cannot reach anything.
  const intention = gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.9 }, resolved('notes'))!;
  for (const forbidden of ['dispatch', 'openWindow', 'applicationId', 'capability', 'exec', 'path']) {
    assert(!(forbidden in intention), `an intention carries no "${forbidden}"`);
  }
  assert(
    Object.values(intention).every((value) => typeof value !== 'function'),
    'and nothing in it is callable',
  );
  pass('An intention is a description, never a handle on anything');
}

// --- 8. the referent's own expiry --------------------------------------------

console.log('--- Referent lifetime ---');
{
  clearInteractionContext();
  const now = 100_000;
  notePointing('hand', 'terminal', 0.9, now - 1_000);
  assert(currentReferent(now).status === 'resolved', 'a recent point is a referent');
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.9 }, currentReferent(now)) !== null,
    'and a double pinch acts on it',
  );

  const stale = now + REFERENT_TTL_MS + 1;
  assert(currentReferent(stale).status === 'none', 'an expired point is no longer a referent');
  assert(
    gestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.9 }, currentReferent(stale)) === null,
    'and a double pinch produces nothing',
  );

  // The existing TTL is reused, not duplicated.
  assert(REFERENT_TTL_MS === 8_000, 'the existing 8s referent TTL is unchanged');
  assert(MIN_HAND_CONFIDENCE === 0.6, 'the existing 0.6 hand confidence floor is unchanged');
  pass('The existing referent TTL and confidence floor are reused, not re-invented');
}

// --- the live pipeline -------------------------------------------------------

console.log('--- Through the existing command bus ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');

  const seen: Array<{ action: string; target?: string; source: string }> = [];
  const unsubscribe = subscribeToCommands(({ command, source }) =>
    seen.push({
      action: command.action,
      target: 'target' in command ? String(command.target) : undefined,
      source,
    }),
  );
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  // 2-6. Each surface, end to end.
  for (const app of SPATIAL) {
    clearInteractionContext();
    notePointing('hand', app, 0.92);
    seen.length = 0;
    performGestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.92 });
    await settle();

    assert(seen.length > 0, `pointing at ${app} + double pinch produced a command`);
    assert(
      seen.every((entry) => entry.source === 'gesture'),
      `labelled as coming from the hand, saw ${JSON.stringify(seen)}`,
    );
    assert(
      seen.every((entry) => entry.target === undefined || entry.target === app),
      `and every command acted on ${app}, saw ${JSON.stringify(seen)}`,
    );
    assert(
      seen.some((entry) => ['open', 'restore', 'focus'].includes(entry.action)),
      `opening ${app}, saw ${JSON.stringify(seen)}`,
    );
  }
  pass('Each of the five surfaces opens through the existing bus, labelled "gesture"');

  // Equivalence: the gesture and the sentence produce the same commands.
  clearInteractionContext();
  notePointing('hand', 'notes', 0.92);
  seen.length = 0;
  performGestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.92 });
  await settle();
  const byGesture = seen.map((entry) => `${entry.action}:${entry.target ?? ''}`);

  const { routeUtterance } = await import('../command/intentRouter');
  seen.length = 0;
  await routeUtterance('open notes', 'command-line');
  const byTyping = seen.map((entry) => `${entry.action}:${entry.target ?? ''}`);

  assert(
    JSON.stringify(byGesture) === JSON.stringify(byTyping),
    `a gesture and "open notes" produce identical commands: ${JSON.stringify(byGesture)} vs ${JSON.stringify(byTyping)}`,
  );
  pass('Point + double pinch is literally the same instruction as typing "open notes"');

  // 7. Nothing indicated.
  clearInteractionContext();
  seen.length = 0;
  const acted = performGestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.95 });
  await settle();
  assert(acted === false, 'a double pinch with no referent reports that it did nothing');
  assert(seen.length === 0, `and dispatched nothing, saw ${JSON.stringify(seen)}`);

  // 1, 10-12, 14. The silent gestures, live.
  clearInteractionContext();
  notePointing('hand', 'terminal', 0.95);
  for (const gesture of ['POINT', 'PINCH_START', 'PINCHING', 'PINCH_END', 'OPEN_PALM', 'SWIPE']) {
    seen.length = 0;
    performGestureIntent({ gesture, confidence: 0.95 });
    await settle();
    assert(seen.length === 0, `"${gesture}" dispatched nothing, saw ${JSON.stringify(seen)}`);
  }
  pass('Only DOUBLE_PINCH reaches the bus; every other gesture is inert');

  // 9. Low confidence, live.
  clearInteractionContext();
  notePointing('hand', 'code', 0.95);
  seen.length = 0;
  performGestureIntent({ gesture: 'DOUBLE_PINCH', confidence: 0.3 });
  await settle();
  assert(seen.length === 0, 'a doubtful hand dispatches nothing');
  pass('A hand below the confidence floor cannot issue a command');

  unsubscribe();
  stop();
}

// --- 15. anti-repeat, at the lifecycle that actually produces it -------------

console.log('--- Anti-repeat ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();
  const seen: string[] = [];
  const unsubscribe = subscribeToCommands(({ command, source }) => {
    if (source === 'gesture') seen.push(command.action);
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  clearInteractionContext();
  notePointing('hand', 'terminal', 0.95);

  /**
   * The defect this guards.
   *
   * The recogniser raises `activate` on one hand frame, but hands arrive at
   * ~30fps while `update` runs every rendered frame — so the same frame is read
   * twice and the activation fired twice. Harmless while it only focused a
   * window; a double launch once it opens things.
   */
  /**
   * A real camera and a real raycast target, because the point of this test is
   * the interaction system's activation lifecycle — and a stub camera would
   * make the raycast miss, `onActivate` return early, and the assertion pass
   * without ever exercising the latch.
   */
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const slab = new Mesh(new PlaneGeometry(4, 3));
  slab.updateMatrixWorld(true);
  registerTarget('terminal', 'window', slab);

  const viewport = { width: 1280, height: 800 };
  const activateFrame = {
    x: 0, y: 0, primary: false, present: true, depthDelta: 0,
    modifiers: { shift: false, alt: false, meta: false },
    confidence: 0.95, gesture: 'DOUBLE_PINCH', intent: 'activate' as const,
  };

  // Confirm the ray genuinely lands on the target first, so a later miss can
  // never be mistaken for the latch working.
  interaction.submit({ ...activateFrame, intent: 'default' as const, gesture: 'POINT' });
  interaction.update(camera, viewport);
  assert(cursor.hoveredId === 'terminal', `the raycast really hits the target, got ${cursor.hoveredId}`);

  seen.length = 0;
  interaction.submit(activateFrame);

  // Five renders on one hand frame — the real ratio is about two.
  for (let i = 0; i < 5; i += 1) interaction.update(camera, viewport);
  await settle();

  assert(
    seen.length > 0,
    `the double pinch did reach the bus, saw ${JSON.stringify(seen)}`,
  );
  const activations = seen.filter((action) => action === 'open' || action === 'restore').length;
  assert(
    activations <= 1,
    `one physical double pinch opened once, not once per render — saw ${JSON.stringify(seen)}`,
  );

  // A later non-activating frame must add nothing, however many renders it sees.
  const afterFirst = seen.length;
  interaction.submit({ ...activateFrame, intent: 'default' as const, gesture: 'POINT' });
  for (let i = 0; i < 5; i += 1) interaction.update(camera, viewport);
  await settle();
  assert(seen.length === afterFirst, 'and subsequent pointing frames add nothing');

  unregisterTarget('terminal');
  pass('One physical double pinch produces one activation, however often the frame is rendered');

  unsubscribe();
  stop();
  clearInteractionContext();
}

// --- Stage 2. air click, through the real input router ------------------------

console.log('--- Air click hardening ---');
{
  /**
   * Everything above hands the interaction system frames directly, which is
   * how the anti-repeat test above could pass while a real double pinch never
   * activated: the second pinch opened a grab, and the grab swallowed the
   * activation that arrived on its own release frame.
   *
   * These tests replay the whole frame sequence the recogniser emits for each
   * gesture, through `inputRouter` with sources registered under the real ids
   * ("hand", "mouse"), so the interaction system has to work out for itself
   * which device it is hearing from.
   */
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stopEngine = engine.startContextEngine();
  const stopMultimodal = startMultimodalContext();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const seen: { action: string; source: CommandSource }[] = [];
  const unsubscribe = subscribeToCommands(({ command, source }) => {
    seen.push({ action: command.action, source });
  });
  const actions = () => seen.map((entry) => entry.action);
  const ACTIVATIONS = new Set(['open', 'restore', 'close', 'minimize', 'command']);
  const activations = () => seen.filter((entry) => ACTIVATIONS.has(entry.action));

  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const viewport = { width: 1280, height: 800 };

  // A slab the size of the real Terminal window, so surface controls land
  // where the chrome draws them.
  const terminal = useSpatialStore.getState().windows.terminal;
  const slab = new Mesh(new PlaneGeometry(terminal.width, terminal.height));
  slab.updateMatrixWorld(true);
  registerTarget('terminal', 'window', slab);

  /** Screen position (NDC) of a point on the slab, in its normalised u/v. */
  const aimAt = (u: number, v: number) => {
    const point = new Vector3((u - 0.5) * terminal.width, (v - 0.5) * terminal.height, 0);
    point.project(camera);
    return { x: point.x, y: point.y };
  };
  const BODY = aimAt(0.4, 0.4);
  const CLOSE = aimAt(0.97, 0.96);
  const NOWHERE = { x: 0.97, y: 0.97 };

  /** A source registered under a real device id, driven by hand. */
  const device = (id: 'hand' | 'mouse') => {
    let emit: ((frame: PointerFrame) => void) | null = null;
    const source: InputSource = {
      id,
      connect: (next) => {
        emit = next;
      },
      disconnect: () => {
        emit = null;
      },
    };
    inputRouter.register(source);
    return (frame: Partial<PointerFrame>, renders = 2) => {
      emit?.({
        x: 0,
        y: 0,
        primary: false,
        present: true,
        depthDelta: 0,
        modifiers: { shift: false, alt: false, meta: false },
        confidence: id === 'hand' ? 0.95 : 1,
        gesture: id === 'hand' ? 'POINT' : undefined,
        intent: 'default',
        ...frame,
      });
      for (let i = 0; i < renders; i += 1) interaction.update(camera, viewport);
    };
  };

  inputRouter.setConsumer((frame) => interaction.submit(frame));

  /** The frames the recogniser emits for one physical double pinch. */
  const doublePinch = (hand: ReturnType<typeof device>, at: { x: number; y: number }, confidence = 0.95) => {
    const f = { ...at, confidence };
    hand({ ...f, primary: true, gesture: 'PINCH_START' });
    hand({ ...f, primary: true, gesture: 'PINCHING', intent: 'move' });
    hand({ ...f, gesture: 'PINCH_END' });
    hand({ ...f, gesture: 'POINT' });
    hand({ ...f, primary: true, gesture: 'PINCH_START' });
    hand({ ...f, primary: true, gesture: 'PINCHING', intent: 'move' });
    hand({ ...f, gesture: 'DOUBLE_PINCH', intent: 'activate' });
  };

  const reset = async () => {
    // Whatever the last test left held is let go, off any target.
    await settle();
    clearInteractionContext();
    seen.length = 0;
  };

  // --- source --------------------------------------------------------------
  const hand = device('hand');
  await reset();
  hand({ ...BODY });
  assert(cursor.hoveredId === 'terminal', `the hand's ray lands on Terminal, got ${cursor.hoveredId}`);
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  hand({ ...BODY, gesture: 'PINCH_END' });
  const handFocus = seen.find((entry) => entry.action === 'focus');
  assert(handFocus?.source === 'gesture', `a hand pinch focuses as "gesture", got ${handFocus?.source}`);
  assert(
    seen.every((entry) => entry.source === 'gesture'),
    `nothing a hand does is labelled "pointer", saw ${JSON.stringify(seen)}`,
  );
  assert(useSpatialStore.getState().focusedId === 'terminal', 'and the pinched window really is focused');
  assert(currentReferent().status === 'resolved', 'a hand pinch still makes its window the referent');
  const referent = currentReferent();
  assert(
    referent.status === 'resolved' && referent.modality === 'hand',
    `and the referent now knows it was the hand, got ${JSON.stringify(referent)}`,
  );
  pass('1, 12. A hand pinch is "gesture", and still focuses its window');

  // --- valid air click ------------------------------------------------------
  await reset();
  const before = { ...useSpatialStore.getState().windows.terminal.position };
  hand({ ...BODY });
  assert(cursor.armedId === 'terminal', `a confident hand on a window arms it, got ${cursor.armedId}`);
  doublePinch(hand, BODY);
  await settle();
  const opened = activations();
  assert(
    opened.length === 1 && opened[0].action === 'open' && opened[0].source === 'gesture',
    `one physical double pinch is one "open" command from the hand, saw ${JSON.stringify(opened)}`,
  );
  assert(!actions().includes('move'), `and it moves nothing, saw ${JSON.stringify(actions())}`);
  const after = useSpatialStore.getState().windows.terminal.position;
  assert(
    after.x === before.x && after.y === before.y && after.z === before.z,
    'the window is exactly where it was',
  );
  pass('3. Point + double pinch selects once, without nudging the window');

  // --- duplicate activation ------------------------------------------------
  await reset();
  doublePinch(hand, BODY);
  // The activation frame read again by five more renders, and pointing after.
  for (let i = 0; i < 5; i += 1) interaction.update(camera, viewport);
  hand({ ...BODY }, 5);
  await settle();
  assert(activations().length <= 1, `duplicate renders add no activation, saw ${JSON.stringify(activations())}`);
  pass('10. One physical double pinch produces at most one activation');

  // --- single and sustained pinch ------------------------------------------
  await reset();
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  hand({ ...BODY, primary: true, gesture: 'PINCHING', intent: 'move' });
  hand({ ...BODY, gesture: 'PINCH_END' });
  hand({ ...BODY });
  await settle();
  assert(activations().length === 0, `a single pinch activates nothing, saw ${JSON.stringify(actions())}`);
  pass('7. A single pinch does not activate');

  await reset();
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  await wait(TAP_MAX_MS + 40);
  for (let i = 0; i < 6; i += 1) hand({ ...BODY, primary: true, gesture: 'PINCHING', intent: 'move' });
  hand({ ...BODY, gesture: 'PINCH_END' });
  await settle();
  assert(activations().length === 0, `a sustained pinch activates nothing, saw ${JSON.stringify(actions())}`);
  pass('8. A sustained pinch does not activate');

  // A tap whose activation frame arrives late — camera latency pushing the
  // release past the tap window — is still a tap: it never travelled.
  await reset();
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  hand({ ...BODY, gesture: 'PINCH_END' });
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  await wait(TAP_MAX_MS + 40);
  hand({ ...BODY, primary: true, gesture: 'PINCHING', intent: 'move' });
  hand({ ...BODY, gesture: 'DOUBLE_PINCH', intent: 'activate' });
  await settle();
  assert(
    activations().length === 1 && activations()[0].action === 'open',
    `a late activation frame still selects, saw ${JSON.stringify(actions())}`,
  );
  pass('A double pinch whose last frame arrives late still selects once');

  // --- drag -----------------------------------------------------------------
  await reset();
  const origin = { ...useSpatialStore.getState().windows.terminal.position };
  hand({ ...BODY, primary: true, gesture: 'PINCH_START' });
  const inside = { x: BODY.x + HAND_DRAG_DEAD_ZONE * 0.6, y: BODY.y };
  hand({ ...inside, primary: true, gesture: 'PINCHING', intent: 'move' });
  assert(!actions().includes('move'), 'inside the dead-zone, a hand pinch moves nothing');
  const past = { x: BODY.x + HAND_DRAG_DEAD_ZONE * 1.5, y: BODY.y };
  hand({ ...past, primary: true, gesture: 'PINCHING', intent: 'move' });
  const engaged = useSpatialStore.getState().windows.terminal.position;
  assert(
    Math.abs(engaged.x - origin.x) < 1e-9 && Math.abs(engaged.y - origin.y) < 1e-9,
    `leaving the dead-zone starts the drag without a jump, moved by ${engaged.x - origin.x}`,
  );
  const further = { x: past.x + 0.2, y: past.y };
  for (let i = 0; i < 3; i += 1) hand({ ...further, primary: true, gesture: 'PINCHING', intent: 'move' });
  assert(
    useSpatialStore.getState().windows.terminal.position.x > origin.x + 0.1,
    'and from there the window follows the hand',
  );
  assert(
    seen.filter((entry) => entry.action === 'move').every((entry) => entry.source === 'gesture'),
    'every move a hand makes is labelled "gesture"',
  );
  // A double pinch's activation arriving mid-drag is not a click.
  hand({ ...further, gesture: 'DOUBLE_PINCH', intent: 'activate' });
  await settle();
  assert(activations().length === 0, `dragging never activates, saw ${JSON.stringify(activations())}`);
  pass('5, 9. A hand drag waits out its dead-zone, then moves without a jump, and never activates');

  // --- confidence -----------------------------------------------------------
  await reset();
  const LOW = MIN_HAND_CONFIDENCE - 0.01;
  hand({ ...BODY, confidence: LOW });
  assert(cursor.armedId === null, 'a doubtful hand arms nothing');
  const focusedBefore = useSpatialStore.getState().focusedId;
  doublePinch(hand, BODY, LOW);
  await settle();
  assert(seen.length === 0, `a doubtful double pinch dispatches nothing at all, saw ${JSON.stringify(actions())}`);
  assert(useSpatialStore.getState().focusedId === focusedBefore, 'and focus does not move');

  await reset();
  hand({ ...CLOSE, confidence: LOW });
  assert(cursor.hoveredControl === 'close', `the ray is on the close control, got ${cursor.hoveredControl}`);
  hand({ ...CLOSE, confidence: LOW, primary: true, gesture: 'PINCH_START' });
  hand({ ...CLOSE, confidence: LOW, gesture: 'PINCH_END' });
  hand({ ...CLOSE, confidence: LOW, gesture: 'DOUBLE_PINCH', intent: 'activate' });
  await settle();
  assert(seen.length === 0, `a doubtful hand cannot close a window, saw ${JSON.stringify(actions())}`);
  assert(useSpatialStore.getState().windows.terminal.lifecycle !== 'closing', 'Terminal is still open');
  pass('4. Below the 0.6 floor, a hand cannot focus, close, minimize or activate');

  // --- no target ------------------------------------------------------------
  await reset();
  hand({ ...NOWHERE });
  assert(cursor.hoveredId === null, `the ray misses everything, got ${cursor.hoveredId}`);
  assert(cursor.armedId === null, 'nothing is armed');
  doublePinch(hand, NOWHERE);
  await settle();
  assert(activations().length === 0, `a double pinch on nothing activates nothing, saw ${JSON.stringify(actions())}`);
  assert(
    actions().every((action) => action === 'blur'),
    `a pinch on empty space still only means "blur", as it always has — saw ${JSON.stringify(actions())}`,
  );
  pass('5. A double pinch with no target does nothing');

  // --- stale referent -------------------------------------------------------
  await reset();
  hand({ ...NOWHERE });
  // Pointing that went quiet long ago; resting on the same window does not
  // refresh it, because only a change of target is recorded.
  notePointing('hand', 'terminal', 0.95, performance.now() - REFERENT_TTL_MS - 100);
  hand({ ...BODY });
  hand({ ...BODY, gesture: 'DOUBLE_PINCH', intent: 'activate' });
  await settle();
  assert(activations().length === 0, `an expired referent opens nothing, saw ${JSON.stringify(actions())}`);
  pass('6. A stale referent does nothing');

  // --- the deck -------------------------------------------------------------
  await reset();
  let deckChoices = 0;
  const release = interaction.claimActivation(() => {
    deckChoices += 1;
  });
  hand({ ...BODY });
  assert(cursor.armedId === null, 'with the deck up, the window beneath it is not armed');
  doublePinch(hand, BODY);
  for (let i = 0; i < 5; i += 1) interaction.update(camera, viewport);
  await settle();
  assert(deckChoices === 1, `the deck receives exactly one activation, got ${deckChoices}`);
  assert(seen.length === 0, `and the window beneath it receives nothing, saw ${JSON.stringify(actions())}`);
  release();

  await reset();
  doublePinch(hand, BODY);
  await settle();
  assert(deckChoices === 1, 'once released, the deck hears nothing more');
  assert(
    activations().length === 1 && activations()[0].action === 'open',
    `and the window's own air click is back, saw ${JSON.stringify(activations())}`,
  );
  pass('11. While the deck is up, one double pinch is exactly one choice on the deck');

  // --- mouse ----------------------------------------------------------------
  // The mouse outranks a hand's confidence, so it takes the pointer at once.
  inputRouter.unregister('hand');
  const mouse = device('mouse');
  await reset();
  const start = { ...useSpatialStore.getState().windows.terminal.position };
  mouse({ ...BODY });
  assert(cursor.armedId === null, 'mouse hover never arms a window');
  mouse({ ...BODY, primary: true });
  const nudge = { x: BODY.x + 0.01, y: BODY.y };
  mouse({ ...nudge, primary: true });
  mouse({ ...nudge });
  await settle();
  assert(
    seen.length > 0 && seen.every((entry) => entry.source === 'pointer'),
    `every mouse command stays "pointer", saw ${JSON.stringify(seen)}`,
  );
  assert(actions()[0] === 'focus', 'a click still focuses first');
  assert(
    useSpatialStore.getState().windows.terminal.position.x > start.x,
    'and a mouse drag still moves at once, with no dead-zone',
  );
  pass('2, 13. The mouse is unchanged: "pointer", immediate drag, no armed state');

  inputRouter.unregister('mouse');
  unregisterTarget('terminal');
  unsubscribe();
  stopMultimodal();
  stopEngine();
  clearInteractionContext();
}

// --- 16-17. the boundary -----------------------------------------------------

console.log('--- Boundary ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = engine.startContextEngine();

  // Recording a gesture must not touch spatial state by itself.
  clearInteractionContext();
  const before = JSON.stringify(useSpatialStore.getState().windows);
  notePointing('hand', 'browser', 0.95);
  noteSelection('hand', 'browser');
  assert(
    JSON.stringify(useSpatialStore.getState().windows) === before,
    'indicating a window changes no spatial state',
  );

  // The gesture layer's whole exported surface.
  const surface = { gestureIntent, performGestureIntent };
  for (const [name, value] of Object.entries(surface)) {
    assert(typeof value === 'function', `${name} is part of the gesture surface`);
  }
  for (const forbidden of ['openWindow', 'launch', 'perform', 'fetch', 'spawn', 'dispatch']) {
    assert(!(forbidden in surface), `the gesture layer exposes no "${forbidden}"`);
  }
  pass('The gesture layer expresses intent and cannot execute anything itself');

  stop();
  clearInteractionContext();
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} gesture assertions FAILED`);
}
console.log(`ALL ${checks} GESTURE ASSERTIONS PASSED! 🎉`);
console.log('========================================');
