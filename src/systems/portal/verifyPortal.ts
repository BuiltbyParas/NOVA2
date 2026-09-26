/**
 * Phase 12 — the NOVA application portal.
 *
 * Deterministic: the portal's phases and motion are pure functions of its state
 * and an explicit time, so nothing here waits on an animation. Activation is
 * exercised through the real interaction system with a real camera and a real
 * raycast target, selection through the real command router and bus.
 */
import { Mesh, PerspectiveCamera, SphereGeometry } from 'three';
import type { NovaCommand } from '../../types/command';
import { APP_ORDER, APPS, genericAppFor } from '../../data/apps';
import { useSpatialStore } from '../../state/spatialStore';
import { subscribeToCommands } from '../command/commandBus';
import { cursor, interaction } from '../interaction/interactionSystem';
import { CORE_TARGET_ID, registerTarget, unregisterTarget } from '../interaction/targetRegistry';
import { presentWindow } from '../window/windowPresentation';
import { pulseProgress, startAmbience } from '../environment/ambience';
import { PORTAL_CLAIM, requestPortal, selectPortalApp, togglePortal } from './portal';
import {
  PORTAL_CLOSED,
  PORTAL_CLOSE_MS,
  PORTAL_OPEN_MS,
  isPortalApp,
  nextPortalState,
  portalApps,
  portalPhase,
  portalPose,
  portalProgress,
  portalSeat,
  portalStillPose,
  portalTravel,
  portalUtterance,
  type PortalPose,
} from './portalModel';

/** Files are read the way the other suites read them (see verifyEnvironment). */
const nodeFs = 'node:fs';
const { readFileSync } = (await import(nodeFs)) as {
  readFileSync: (path: string, encoding: string) => string;
};

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
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const store = () => useSpatialStore.getState();
const close = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

console.log('\n=== NOVA Phase 12 · Application Portal ===\n');

// --- 1. the default state ---------------------------------------------------------------

console.log('--- The clean first screen ---');
{
  assert(Object.keys(store().windows).length === 0, 'NOVA starts with no application windows open');
  assert(store().order.length === 0, 'and nothing in the recency order');
  assert(store().portal.open === false, 'the portal starts closed');
  assert(portalPhase(store().portal, performance.now()) === 'closed', "and its phase is 'closed'");
  pass('The first screen is the environment and the portal, not five windows');
}

// --- 2. the state model -----------------------------------------------------------------

console.log('--- Portal state transitions ---');
{
  const t0 = 1000;
  const opened = nextPortalState(PORTAL_CLOSED, true, t0);
  assert(opened.open && opened.at === t0 && opened.from === 0, 'opening records the intent, the time, and where it started');
  assert(portalPhase(opened, t0) === 'opening', "just after opening, the phase is 'opening'");
  assert(portalPhase(opened, t0 + PORTAL_OPEN_MS / 2) === 'opening', 'half-way through, still opening');
  assert(portalPhase(opened, t0 + PORTAL_OPEN_MS) === 'open', "after the bloom, the phase is 'open'");
  assert(close(portalProgress(opened, t0 + PORTAL_OPEN_MS / 2), 0.5), 'progress runs linearly with time');

  let last = -1;
  let monotonic = true;
  for (let t = 0; t <= PORTAL_OPEN_MS; t += 50) {
    const p = portalProgress(opened, t0 + t);
    if (p < last) monotonic = false;
    last = p;
  }
  assert(monotonic, 'opening never runs backwards');

  assert(nextPortalState(opened, true, t0 + 10) === opened, 'a repeated "open" changes nothing — the bloom does not restart');

  // Reversal half-way through the bloom is continuous.
  const mid = t0 + PORTAL_OPEN_MS * 0.4;
  const before = portalProgress(opened, mid);
  const closing = nextPortalState(opened, false, mid);
  assert(close(closing.from, before), 'closing mid-bloom starts from exactly where the bloom was');
  assert(close(portalProgress(closing, mid), before), 'so nothing snaps at the reversal');
  assert(portalPhase(closing, mid + 1) === 'closing', "and the phase is 'closing'");
  assert(portalPhase(closing, mid + before * PORTAL_CLOSE_MS) === 'closed', 'it folds away in proportion to how far it had opened');

  const settled = nextPortalState(opened, false, t0 + PORTAL_OPEN_MS * 2);
  assert(settled.from === 1 && portalPhase(settled, t0 + PORTAL_OPEN_MS * 2 + PORTAL_CLOSE_MS) === 'closed', 'a fully open portal closes in PORTAL_CLOSE_MS');
  assert(PORTAL_CLOSE_MS < PORTAL_OPEN_MS, 'closing is quicker than opening — it is a gathering, not a second show');
  pass('closed → opening → open → closing → closed, deterministic and continuous');
}

// --- 3. the catalog ----------------------------------------------------------------------

console.log('--- The applications come from NOVA\'s catalog ---');
{
  assert(portalApps() === APP_ORDER, 'the portal offers exactly APP_ORDER — not a second list');
  assert(portalApps().every((app) => isPortalApp(app) && Boolean(APPS[app])), 'every offered application is defined in APPS');
  for (const app of portalApps()) {
    assert(genericAppFor(portalUtterance(app).replace(/^open /, '')) === app, `"${portalUtterance(app)}" resolves back to ${app}`);
  }
  for (const bad of ['calculator', '__proto__', 'constructor', 'bash -c id', 'Browser', '', 'spotify; rm -rf /']) {
    assert(!isPortalApp(bad), `"${bad}" is not an application the portal offers`);
  }
  const sources = ['portalModel.ts', 'portal.ts'].map((f) => readFileSync(`src/systems/portal/${f}`, 'utf8'));
  sources.push(readFileSync('src/components/interface/PortalLayer.tsx', 'utf8'));
  assert(sources.every((src) => !/'(browser|code|files|notes|terminal)'/.test(src)), 'no portal file names an application itself');
  pass('One catalog: APP_ORDER / APPS');
}

// --- 4. where the applications settle, and how they travel -------------------------------

console.log('--- Seats and the bloom ---');
{
  const count = portalApps().length;
  const seats = portalApps().map((_, i) => portalSeat(i, count));
  assert(seats[0].x === 0 || close(seats[0].x, 0), 'the first application sits directly above the Core');
  assert(seats.every((s) => s.y > 0), 'every seat is above the Core — the bloom opens upwards');
  for (let i = 1; i + 1 < count; i += 2) {
    assert(close(seats[i].x, -seats[i + 1].x) && close(seats[i].y, seats[i + 1].y), `seats ${i} and ${i + 1} mirror each other`);
  }
  const keys = new Set(seats.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
  assert(keys.size === count, 'no two applications share a seat');
  const depths = new Set(seats.map((s) => s.z.toFixed(3)));
  assert(depths.size >= 3, 'the seats occupy several depths, not one flat plane');
  assert(seats[0].z < seats[count - 1].z, 'higher seats sit further back, lower ones nearer the viewer');
  const deeper = portalSeat(2, count, 1.5);
  assert(close(deeper.x, seats[2].x) && close(deeper.y, seats[2].y) && close(deeper.z, seats[2].z - 1.5), 'a depth offset moves a seat straight back and nothing else');

  const pose: PortalPose = { x: 0, y: 0, z: 0, scale: 0, opacity: 0, travel: 0 };
  portalPose(0, 0, count, true, pose);
  assert(close(pose.x, 0) && close(pose.y, 0) && close(pose.z, 0), 'at the start every application is at the heart of the Core');
  assert(pose.opacity === 0 && pose.scale < 0.2, 'compressed and not yet visible');
  for (let i = 0; i < count; i++) {
    portalPose(1, i, count, true, pose);
    assert(close(pose.x, seats[i].x) && close(pose.y, seats[i].y) && close(pose.z, seats[i].z), `fully open, application ${i} is at its seat`);
    assert(close(pose.scale, 1) && pose.opacity === 1, `at full size and fully visible`);
  }
  // Mid-flight, the path swings towards the viewer: brought forward, not slid across.
  let forward = false;
  for (let p = 0.2; p < 0.9; p += 0.05) {
    portalPose(p, 0, count, true, pose);
    if (pose.z > seats[0].z + 0.2) forward = true;
  }
  assert(forward, 'in flight an application swings towards the viewer before settling back');

  // One bloom, one clock, staggered.
  assert(portalTravel(0.4, 0, count) > portalTravel(0.4, count - 1, count), 'the first application leaves before the last');
  assert(portalTravel(0.1, 0, count) === 0, 'nothing leaves while the Core is gathering itself');
  // Closing runs the same function backwards: the last out is the first home.
  assert(portalTravel(0.3, count - 1, count) < portalTravel(0.3, 0, count), 'folding back, the last application out is the first home');

  portalStillPose(0.5, 1, count, pose);
  assert(close(pose.x, seats[1].x) && pose.scale === 1 && close(pose.opacity, 0.5), 'under reduced motion an application fades in at its seat, without travelling');
  pass('Every application comes out of the Core, along one staggered bloom, to a seat in depth');
}

// --- 5. selection --------------------------------------------------------------------------

console.log('--- Choosing an application ---');
await (async () => {
  const seen: NovaCommand[] = [];
  const unsubscribe = subscribeToCommands(({ command }) => seen.push(command));

  assert(selectPortalApp('notes', 'pointer') === false, 'nothing can be chosen while the portal is closed');
  assert(seen.length === 0, 'and nothing reached the bus');

  assert(requestPortal(true, 'pointer', null), 'the portal opens on request');
  assert(store().portal.open, 'its intent is open');
  assert(seen.at(-1)?.action === 'portal', 'through the command bus');

  for (const bad of ['calculator', 'bash -c id', '__proto__']) {
    seen.length = 0;
    let refused = false;
    try {
      refused = selectPortalApp(bad, 'pointer') === false;
    } catch {
      refused = false;
    }
    assert(refused, `an invalid choice (${bad}) is refused cleanly`);
    assert(seen.length === 0 && store().portal.open, 'nothing is dispatched and the portal stays open');
  }

  seen.length = 0;
  assert(selectPortalApp('notes', 'pointer'), 'choosing Notes is accepted');
  await settle();
  await settle();
  assert(store().portal.open === false, 'the portal folds away as the choice is made');
  const portalAt = seen.findIndex((c) => c.action === 'portal' && !c.open);
  const openAt = seen.findIndex((c) => c.action === 'open' && c.target === 'notes');
  assert(portalAt >= 0 && openAt > portalAt, `it closes first, then "open notes" reaches the bus — saw ${JSON.stringify(seen)}`);
  const notes = store().windows.notes;
  assert(Boolean(notes), 'the Notes window exists, created by the ordinary open path');
  assert(Boolean(notes?.origin), 'and it records the Core as where it came from');
  if (notes?.origin) {
    const core = store().core.position;
    assert(close(notes.origin.x, core.x) && close(notes.origin.y, core.y) && close(notes.origin.z, core.z), 'its origin is the Core');
    const start = presentWindow({ ...notes, lifecycle: 'entering', lifecycleAt: 0 }, { dockOrder: [], corePosition: core, now: 0 });
    assert(close(start.position.x, core.x) && close(start.position.y, core.y) && start.scale < 0.2 * notes.scale, 'entering, it starts compressed at the Core');
  }

  const source = readFileSync('src/systems/portal/portal.ts', 'utf8');
  assert(source.includes('void routeUtterance(portalUtterance(id), source)'), 'selection goes through routeUtterance — the resolver, catalog and native safety apply');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/nativeBridge|launch|fetch\(|child_process|exec\(/.test(code), 'the portal has no launcher and no I/O of its own');
  unsubscribe();
  pass('A choice closes the portal and becomes "open <name>" on the ordinary command path');
})();

// --- 6. activation: pointer and air click, one implementation ---------------------------

console.log('--- Pointer and air-click activation ---');
await (async () => {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const core = new Mesh(new SphereGeometry(0.6, 12, 8));
  core.updateMatrixWorld(true);
  registerTarget(CORE_TARGET_ID, 'core', core);
  const viewport = { width: 1280, height: 800 };
  const frame = {
    x: 0, y: 0, primary: false, present: true, depthDelta: 0,
    modifiers: { shift: false, alt: false, meta: false }, confidence: 1,
  };
  const render = (n = 3) => {
    for (let i = 0; i < n; i++) interaction.update(camera, viewport);
  };
  if (store().portal.open) requestPortal(false, 'system', null);

  interaction.submit(frame);
  render();
  assert(cursor.hoveredId === CORE_TARGET_ID, `the raycast really lands on the Core, got ${cursor.hoveredId}`);

  // Pointer: press and release on the Core.
  interaction.submit({ ...frame, primary: true });
  render(1);
  interaction.submit({ ...frame, primary: false });
  render(1);
  assert(store().portal.open, 'pressing the Core with the pointer opens the portal');
  assert(store().commandOpen === false, 'and no longer opens the command line (that stays on ⌘K and the NOVA marks)');

  interaction.submit({ ...frame, primary: true });
  render(1);
  interaction.submit({ ...frame, primary: false });
  render(1);
  assert(store().portal.open === false, 'pressing it again folds the portal away');

  // Air click: the existing double pinch, through the existing activation path.
  const pinch = { ...frame, confidence: 0.95, gesture: 'DOUBLE_PINCH', intent: 'activate' as const };
  interaction.submit(pinch);
  render(5);
  interaction.submit({ ...frame, confidence: 0.95, gesture: 'POINT', intent: 'default' as const });
  render(3);
  assert(store().portal.open, 'an air click on the Core opens the portal');
  requestPortal(false, 'system', null);

  // The Command Deck owns the hand while it is up: the portal will not take it.
  const release = interaction.claimActivation(() => {}, 'deck');
  assert(interaction.activationOwner() === 'deck', 'the deck names itself as the claimant');
  interaction.submit({ ...frame, primary: true });
  render(1);
  interaction.submit({ ...frame, primary: false });
  render(1);
  assert(store().portal.open === false, 'while the Command Deck holds the hand, pressing the Core does not open the portal');
  assert(togglePortal('keyboard', interaction.activationOwner()) === false, 'nor does the keyboard');
  release();
  assert(interaction.activationOwner() === null, 'releasing the claim leaves nobody holding the hand');
  assert(requestPortal(false, 'gesture', PORTAL_CLAIM), 'the portal can always be closed, by its own claim');

  unregisterTarget(CORE_TARGET_ID);
  const system = readFileSync('src/systems/interaction/interactionSystem.ts', 'utf8');
  const keys = readFileSync('src/systems/input/keyboardCommands.ts', 'utf8');
  const layer = readFileSync('src/components/interface/PortalLayer.tsx', 'utf8');
  assert(!/CORE_TARGET_ID[\s\S]{0,200}action: 'command'/.test(system), 'the Core no longer toggles the command line');
  assert((system.match(/togglePortal\(/g) ?? []).length === 2, 'pointer press and air click both call the one togglePortal');
  assert(keys.includes("key === 'o'") && keys.includes("togglePortal('keyboard', interaction.activationOwner())"), 'the keyboard (O, Space) calls the same function');
  assert(layer.includes('interaction.claimActivation(') && layer.includes('PORTAL_CLAIM'), 'while open, the portal owns a hand\'s air click, as the deck does');
  assert(!/gestureRecognizer|DOUBLE_PINCH/.test(layer), 'the portal recognises no gestures of its own');
  pass('Pointer, air click and keyboard open the portal through one implementation, respecting the Command Deck');
})();

// --- 7. the environment answers, the workspace resets --------------------------------------

console.log('--- The room answers the bloom ---');
{
  const stop = startAmbience();
  requestPortal(true, 'pointer', null);
  assert(pulseProgress('open', performance.now()) !== null, 'opening the portal sends the opening wave through the room');
  requestPortal(false, 'pointer', PORTAL_CLAIM);
  assert(pulseProgress('settle', performance.now()) !== null, 'folding it away settles the room');
  stop();

  requestPortal(true, 'pointer', null);
  useSpatialStore.getState().applyWorkspace('home');
  const bus = readFileSync('src/systems/command/commandBus.ts', 'utf8');
  assert(bus.includes("case 'portal': {") && bus.includes('store.setPortal(command.open)'), 'the bus is the only thing that changes the portal');
  assert(/case 'workspace': \{[\s\S]{0,200}store\.setPortal\(false\)/.test(bus), 'changing workspace folds the portal away');
  requestPortal(false, 'system', PORTAL_CLAIM);

  const driver = readFileSync('src/components/spatial/PortalDriver.tsx', 'utf8');
  assert(!driver.includes('useState') && !driver.includes('fetch(') && !/new (Vector3|Object|Array)\(/.test(driver.split('export function PortalDriver')[1].split('/** Project')[0]), 'the portal frame loop allocates nothing, sets no React state, fetches nothing');
  const model = readFileSync('src/systems/portal/portalModel.ts', 'utf8');
  assert(!/swipe|layerIndex|activeLayer|LayerState/.test(model + driver + layer()), 'no Phase 13 layer navigation, state or stacks');
  pass('The Phase 11 room reacts; no Phase 13 has been built');
}

function layer() {
  return readFileSync('src/components/interface/PortalLayer.tsx', 'utf8');
}

console.log('\n========================================');
if (failures) {
  console.log(`✗ ${failures} of ${checks} portal assertions failed`);
  throw new Error(`${failures} of ${checks} portal assertions FAILED`);
}
console.log(`ALL ${checks} PORTAL ASSERTIONS PASSED! 🎉`);
