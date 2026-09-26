/**
 * Phase 12 — the NOVA application portal.
 *
 * The portal reveals NOVA's *real* spatial windows: opening it issues ordinary
 * `open` commands, so what comes out of the Core is dragged, resized, pinched,
 * focused and closed by the window system that always did that. Deterministic:
 * phases are pure functions of state and an explicit time; activation runs
 * through the real interaction system with a real camera and raycast.
 */
import { Mesh, PerspectiveCamera, PlaneGeometry, SphereGeometry } from 'three';
import type { NovaCommand } from '../../types/command';
import { APP_ORDER } from '../../data/apps';
import { layerForApp } from '../../data/layers';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands, CLOSE_TRANSITION_MS } from '../command/commandBus';
import { cursor, interaction } from '../interaction/interactionSystem';
import { CORE_TARGET_ID, registerTarget, unregisterTarget } from '../interaction/targetRegistry';
import { presentWindow } from '../window/windowPresentation';
import { pulseProgress, startAmbience } from '../environment/ambience';
import { PORTAL_CLAIM, requestPortal, togglePortal } from './portal';
import {
  PORTAL_CLOSED,
  PORTAL_CLOSE_MS,
  PORTAL_OPEN_MS,
  isPortalApp,
  nextPortalState,
  portalApps,
  portalPhase,
  portalProgress,
  portalRevealDelay,
} from './portalModel';

const nodeFs = 'node:fs';
const { readFileSync } = (await import(nodeFs)) as {
  readFileSync: (path: string, encoding: string) => string;
};
// The bus schedules a closed window's removal on `window.setTimeout`.
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
const store = () => useSpatialStore.getState();
const close = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const live = () => Object.values(store().windows).filter((w) => w.lifecycle !== 'closing');
/** Closed windows are removed by the bus's timer; tests clear them directly. */
const sweep = () => {
  for (const [id, win] of Object.entries(store().windows)) if (win.lifecycle === 'closing') store().removeWindow(id);
};
const finishLayer = () => {
  if (store().layer.phase !== 'idle') store().completeLayerTransition();
};

console.log('\n=== NOVA Phase 12 · Application Portal ===\n');

// --- 1. the default state -------------------------------------------------------------

console.log('--- The clean first screen ---');
{
  assert(Object.keys(store().windows).length === 0, 'NOVA starts with no application windows open');
  assert(store().portal.open === false, 'the portal starts closed');
  assert(portalPhase(store().portal, performance.now()) === 'closed', "its phase is 'closed'");
  pass('The first screen is the environment and the portal');
}

// --- 2. the state model ------------------------------------------------------------------

console.log('--- Portal state transitions ---');
{
  const t0 = 1000;
  const opened = nextPortalState(PORTAL_CLOSED, true, t0);
  assert(portalPhase(opened, t0) === 'opening' && portalPhase(opened, t0 + PORTAL_OPEN_MS) === 'open', 'closed → opening → open');
  assert(close(portalProgress(opened, t0 + PORTAL_OPEN_MS / 2), 0.5), 'progress runs linearly with time');
  assert(nextPortalState(opened, true, t0 + 10) === opened, 'a repeated "open" changes nothing');
  const mid = t0 + PORTAL_OPEN_MS * 0.4;
  const closing = nextPortalState(opened, false, mid);
  assert(close(portalProgress(closing, mid), portalProgress(opened, mid)), 'reversing mid-bloom does not snap');
  assert(portalPhase(closing, mid + 1) === 'closing' && portalPhase(closing, mid + PORTAL_CLOSE_MS) === 'closed', 'closing → closed');
  pass('The portal\'s moment is deterministic and continuous');
}

// --- 3. the catalog ----------------------------------------------------------------------

console.log('--- The applications come from NOVA\'s catalog ---');
{
  assert(portalApps() === APP_ORDER, 'the portal reveals exactly APP_ORDER — not a second list');
  for (const bad of ['calculator', '__proto__', 'bash -c id', 'Browser', '']) assert(!isPortalApp(bad), `"${bad}" is not a portal application`);
  const sources = ['src/systems/portal/portalModel.ts', 'src/systems/portal/portal.ts', 'src/components/interface/PortalLayer.tsx'].map((f) => readFileSync(f, 'utf8'));
  assert(sources.every((src) => !/'(browser|code|files|notes|terminal)'/.test(src)), 'no portal file names an application itself');
  pass('One catalog');
}

// --- 4. the bloom reveals real windows -----------------------------------------------------

console.log('--- The bloom: NOVA\'s real spatial windows out of the Core ---');
{
  const seen: Array<{ command: NovaCommand }> = [];
  const off = subscribeToCommands((event) => seen.push(event));
  const layerBefore = store().layer.currentLayerIndex;
  const core = store().core.position;

  assert(requestPortal(true, 'pointer', null), 'the portal opens');
  const opens = seen.map((e) => e.command).filter((c): c is Extract<NovaCommand, { action: 'open' }> => c.action === 'open');
  assert(seen[0]?.command.action === 'portal', 'first the portal\'s intent, through the bus');
  assert(opens.length === APP_ORDER.length && opens.every((c, i) => c.target === APP_ORDER[i]), 'then an ordinary "open" for each application, in catalog order');
  assert(opens.every((c, i) => c.reveal?.delayMs === portalRevealDelay(i)), 'each marked as revealed, with its moment in the bloom');
  assert(opens.every((c, i) => i === 0 || (c.reveal?.delayMs ?? 0) > (opens[i - 1].reveal?.delayMs ?? 0)), 'staggered — one bloom, not five at once');

  const windows = APP_ORDER.map((app) => store().windows[app]);
  assert(windows.every(Boolean), 'five real windows exist in the one window store');
  assert(windows.every((w) => w.lifecycle === 'entering'), 'each entering, as any new window does');
  assert(windows.every((w) => w.origin && close(w.origin.x, core.x) && close(w.origin.y, core.y) && close(w.origin.z, core.z)), 'each coming out of the Core');
  assert(windows.every((w, i) => i === 0 || w.lifecycleAt > windows[i - 1].lifecycleAt), 'each leaving the Core in turn');
  assert(store().focusedId === null, 'none steals focus while they bloom');
  finishLayer();
  assert(store().layer.currentLayerIndex === layerBefore, 'the bloom does not move NOVA to another layer');

  const code = store().windows.code;
  const start = presentWindow(code, { dockOrder: [], corePosition: core, now: code.lifecycleAt, layerState: store().layer });
  assert(close(start.position.x, core.x, 1e-3) && close(start.position.y, core.y, 1e-3) && start.scale < 0.2, 'entering, a window starts compressed at the Core');
  const home = presentWindow({ ...store().windows.browser, lifecycle: 'settled' }, { dockOrder: [], corePosition: core, now: 0, layerState: store().layer });
  assert(close(home.position.x, store().windows.browser.position.x) && home.opacity === 1, 'and settles at its place in the room');
  const behind = presentWindow({ ...code, lifecycle: 'settled' }, { dockOrder: [], corePosition: core, now: 0, layerState: store().layer });
  assert(layerForApp('code') !== layerBefore && behind.position.z < code.position.z, 'an application of another layer settles behind (Phase 13)');

  assert(interaction.activationOwner() === null, 'the portal holds no hand claim — pinches and air clicks reach the windows');
  assert(requestPortal(true, 'pointer', null) && live().length === APP_ORDER.length, 'opening again reveals nothing twice');
  off();
  pass('Opening the portal is five ordinary opens: real windows, staggered, out of the Core');
}

// --- 5. they are real windows: they drag, resize, minimise ----------------------------------

console.log('--- Once out, each is a real NOVA window ---');
{
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const viewport = { width: 1280, height: 800 };
  // Terminal's physical slab, where its view would register it.
  const slab = new Mesh(new PlaneGeometry(4, 3));
  slab.updateMatrixWorld(true);
  registerTarget('terminal', 'window', slab);
  const frame = { x: 0, y: 0, primary: false, present: true, depthDelta: 0, modifiers: { shift: false, alt: false, meta: false }, confidence: 1 };
  store().patchWindow('terminal', { lifecycle: 'settled' });
  const before = { ...store().windows.terminal.position };

  interaction.submit(frame);
  interaction.update(camera, viewport);
  assert(cursor.hoveredId === 'terminal', 'the pointer lands on a revealed window');
  interaction.submit({ ...frame, primary: true });
  interaction.update(camera, viewport);
  assert(store().focusedId === 'terminal', 'pressing it focuses it');
  interaction.submit({ ...frame, primary: true, x: 0.25, y: 0.1 });
  for (let i = 0; i < 4; i++) interaction.update(camera, viewport);
  interaction.submit({ ...frame, primary: false, x: 0.25, y: 0.1 });
  interaction.update(camera, viewport);
  const after = store().windows.terminal.position;
  assert(after.x !== before.x || after.y !== before.y, `dragging it moves it (${before.x.toFixed(2)} → ${after.x.toFixed(2)})`);
  unregisterTarget('terminal');

  const scaleBefore = store().windows.notes.scale;
  dispatch({ action: 'scale', target: 'notes', delta: 0.1 }, 'pointer');
  assert(store().windows.notes.scale > scaleBefore, 'it resizes through the ordinary scale command');
  dispatch({ action: 'minimize', target: 'files' }, 'gesture');
  assert(store().windows.files.minimized, 'it minimises');
  dispatch({ action: 'restore', target: 'files' }, 'gesture');
  assert(!store().windows.files.minimized, 'and restores');
  pass('Drag, focus, resize, minimise and restore reach revealed windows unchanged');
}

// --- 6. gathering them back ------------------------------------------------------------------

console.log('--- Gathering back into the Core ---');
await (async () => {
  const core = store().core.position;
  assert(togglePortal('pointer', null), 'pressing the Core with applications out gathers them');
  assert(live().length === 0, 'every window is folding away');
  assert(!store().portal.open, 'and the portal is closed');
  const notes = store().windows.notes;
  const end = presentWindow(notes, { dockOrder: [], corePosition: core, now: notes.lifecycleAt + CLOSE_TRANSITION_MS + 1, layerState: store().layer });
  assert(close(end.position.x, core.x, 1e-3) && close(end.position.y, core.y, 1e-3) && end.scale < 0.1 * notes.scale && end.expired, 'each folds back into the Core');

  // Straight back out, before the close timers have fired.
  assert(togglePortal('pointer', null), 'pressing again brings them straight back out');
  assert(live().length === APP_ORDER.length, 'all five');
  await new Promise((resolve) => setTimeout(resolve, CLOSE_TRANSITION_MS + 60));
  assert(live().length === APP_ORDER.length, 'and the earlier close does not remove the windows that replaced them');
  requestPortal(false, 'pointer', PORTAL_CLAIM);
  sweep();

  // Windows that did not come from the portal are gathered too — the Core reads the room.
  dispatch({ action: 'open', target: 'notes' }, 'voice');
  finishLayer();
  assert(togglePortal('keyboard', null) && live().length === 0, 'the Core gathers whatever is out, however it was opened');
  sweep();
  pass('The applications fold back into the Core, and the Core always knows which way to go');
})();

// --- 7. activation, through the real interaction system -----------------------------------

console.log('--- Pointer, air click and keyboard ---');
{
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const coreMesh = new Mesh(new SphereGeometry(0.6, 12, 8));
  coreMesh.updateMatrixWorld(true);
  registerTarget(CORE_TARGET_ID, 'core', coreMesh);
  const viewport = { width: 1280, height: 800 };
  const frame = { x: 0, y: 0, primary: false, present: true, depthDelta: 0, modifiers: { shift: false, alt: false, meta: false }, confidence: 1 };
  const press = () => {
    interaction.submit({ ...frame, primary: true });
    interaction.update(camera, viewport);
    interaction.submit({ ...frame, primary: false });
    interaction.update(camera, viewport);
  };
  interaction.submit(frame);
  interaction.update(camera, viewport);
  assert(cursor.hoveredId === CORE_TARGET_ID, 'the raycast really lands on the Core');

  press();
  assert(live().length === APP_ORDER.length && store().portal.open, 'a pointer press on the Core brings the applications out');
  assert(store().commandOpen === false, 'and does not open the command line');
  press();
  assert(live().length === 0, 'pressing again gathers them');
  sweep();

  interaction.submit({ ...frame, confidence: 0.95, gesture: 'DOUBLE_PINCH', intent: 'activate' as const });
  for (let i = 0; i < 5; i++) interaction.update(camera, viewport);
  interaction.submit({ ...frame, confidence: 0.95, gesture: 'POINT', intent: 'default' as const });
  interaction.update(camera, viewport);
  assert(live().length === APP_ORDER.length, 'an air click (double pinch) on the Core brings them out');
  requestPortal(false, 'system', PORTAL_CLAIM);
  sweep();

  const release = interaction.claimActivation(() => {}, 'deck');
  press();
  assert(live().length === 0, 'while the Command Deck holds the hand, the Core does not open the portal');
  assert(togglePortal('keyboard', interaction.activationOwner()) === false, 'nor does the keyboard');
  release();
  unregisterTarget(CORE_TARGET_ID);

  const system = readFileSync('src/systems/interaction/interactionSystem.ts', 'utf8');
  const keys = readFileSync('src/systems/input/keyboardCommands.ts', 'utf8');
  assert((system.match(/togglePortal\(/g) ?? []).length === 2, 'pointer press and air click call the one togglePortal');
  assert(!system.includes('requestPortal(false'), 'pressing the empty room only blurs — it never gathers the user\'s windows');
  assert(keys.includes("togglePortal('keyboard', interaction.activationOwner())") && !keys.includes('requestPortal('), 'O / Space toggle; Escape only blurs, as before');
  pass('One implementation for every input, respecting the Command Deck');
}

// --- 8. Phase 13 is preserved ----------------------------------------------------------------

console.log('--- Spatial layers (Phase 13) ---');
{
  const before = store().layer.currentLayerIndex;
  const target = layerForApp('code');
  dispatch({ action: 'open', target: 'code' }, 'voice');
  assert(store().layer.targetLayerIndex === target && target !== before, 'an ordinary "open" still moves NOVA to the application\'s layer');
  finishLayer();
  dispatch({ action: 'layer-go', target: before }, 'system');
  finishLayer();
  requestPortal(false, 'system', PORTAL_CLAIM);
  sweep();
  pass('Only a portal reveal leaves the layer where it is');
}

// --- 9. the room, the architecture ---------------------------------------------------------

console.log('--- The room answers; nothing else was rebuilt ---');
{
  const stop = startAmbience();
  requestPortal(true, 'pointer', null);
  assert(pulseProgress('open', performance.now()) !== null, 'opening sends the opening wave through the room');
  requestPortal(false, 'pointer', PORTAL_CLAIM);
  assert(pulseProgress('settle', performance.now()) !== null, 'gathering settles it');
  stop();
  sweep();

  const bus = readFileSync('src/systems/command/commandBus.ts', 'utf8');
  assert(bus.includes('store.openWindow(command.target, command.reveal)'), 'a reveal is an ordinary open, through the bus');
  assert(bus.includes("case 'portal': {") && bus.includes('store.setPortal(command.open)'), 'the bus is the only thing that changes the portal');
  const portal = readFileSync('src/systems/portal/portal.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/useSpatialStore\.setState|openWindow\(|patchWindow|fetch\(|nativeBridge|launch/.test(portal), 'the portal writes no store, launches nothing, has no I/O — it only dispatches');
  const layer = readFileSync('src/components/interface/PortalLayer.tsx', 'utf8');
  assert(!/<button|claimActivation|portal__item/.test(layer), 'no second set of application controls over the room');
  const driver = readFileSync('src/components/spatial/PortalDriver.tsx', 'utf8');
  assert(!driver.includes('useState') && !/new Vector3\(/.test(driver.split('export function PortalDriver')[1].split('/** Reused')[0]), 'the portal frame loop allocates nothing and sets no React state');
  const model = readFileSync('src/systems/portal/portalModel.ts', 'utf8');
  assert(!/swipe|activeLayer|LayerState/.test(model + driver + layer), 'no new layer machinery');

  const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let negative = false;
  for (const ch of css) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) negative = true;
    }
  }
  assert(depth === 0 && !negative, `index.css braces balance (depth ${depth})`);
  assert(/\.portal__glow \{/.test(css) && /\.core-label__body \{/.test(css), 'the portal glow and caption rules are present');
  pass('The Phase 11 room reacts; the window, gesture and command systems are the existing ones');
}

console.log('\n========================================');
if (failures) {
  console.log(`✗ ${failures} of ${checks} portal assertions failed`);
  throw new Error(`${failures} of ${checks} portal assertions FAILED`);
}
console.log(`ALL ${checks} PORTAL ASSERTIONS PASSED! 🎉`);
