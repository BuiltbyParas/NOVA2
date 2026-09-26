/**
 * NOVA Demo Mode — the showcase is deterministic, uses only existing paths,
 * never reaches the model, and puts everything back.
 *
 * Driven by a manual clock: each beat is released explicitly, so nothing here
 * depends on real timing.
 */
import type { NovaCommand } from '../../types/command';
import { useSpatialStore } from '../../state/spatialStore';
import { subscribeToCommands } from '../command/commandBus';
import { setIntelligenceTransport, useIntelligenceStore } from '../intelligence/intelligenceSession';
import {
  DEMO_APP,
  DEMO_BEATS,
  DEMO_DURATION_MS,
  DEMO_INSTRUCTION,
  cancelDemo,
  startDemo,
  useDemoStore,
  type DemoScheduler,
} from './demo';

const nodeFs = 'node:fs';
const { readFileSync } = (await import(nodeFs)) as {
  readFileSync: (path: string, encoding: string) => string;
};

// The bus schedules a closed window's removal on `window.setTimeout`. Under Node
// the global scope provides the same timer, as other suites provide their globals.
(globalThis as unknown as { window?: typeof globalThis }).window ??= globalThis;

let failures = 0;
let checks = 0;
function assert(condition: boolean, message: string) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.log(`  ✗ ${message}`);
}
function pass(message: string) {
  console.log(`  ✓ ${message}`);
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const spatial = () => useSpatialStore.getState();

/** A manual clock: timers run only when time is advanced past them. */
function manualClock(finishLayers = true) {
  let now = 0;
  let timers: Array<{ at: number; run: () => void; live: boolean }> = [];
  const schedule: DemoScheduler = (run, ms) => {
    const timer = { at: now + ms, run, live: true };
    timers.push(timer);
    return () => {
      timer.live = false;
    };
  };
  const advanceTo = async (t: number) => {
    for (;;) {
      const due = timers.filter((timer) => timer.live && timer.at <= t).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.live = false;
      now = due.at;
      due.run();
      await settle();
      // The frame loop finishes layer transitions as time passes; the clock does too.
      if (finishLayers && spatial().layer.phase !== 'idle') spatial().completeLayerTransition();
    }
    now = t;
    timers = timers.filter((timer) => timer.live);
  };
  return { schedule, advanceTo, pending: () => timers.filter((timer) => timer.live).length };
}

/** Closing windows are removed by their view after the transition; tests do it. */
const sweepClosed = () => {
  for (const [id, win] of Object.entries(spatial().windows)) {
    if (win.lifecycle === 'closing') spatial().removeWindow(id);
  }
};

let modelCalls = 0;
setIntelligenceTransport(async () => {
  modelCalls += 1;
  return { error: 'network' };
});

const seen: NovaCommand[] = [];
subscribeToCommands(({ command }) => seen.push(command));

console.log('\n=== NOVA Demo Mode ===\n');

// --- 1. the whole showcase ---------------------------------------------------------

console.log('--- The showcase, beat by beat ---');
{
  const clock = manualClock();
  const before = { windows: Object.keys(spatial().windows).length, layer: spatial().layer.currentLayerIndex };
  const messagesBefore = useIntelligenceStore.getState().messages.length;

  assert(DEMO_BEATS.length >= 6, 'the script has its beats');
  assert(DEMO_BEATS.every((beat, i) => i === 0 || beat.at > DEMO_BEATS[i - 1].at), 'beats are in time order');
  assert(DEMO_DURATION_MS >= 20000 && DEMO_DURATION_MS <= 30000, `it lasts 20–30 seconds (${DEMO_DURATION_MS} ms)`);

  assert(startDemo(clock.schedule), 'the demo starts');
  assert(useDemoStore.getState().running, 'and says it is running');
  assert(!startDemo(clock.schedule), 'a second start while running is refused');

  await clock.advanceTo(DEMO_BEATS[0].at);
  assert(spatial().core.state === 'working', '1 · the Core wakes');
  assert(seen.some((c) => c.action === 'core' && c.state === 'working'), '   through the command bus');

  await clock.advanceTo(DEMO_BEATS[1].at);
  assert(spatial().portal.open, '2 · the portal opens');
  assert(Object.values(spatial().windows).filter((w) => w.origin).length === 5, '   and NOVA\'s five real windows bloom out of the Core');

  seen.length = 0;
  await clock.advanceTo(DEMO_BEATS[2].at);
  assert(seen.some((c) => c.action === 'focus' && c.target === DEMO_APP), `3 · "focus ${DEMO_APP}" reaches the bus — saw ${JSON.stringify(seen)}`);
  assert(spatial().focusedId === DEMO_APP, '   and Browser takes focus, as a real window does');

  const layerBefore = spatial().layer.currentLayerIndex;
  await clock.advanceTo(DEMO_BEATS[3].at);
  assert(spatial().layer.currentLayerIndex === layerBefore + 1, '4 · a spatial layer transition runs (Phase 13)');

  await clock.advanceTo(DEMO_BEATS[4].at);
  assert(useIntelligenceStore.getState().open, '5 · the Intelligence Surface opens');

  await clock.advanceTo(DEMO_BEATS[5].at);
  const messages = useIntelligenceStore.getState().messages;
  const asked = messages.find((m) => m.role === 'user' && m.text === DEMO_INSTRUCTION);
  const answered = messages.at(-1);
  assert(Boolean(asked), `6 · NOVA is asked "${DEMO_INSTRUCTION}"`);
  assert(answered?.role === 'nova' && answered.action?.outcome === 'done', '   and answers, having carried it out');
  assert(Boolean(spatial().windows.terminal), '   the terminal really opened');
  assert(modelCalls === 0, 'no call reached the model — the demo is deterministic');

  await clock.advanceTo(DEMO_BEATS[DEMO_BEATS.length - 1].at);
  const closing = ['terminal', DEMO_APP].every((id) => !spatial().windows[id] || spatial().windows[id].lifecycle === 'closing');
  assert(closing, '7 · the windows the demo opened are closing');
  assert(!spatial().portal.open, '   the portal is closed');
  assert(spatial().core.state === 'idle', '   the Core is idle');
  assert(useIntelligenceStore.getState().messages.length === messagesBefore, '   the conversation has only its own lines again');
  assert(!useIntelligenceStore.getState().open, '   the Intelligence Surface is back as it was');

  await clock.advanceTo(DEMO_DURATION_MS);
  assert(spatial().layer.currentLayerIndex === before.layer, '   the layer is back where it was');
  assert(!useDemoStore.getState().running, 'the demo ends by itself');
  assert(clock.pending() === 0, 'and leaves no timer behind');
  sweepClosed();
  assert(Object.keys(spatial().windows).length === before.windows, 'the room is as it was before the demo');
  pass('Core → portal → bloom → open → layer → intelligence → back to idle, deterministically');
}

// --- 2. cancelling ---------------------------------------------------------------------

console.log('--- Cancelling ---');
{
  const clock = manualClock();
  startDemo(clock.schedule);
  await clock.advanceTo(DEMO_BEATS[3].at + 10);
  assert(Boolean(spatial().windows[DEMO_APP]), 'mid-demo, its application is open');
  cancelDemo();
  await settle();
  if (spatial().layer.phase !== 'idle') spatial().completeLayerTransition();
  assert(!useDemoStore.getState().running, 'cancel stops it at once');
  assert(clock.pending() === 0, 'every remaining beat is cancelled');
  seen.length = 0;
  await clock.advanceTo(DEMO_DURATION_MS * 2);
  assert(seen.length === 0 && !useIntelligenceStore.getState().open, 'no later beat runs after cancelling');
  assert(spatial().windows.terminal?.lifecycle === 'closing', 'the windows it brought out are folding back');
  assert(!spatial().portal.open && spatial().core.state === 'idle', 'the portal is closed and the Core idle');
  assert(spatial().layer.currentLayerIndex === 0, 'the layer is back');
  assert(spatial().windows[DEMO_APP]?.lifecycle === 'closing', 'its application is folding away');
  sweepClosed();
  cancelDemo();
  assert(!useDemoStore.getState().running, 'cancelling when nothing runs is harmless');
  pass('Escape (or the trigger) stops the demo and puts everything back');
}

console.log('--- Cancelling in the middle of a layer transition ---');
{
  // As in the running app: the layer transition takes time, and Phase 13
  // ignores layer commands until it has finished.
  const clock = manualClock(false);
  startDemo(clock.schedule);
  await clock.advanceTo(DEMO_BEATS[3].at);
  assert(spatial().layer.phase === 'transitioning', 'the demo is cancelled while the layer is still moving');
  cancelDemo();
  await settle();
  spatial().completeLayerTransition(); // the frame loop finishes the outgoing transition…
  await settle();
  assert(spatial().layer.phase === 'transitioning' && spatial().layer.targetLayerIndex === 0, '…and then the demo asks to go back');
  spatial().completeLayerTransition(); // …which the frame loop also finishes
  assert(spatial().layer.currentLayerIndex === 0 && spatial().layer.phase === 'idle', 'NOVA is back on its first layer');
  sweepClosed();
  pass('A cancel mid-transition still returns NOVA to where it was');
}

// --- 3. what was already there stays ------------------------------------------------------

console.log('--- The user\'s own work is untouched ---');
{
  const { dispatch } = await import('../command/commandBus');
  dispatch({ action: 'open', target: 'notes' }, 'pointer');
  dispatch({ action: 'focus', target: 'notes' }, 'pointer');
  if (spatial().layer.phase !== 'idle') spatial().completeLayerTransition();
  const clock = manualClock();
  startDemo(clock.schedule);
  await clock.advanceTo(DEMO_DURATION_MS);
  sweepClosed();
  assert(Boolean(spatial().windows.notes) && spatial().windows.notes.lifecycle !== 'closing', 'a window the user had open is still open');
  assert(spatial().focusedId === 'notes', 'and still focused');
  assert(Object.keys(spatial().windows).length === 1, 'only the demo\'s own windows were closed');
  pass('The demo removes only what it added');
}

// --- 4. the architecture ----------------------------------------------------------------

console.log('--- Existing paths only ---');
{
  const source = readFileSync('src/systems/demo/demo.ts', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/useSpatialStore\.setState|patchWindow|openWindow|setPortal\(|goToLayer|navigateLayer/.test(code), 'it never writes the spatial store directly');
  assert(!/fetch\(|setIntelligenceTransport|nativeBridge|child_process/.test(code), 'no network, no model, no native calls, no transport swap');
  assert(code.includes('requestPortal(true') && code.includes('routeUtterance(`focus ${DEMO_APP}`') && code.includes('converse(DEMO_INSTRUCTION'), 'it opens through the portal, focuses through routeUtterance and asks through converse');
  assert(code.includes("dispatch({ action: 'layer', direction: 'next' }"), 'the layer change is the Phase 13 command');
  const layer = readFileSync('src/components/interface/DemoLayer.tsx', 'utf8');
  assert(layer.includes("event.key !== 'Escape'") && layer.includes('cancelDemo()'), 'Escape cancels');
  assert(layer.includes('Explore NOVA') && layer.includes('aria-pressed'), 'there is an accessible Explore NOVA trigger');
  pass('A script over existing entry points — nothing mocked, nothing bypassed');
}

console.log('\n========================================');
if (failures) {
  console.log(`✗ ${failures} of ${checks} demo assertions failed`);
  throw new Error(`${failures} of ${checks} demo assertions FAILED`);
}
console.log(`ALL ${checks} DEMO ASSERTIONS PASSED! 🎉`);
