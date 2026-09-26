import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { NO_SYSTEM_ADAPTER, setSystemAdapter } from '../native/systemAdapter';
import { useIntelligenceStore } from '../intelligence/intelligenceSession';
import { useVoiceStore } from '../voice/voiceStore';
import { ENVIRONMENT, PALETTE } from '../../data/environment';
import {
  CORE_MODE_ENERGY,
  CORE_MODE_LABEL,
  PULSE_MS,
  RIPPLE_MS,
  ambientTargets,
  clearPulses,
  clearRipple,
  coreMode,
  isCarriedOut,
  noteHandSeen,
  projectOntoWall,
  pulseProgress,
  readAmbientSignals,
  rippleProgress,
  setReducedMotion,
  startAmbience,
  triggerPulse,
  triggerRipple,
} from './ambience';
import { AMBIENT_BOUNDS, generateAmbientPoints } from './ambientField';

/**
 * Phase 11 verification — the spatial environment.
 *
 * The room's look is judged by eye; what can be pinned is everything that
 * decides *when* it responds and *what* it may touch. These checks cover the
 * pure mapping from NOVA's state to the room, the ripple's lifecycle, which
 * commands the room answers to, the geometry that places a ripple, the palette
 * staying in step with NOVA's CSS tokens, and the rule that the render path
 * does no I/O.
 */

/**
 * Files are read the way the other suites read them: `node:fs` imported by a
 * name the browser build never resolves, with paths from the repository root,
 * where `npm test` runs.
 */
const nodeFs = 'node:fs';
const { readFileSync } = (await import(nodeFs)) as {
  readFileSync: (path: string, encoding: string) => string;
};

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

console.log('\n=== NOVA Phase 11 · Spatial Environment ===\n');

// --- 1. what the room responds to -------------------------------------------------

console.log('--- Ambient mapping ---');
{
  const quiet = ambientTargets({ handPresent: false, listening: false, thinking: false });
  assert(quiet.wake === 0 && quiet.glow === 0, 'at rest, the room is still');

  const hand = ambientTargets({ handPresent: true, listening: false, thinking: false });
  assert(hand.wake === 1, 'a hand in view wakes the grids');
  assert(hand.glow === 0, 'but a hand alone never lights NOVA — it is not NOVA doing anything');

  const listening = ambientTargets({ handPresent: false, listening: true, thinking: false });
  const thinking = ambientTargets({ handPresent: false, listening: false, thinking: true });
  assert(listening.glow > 0 && listening.glow < 1, 'listening tints the stage light');
  assert(thinking.glow > listening.glow, 'thinking is stronger than listening');
  assert(thinking.glow <= 1 && thinking.wake >= 0, 'targets stay within 0..1');

  const both = ambientTargets({ handPresent: true, listening: true, thinking: true });
  assert(both.glow === thinking.glow && both.wake === 1, 'signals combine without exceeding their range');
  pass('The room answers to hands, listening and thinking — and to nothing at rest');
}

console.log('--- Live signals ---');
{
  useSpatialStore.setState({ visionActive: false });
  noteHandSeen(performance.now());
  assert(!readAmbientSignals().handPresent, 'with the camera off, a remembered hand is not present');

  useSpatialStore.setState({ visionActive: true });
  noteHandSeen(performance.now());
  assert(readAmbientSignals().handPresent, 'a confident hand just seen is present');
  assert(!readAmbientSignals(performance.now() + 1_000).handPresent, 'and stops being present a moment after it leaves');
  useSpatialStore.setState({ visionActive: false });

  useIntelligenceStore.setState({ status: 'thinking' });
  assert(readAmbientSignals().thinking, 'the Intelligence Core thinking is read');
  useIntelligenceStore.setState({ status: 'idle' });
  assert(!readAmbientSignals().thinking, 'and released');

  useVoiceStore.setState({ state: 'listening' });
  assert(readAmbientSignals().listening, 'an open microphone is read');
  useVoiceStore.setState({ state: 'idle' });
  assert(!readAmbientSignals().listening, 'and released');
  pass('Signals are read from the existing stores, never from a second source of truth');
}

// --- 2. the ripple -------------------------------------------------------------------

console.log('--- Ripple lifecycle ---');
{
  clearRipple();
  assert(rippleProgress(0) === null, 'no ripple until something opens');

  triggerRipple(1, 2, 3, 1_000);
  assert(rippleProgress(999) === null, 'a ripple has not started before its moment');
  const early = rippleProgress(1_000 + RIPPLE_MS * 0.25);
  assert(early !== null && Math.abs(early.t - 0.25) < 1e-9, 'progress is time since it began, over its duration');
  assert(early?.x === 1 && early?.y === 2 && early?.z === 3, 'and it remembers where it began');
  assert(rippleProgress(1_000 + RIPPLE_MS) === null, 'it is gone at its duration — nothing lingers');

  triggerRipple(0, 0, 0, 5_000);
  triggerRipple(4, 0, 0, 5_100);
  assert(rippleProgress(5_200)?.x === 4, 'a newer opening replaces the older ripple');

  setReducedMotion(true);
  assert(rippleProgress(5_200) === null, 'asking for reduced motion clears a ripple in flight');
  triggerRipple(0, 0, 0, 6_000);
  assert(rippleProgress(6_100) === null, 'and no new ripple starts');
  setReducedMotion(false);
  pass('One ripple at a time, bounded in time, and none at all under reduced motion');
}

console.log('--- What makes a ripple ---');
{
  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = startAmbience();
  const store = useSpatialStore.getState();

  clearRipple();
  dispatch({ action: 'focus', target: 'code' }, 'pointer');
  dispatch({ action: 'focus', target: 'code' }, 'gesture');
  dispatch({ action: 'move', target: 'code', delta: { x: 0.1 } }, 'gesture');
  assert(rippleProgress() === null, 'focusing and dragging leave the room alone');

  dispatch({ action: 'open', target: 'notes' }, 'gesture');
  const opened = rippleProgress();
  const notes = useSpatialStore.getState().windows.notes.position;
  assert(opened !== null, 'an air click — which lands as "open" — starts a ripple');
  assert(opened?.x === notes.x && opened?.y === notes.y && opened?.z === notes.z, 'from the window that opened');

  clearRipple();
  dispatch({ action: 'open', target: 'terminal' }, 'command-line');
  assert(rippleProgress() !== null, 'so does a typed or spoken "open"');

  clearRipple();
  dispatch({ action: 'open-application', applicationId: 'org.gnome.Calculator', name: 'Calculator' }, 'ai');
  const launched = rippleProgress();
  const core = store.core.position;
  assert(launched?.x === core.x && launched?.z === core.z, 'a native launch ripples from the Core — NOVA reached out');

  stop();
  clearRipple();
  dispatch({ action: 'open', target: 'files' }, 'gesture');
  assert(rippleProgress() === null, 'once stopped, the room stops listening');
  pass('Openings ripple; focus, drag and pointing do not');
}

console.log('--- Ripple placement ---');
{
  const eye = { x: 0, y: 0.1, z: 7.2 };
  const wall = ENVIRONMENT.backdrop.z;
  const straight = projectOntoWall({ x: 0, y: 0.1, z: 0 }, eye, wall);
  assert(Math.abs(straight.x) < 1e-9 && Math.abs(straight.y - 0.1) < 1e-9, 'a point straight ahead lands straight ahead');

  const right = projectOntoWall({ x: 2, y: 0.1, z: 0 }, eye, wall);
  assert(right.x > 2, 'a point to the right lands further right on the far wall — perspective');
  const k = (wall - eye.z) / (0 - eye.z);
  assert(Math.abs(right.x - 2 * k) < 1e-9, 'exactly along the line of sight');

  const onWall = projectOntoWall({ x: 3, y: -1, z: wall }, eye, wall);
  assert(Math.abs(onWall.x - 3) < 1e-9 && Math.abs(onWall.y + 1) < 1e-9, 'a point already on the wall stays put');
  const reused = { x: 0, y: 0 };
  assert(projectOntoWall({ x: 1, y: 0, z: 0 }, eye, wall, reused) === reused, 'a frame loop can reuse one result object');
  pass('A ripple is drawn on the wall directly behind what opened');
}

// --- 3. palette and geometry --------------------------------------------------------

console.log('--- Palette ---');
{
  const css = readFileSync('src/index.css', 'utf8');
  const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
  assert(token('environment') === PALETTE.base, `the room's base is the CSS --environment token (${token('environment')})`);
  assert(token('accent') === PALETTE.accent, `the room's accent is the CSS --accent token (${token('accent')})`);
  assert(token('env-ink') === PALETTE.ink, "the room's line ink is the CSS --env-ink token");
  assert(token('surface') === '#ffffff', 'application surfaces stay white — they float in the room');

  const hex = /^#[0-9a-f]{6}$/;
  assert(Object.values(PALETTE).every((value) => hex.test(value)), 'every palette entry is a plain colour');
  const channels = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const luma = (value: string) => {
    const [r, g, b] = channels(value);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const room = ['base', 'wallHigh', 'wallLow', 'floorFar', 'floorNear', 'haze'] as const;
  // Phase 11E: a darkened physical room in deep blue-grey — never white, never
  // black, never a hue of its own.
  for (const name of room) {
    const [r, g, b] = channels(PALETTE[name]);
    assert(luma(PALETTE[name]) < 0x30, `${name} is deep (${PALETTE[name]}), never white`);
    assert(Math.max(r, g, b) >= 0x12, `${name} is never black (${PALETTE[name]})`);
    assert(b > g && g >= r && b - r >= 0x08 && b - r <= 0x20, `${name} is a blue-grey (${PALETTE[name]}), not a colour`);
  }
  assert(luma(PALETTE.ink) >= 0xd0 && luma(PALETTE.light) >= 0xd0, 'lines and light are pale, drawn on the deep room');
  assert(
    luma(PALETTE.floorNear) < luma(PALETTE.floorFar) && luma(PALETTE.wallHigh) < luma(PALETTE.wallLow),
    'depth by value: the floor deepens towards the viewer, the wall towards the ceiling, both lift at the horizon',
  );

  // Colour is light with a meaning, not paint.
  const hue = (value: string) => {
    const [r, g, b] = channels(value).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const saturation = (value: string) => {
    const [r, g, b] = channels(value);
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
  };
  assert(saturation(PALETTE.pearl) < 0.12 && saturation(PALETTE.silver) < 0.25, "the room's own light is pearl and silver, nearly colourless");
  assert(hue(PALETTE.warmWhite) > 25 && hue(PALETTE.warmWhite) < 45 && hue(PALETTE.amber) > 25 && hue(PALETTE.amber) < 45, 'the Core light is warm white and amber');
  assert(hue(PALETTE.violet) > 245 && hue(PALETTE.violet) < 275, 'intelligence is violet');
  assert(hue(PALETTE.cyan) > 180 && hue(PALETTE.cyan) < 200, 'spatial interaction is cyan');
  for (const removed of ['magenta', 'pink', 'coral', 'teal', 'indigo', 'blue']) {
    assert(!(removed in PALETTE), `the 11D zone colour ${removed} is gone`);
  }
  pass("The room is a deep blue-grey in one place, matched to NOVA's tokens; colour is light with meaning; surfaces stay white");
}

console.log('--- Geometry ---');
{
  const { camera, backdrop, floor, stage } = ENVIRONMENT;
  const distance = camera.position[2] - backdrop.z;
  const halfHeight = Math.tan(((camera.fov / 2) * Math.PI) / 180) * distance;
  assert(backdrop.height / 2 > halfHeight + 1, 'the wall is taller than the view at its distance');
  assert(backdrop.width / 2 > halfHeight * 2.4 + 1, 'and wider than the view even on a very wide screen');
  assert(floor.y < -ENVIRONMENT.bounds.y, 'the floor lies beneath the lowest a window may go');
  assert(backdrop.z < ENVIRONMENT.depth.back - 5, 'the wall stands well behind the deepest a window may go');
  assert(Math.abs(stage.x) < 0.01, 'the stage — room for a later portal — is at the centre');
  pass('The room encloses the view and leaves the working volume and its centre clear');
}

// --- 11B. the NOVA Spatial Core's modes and pulses -------------------------------------

console.log('--- Core modes ---');
{
  const base = { handPresent: false, listening: false, thinking: false };
  assert(coreMode(base) === 'idle', 'at rest the Core is idle');
  assert(coreMode({ ...base, handPresent: true }) === 'hand', 'a hand in view');
  assert(coreMode({ ...base, listening: true, handPresent: true }) === 'listening', 'listening outranks a hand');
  assert(coreMode({ handPresent: true, listening: true, thinking: true }) === 'thinking', 'thinking outranks everything');
  assert(CORE_MODE_ENERGY.idle === 1, 'idle is the slowest drift');
  assert(
    CORE_MODE_ENERGY.idle < CORE_MODE_ENERGY.hand &&
      CORE_MODE_ENERGY.hand < CORE_MODE_ENERGY.listening &&
      CORE_MODE_ENERGY.listening < CORE_MODE_ENERGY.thinking,
    'energy rises idle → hand → listening → thinking',
  );
  assert(CORE_MODE_ENERGY.thinking <= 4, 'even thinking stays restrained');
  assert(
    Object.values(CORE_MODE_LABEL).every((label) => label.length > 0 && label.length <= 14),
    'every mode has a short caption',
  );
  pass('The Core is in exactly one mode, and the strongest state decides it');
}

console.log('--- Pulses ---');
{
  clearPulses();
  assert(pulseProgress('command', 0) === null, 'no pulse until something happens');
  triggerPulse('open', 1_000);
  assert(Math.abs((pulseProgress('open', 1_000 + PULSE_MS.open / 2) ?? -1) - 0.5) < 1e-9, 'an opening pulse runs over its duration');
  assert(pulseProgress('open', 1_000 + PULSE_MS.open) === null, 'and ends');
  assert(pulseProgress('command', 1_500) === null, 'pulses are independent');
  assert(Object.values(PULSE_MS).every((ms) => ms > 0 && ms <= 2_000), 'every pulse is brief');

  setReducedMotion(true);
  triggerPulse('command', 2_000);
  assert(pulseProgress('command', 2_100) === null, 'reduced motion: no pulses');
  setReducedMotion(false);

  // Which commands count as NOVA carrying something out.
  assert(isCarriedOut('focus', 'command-line'), 'a typed sentence');
  assert(isCarriedOut('minimize', 'voice'), 'a spoken one');
  assert(isCarriedOut('open-application', 'ai'), "the Intelligence Core's action");
  assert(isCarriedOut('open', 'gesture'), 'an air click');
  assert(!isCarriedOut('move', 'command-line'), 'moving is never a pulse — drags dispatch it every frame');
  assert(!isCarriedOut('focus', 'pointer'), 'a click is the user acting, not NOVA');
  assert(!isCarriedOut('focus', 'gesture'), 'nor is a pinch');
  assert(!isCarriedOut('workspace', 'system'), "nor NOVA's own start-up arrangement");
  assert(!isCarriedOut('command', 'keyboard'), 'opening the command line is not a command carried out');

  setSystemAdapter(NO_SYSTEM_ADAPTER);
  const stop = startAmbience();
  clearPulses();
  dispatch({ action: 'move', target: 'code', delta: { x: 0.05 } }, 'pointer');
  dispatch({ action: 'focus', target: 'code' }, 'pointer');
  assert(pulseProgress('command') === null && pulseProgress('open') === null, 'dragging and clicking stay quiet');
  dispatch({ action: 'minimize', target: 'code' }, 'voice');
  assert(pulseProgress('command') !== null, 'a spoken instruction kicks the Core');
  dispatch({ action: 'open', target: 'code' }, 'command-line');
  assert(pulseProgress('open') !== null, 'an opening sends a wave out from the Core');

  useIntelligenceStore.setState({ status: 'thinking' });
  assert(pulseProgress('settle') === null, 'no settle while still thinking');
  useIntelligenceStore.setState({ status: 'idle' });
  assert(pulseProgress('settle') !== null, 'an answer completing settles the Core');
  clearPulses();
  useIntelligenceStore.setState({ status: 'idle' });
  assert(pulseProgress('settle') === null, 'idle → idle is not an answer');
  stop();
  pass('Commands kick, openings send a wave, answers settle — the user\'s own hands stay quiet');
}

console.log('--- Ambient points ---');
{
  const a = generateAmbientPoints(150, 42);
  const b = generateAmbientPoints(150, 42);
  const c = generateAmbientPoints(150, 43);
  assert(a.count === 150 && a.positions.length === 450, 'the requested number of points');
  assert(a.positions.every((v, i) => v === b.positions[i]), 'the same seed lays out the same room — a composition, not a scatter');
  assert(a.positions.some((v, i) => v !== c.positions[i]), 'a different seed, a different layout');
  assert(generateAmbientPoints(100_000, 1).count <= 400, 'the count is capped: never a large particle system');
  assert(generateAmbientPoints(-5, 1).count === 0, 'nonsense counts produce nothing');

  let inBounds = true;
  for (let i = 0; i < a.count; i += 1) {
    const [x, y, z] = [a.positions[i * 3], a.positions[i * 3 + 1], a.positions[i * 3 + 2]];
    if (x < AMBIENT_BOUNDS.x[0] || x > AMBIENT_BOUNDS.x[1]) inBounds = false;
    if (y < AMBIENT_BOUNDS.y[0] || y > AMBIENT_BOUNDS.y[1]) inBounds = false;
    if (z < AMBIENT_BOUNDS.z[0] || z > AMBIENT_BOUNDS.z[1]) inBounds = false;
  }
  assert(inBounds, 'every point is inside the room');
  assert(AMBIENT_BOUNDS.z[1] < ENVIRONMENT.depth.back, 'and behind the deepest a window may go — none can drift over text');
  assert(a.sizes.every((size) => size > 0 && size < 4), 'points stay small');
  assert(ENVIRONMENT.ambient.count <= 200, 'the room uses a restrained number of points');
  pass('Ambient points are deterministic, few, small and always behind the windows');
}

console.log('--- The Core in the room ---');
{
  const { stage, spatialCore, floor, depth } = ENVIRONMENT;
  assert(stage.z < depth.back, 'the Spatial Core stands behind the working volume, so every window is in front of it');
  assert(spatialCore.y > floor.y, 'and above the floor');
  const distance = ENVIRONMENT.camera.position[2] - stage.z;
  const halfHeight = Math.tan(((ENVIRONMENT.camera.fov / 2) * Math.PI) / 180) * distance;
  const floorBelowCore = (ENVIRONMENT.camera.position[1] - floor.y) / (ENVIRONMENT.camera.position[2] - stage.z);
  assert(Math.abs(spatialCore.y - ENVIRONMENT.camera.position[1]) < halfHeight, 'the Core is in view');
  assert(floorBelowCore < Math.tan(((ENVIRONMENT.camera.fov / 2) * Math.PI) / 180), 'and so is the floor beneath it — the rings visibly belong to it');
  pass('The Core leads the composition without standing in front of any window');
}

console.log('--- Phase 11C: composition after the motion reference ---');
{
  const css = readFileSync('src/index.css', 'utf8');
  const envToken = /--environment:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase() ?? '#ffffff';
  assert(parseInt(envToken.slice(1, 3), 16) < 0x30, `the page behind the canvas is the room's night too (${envToken}), not white`);
  assert(parseInt(envToken.slice(5, 7), 16) >= 0x14, `and it is the room's blue-grey (${envToken}), not black`);

  const rig = readFileSync('src/components/spatial/EnvironmentRig.tsx', 'utf8');
  const scene = readFileSync('src/components/spatial/SpatialScene.tsx', 'utf8');
  assert(rig.includes('<color attach="background" args={[PALETTE.base]} />'), "the scene's clear colour is the room's base tone");
  // The reference's premium comes from negative space around one living subject:
  // the vast rings, panes and light trails of the earlier pass are gone.
  for (const removed of ['DistantRings', 'SpatialStructures', 'LightTrails']) {
    assert(!rig.includes(removed) && !scene.includes(removed), `${removed} is no longer in the room`);
  }
  assert(scene.includes('<SpatialCore />'), 'the bloom — the Spatial Core — is the subject');
  const farGroup = rig.slice(rig.indexOf('<group ref={farRef}>'), rig.indexOf('</group>', rig.indexOf('<group ref={farRef}>')));
  assert(farGroup.includes('wallRef'), 'the wall and its lattice form the far layer');

  const { layerParallax } = ENVIRONMENT;
  assert(layerParallax.far < 0 && layerParallax.far > -0.6, 'the far layer is held back against the viewpoint, never frozen or reversed');
  assert(rig.includes('ENVIRONMENT.layerParallax.far'), 'the far layer reads its parallax from the one setting');
  assert(rig.includes('time.current += still ? 0 : elapsed'), "the room's lattice and flow stop under reduced motion");
  pass('The scene owns the background; the bloom is the subject; the far layer moves least');
}

console.log('--- Phase 11C: the bloom ---');
{
  const core = readFileSync('src/components/spatial/SpatialCore.tsx', 'utf8');
  // Drawn as the reference draws: a lattice of plus-shaped LED cells.
  assert(core.includes('floor(frag / uCell)') && core.includes('cellCentre'), 'the bloom is sampled per LED cell');
  assert(core.includes('float plus = max('), 'each cell is a plus-shaped glyph sized by brightness');
  assert(core.includes('uCell.value = 6 * gl.getPixelRatio()'), 'cells are a constant screen size on any display');
  // Alive when nothing happens.
  assert(/for \(int i = 0; i < 6; i\+\+\)/.test(core), 'six petals — an original NOVA form, not a copy of the reference');
  assert(core.includes('sway') && core.includes('breath'), 'the petals sway and breathe');
  assert(core.includes('The dissolve'), 'the lower bloom dissolves into falling dots');
  assert(core.includes('sparkle'), 'cells twinkle as four-point sparkles');
  assert(core.includes('FLARE_EVERY_S') && core.includes('glint'), 'a flare of glints runs along the petal tips every few seconds');
  // And it is NOVA.
  for (const signal of ["pulseProgress('command', now)", "pulseProgress('open', now)", "pulseProgress('settle', now)", 'microphoneLevel()', 'coreMode(']) {
    assert(core.includes(signal), `the bloom answers to ${signal}`);
  }
  assert(core.includes('uAccent * 1.35') && core.includes("mode === 'thinking' ? 1"), 'thinking fills the heart and petals with the accent');
  assert(core.includes('command === null ? 0 : Math.sin(command * Math.PI)'), 'a command carried out makes the bloom flare');
  assert(core.includes('open === null ? 0 : Math.sin(Math.min(open * 2, 1) * Math.PI)') && core.includes('u.uRing.value = open ?? -1'), 'an opening flares and sends a ring of dots out');
  assert(core.includes('settle === null ? 0 : Math.sin(settle * Math.PI)'), 'an answer completing gives a soft flare');
  // Large, as the reference's subject is large in its frame; still under reduced motion.
  const scale = Number(/const SCALE = ([0-9.]+);/.exec(core)?.[1] ?? 0);
  assert(scale >= 1.8, `the bloom is large enough to read around the windows (scale ${scale})`);
  assert(core.includes('time.current += still ? 0 : elapsed') && core.includes('const idleFlare = still ? 0'), 'the bloom holds still, and does not flare, under reduced motion');
  assert(!core.includes('useState') && !core.includes('fetch('), 'the bloom sets no React state and fetches nothing');
  pass('The Spatial Core is a living dot-matrix bloom: swaying, dissolving, twinkling, flaring, and following NOVA');
}

console.log('--- Phase 11C: the motion field ---');
{
  const shaders = readFileSync('src/components/spatial/environmentShaders.ts', 'utf8');
  const rig = readFileSync('src/components/spatial/EnvironmentRig.tsx', 'utf8');

  // One field across the whole wall, not an effect behind the Core.
  assert(shaders.includes('nova_snoise') && shaders.includes('nova_fbm'), 'the field is procedural noise, generated by NOVA — no video, no image');
  assert(/vec2 p = vec2\(fw\.x \/ [0-9.]+, fw\.y \/ [0-9.]+\)/.test(shaders), 'it is laid across the whole wall in world units');
  assert(shaders.includes('smoothstep(0.6, 1.3, length(vec2(world.x / 12.0'), 'its dot lattice thins towards the edges, so the lattice stays a texture');
  for (const input of ['uFlowTime', 'uEnergy', 'uLevel', 'uPointer', 'uHandOn', 'uWave', 'uCommand', 'uFlareWave', 'uDetail']) {
    assert(shaders.includes(`uniform `) && shaders.includes(input), `the field responds to ${input}`);
    assert(rig.includes(`${input}: { value:`), `EnvironmentRig feeds ${input}`);
  }
  // Reactivity comes from NOVA's existing state, never a new source.
  assert(rig.includes('coreMode(signals)') && rig.includes("pulseProgress('settle', now)"), 'the field reads the existing Core modes and the settle pulse');
  assert(rig.includes("pulseProgress('open', now)") && rig.includes("pulseProgress('command', now)"), 'openings and commands send waves through it');
  assert(rig.includes("mode === 'listening' ? Math.min(microphoneLevel()"), 'listening follows the real microphone level, and only while listening');
  assert(rig.includes("spatial().quality === 'high' ? 1 : 0"), 'the Performance Governor can lower the field\'s detail on modest hardware');
  assert(rig.includes('Math.min((now - lastNow.current) / 1000, 1)'), 'flow time is real elapsed time, capped so a background tab cannot leap');

  pass('A procedural field lives across the wall, reacts to NOVA\'s state, and respects reduced motion and modest hardware');
}

console.log('--- Phase 11E: a room lit by meaningful light ---');
{
  const shaders = readFileSync('src/components/spatial/environmentShaders.ts', 'utf8');
  const rig = readFileSync('src/components/spatial/EnvironmentRig.tsx', 'utf8');
  const core = readFileSync('src/components/spatial/SpatialCore.tsx', 'utf8');
  const points = readFileSync('src/components/spatial/AmbientField.tsx', 'utf8');
  const wall = shaders.slice(shaders.indexOf('export const BACKDROP_FRAGMENT'), shaders.indexOf('export const FLOOR_VERTEX'));
  const floor = shaders.slice(shaders.indexOf('export const FLOOR_FRAGMENT'), shaders.indexOf('export const MIDGROUND_VERTEX'));
  const mid = shaders.slice(shaders.indexOf('export const MIDGROUND_FRAGMENT'));

  // No colour zones: the atmosphere is slate light moving through the air.
  assert(!/vec2 c[LRTB] = /.test(wall) && !wall.includes('uMagenta'), 'there are no left/right colour zones');
  assert(wall.includes('color += uSlate * (0.08 + 0.3 * air)'), 'the atmosphere is slate light, low in contrast, moving');
  // Architectural light, a horizon, and distant structures for scale.
  assert(wall.includes('float key = exp(') && wall.includes('keyAt = vec2(-10.0 + 1.6 * sin('), 'a huge soft key light falls from out of view, drifting');
  assert(wall.includes('float horizon = exp(-abs(above)'), 'a soft band of light marks the horizon');
  assert(wall.includes('float arc = nova_line(') && wall.includes('float frame = nova_line('), 'a giant arc and tall frames establish scale, far away');
  assert(wall.includes('float structure =') && wall.includes('structure * 0.8'), 'the arc is also drawn as LED dots');
  assert(mid.includes('The orbit') && mid.includes('float nearSide ='), 'an enormous ring lies around the Core in perspective, brighter on its near side');

  // Warm is the Core.
  assert(wall.includes('float coreLight = exp(-spread * spread) * breath') && wall.includes('mix(uWarmWhite, uAmber'), 'the Core spills warm light into the room, breathing');
  assert(floor.includes('float pool =') && floor.includes('mix(uWarmWhite, uAmber, 0.35), smoothstep(0.08, 0.35, pool)'), 'the floor reflects the Core\'s warm light beneath it');
  assert(core.includes('uCentre * vec3(1.08, 0.84, 0.58), heartLight'), 'the bloom\'s heart holds an amber cast');
  // Violet is intelligence: every use of it is gated by thinking (or a command's pulse).
  for (const [name, source] of [['wall', wall], ['floor', floor], ['mid layer', mid]] as const) {
    const lines = source.split('\n').filter((line) => line.includes('uViolet') && !line.includes('uniform'));
    assert(lines.length > 0 && lines.every((line) => line.includes('uGlow') || line.includes('uCommand')), `violet in the ${name} appears only while NOVA thinks or acts`);
  }
  assert(core.includes("glow.current = damp(glow.current, mode === 'thinking' ? 1 : 0"), 'the bloom takes the accent only while thinking');
  assert(points.includes('vAccent = step(0.84, fract(aSeed * 13.7)) * uGlow'), 'the ambient points turn violet only while thinking');
  // Cyan is spatial interaction, and local.
  assert(wall.includes('uCyan * nearHand') && wall.includes('mix(uPearl, uCyan, 0.5) * nearMouse'), 'hand and pointer bring cyan light, locally');
  assert(wall.includes('mix(uCyan, uPearl, 0.35) * a') && floor.includes('mix(uCyan, uPearl, 0.3), clamp(wave'), 'an opening sends a restrained cyan wave across wall and floor');
  assert(wall.includes('mix(uCyan, uViolet, uCommand)'), 'a command is a brief cyan-to-violet ripple');
  assert(core.includes("listen.current = damp(listen.current, mode === 'listening' ? 1 : 0") && core.includes('uCyan * (1.0 + 0.35 * uListen)'), 'listening brightens the bloom\'s edges towards cyan');
  assert(points.includes('mix(uInk, uCyan, clamp(vNear') && points.includes('uAccent: { value: new Color(PALETTE.cyan) }'), 'the hand\'s field and the points near it are cyan');

  // Depth: the mid layer between wall and bloom, moving more than the wall.
  const { midground, backdrop, stage, layerParallax } = ENVIRONMENT;
  assert(backdrop.z < midground.z && midground.z < stage.z, 'the mid layer lies between the wall and the bloom');
  assert(layerParallax.far < layerParallax.mid && layerParallax.mid < 0, 'the mid layer is held back less than the wall, so it moves more');
  assert(rig.includes('ENVIRONMENT.layerParallax.mid') && rig.includes('<group ref={midRef}>'), 'the mid layer reads its parallax from the one setting');
  assert(rig.includes('blending: AdditiveBlending') && rig.includes('material={haze}'), 'the mid layer only adds light, never darkens');
  // The streams: few, large, in the dot language, pearl, fading into distance.
  assert(/for \(int i = 0; i < 3; i\+\+\)/.test(mid), 'three streams of light — few and large, not dozens');
  assert(mid.includes('floor(frag / uCell)') && mid.includes('float plus = max('), 'the streams are LED dots, like the bloom');
  assert(mid.includes('float travel =') && mid.includes('float depth = mix(0.6, 1.0'), 'light travels along them, and they fade into the distance');
  assert(mid.includes('vec3 c = mix(uPearl, uCyan'), 'the streams are pearl and cyan-white');
  assert(mid.includes('smoothstep(0.3, 1.2, length(toCore))'), 'the mid layer thins in front of the Core, so it never veils the bloom');

  // The bloom lights the room.
  assert(core.includes('spatialCoreLight.flare = u.uFlare.value'), 'the bloom shares its flare with the room');
  assert(rig.includes('spatialCoreLight.flare > 0.08') && rig.includes('FLARE_WAVE_MS'), 'each flare sends one wave of light into the space around the bloom');
  assert(rig.includes('if (flaring && !wasFlaring.current && !still)'), 'the flare wave never starts under reduced motion');
  assert(rig.includes("inputRouter.activeModality() === 'hand'"), 'the hand\'s light follows only a hand that is driving the pointer');

  // Affordable.
  assert(wall.includes('float soft = 0.0;') && mid.includes('float h = nova_snoise(hp);'), 'the air uses two octaves, the mid haze one');
  assert(mid.includes('if (abs(band) > 4.8) continue;'), 'streams skip pixels nowhere near them');
  assert(!/RenderTarget|EffectComposer|Bloom\b/.test(rig), 'no render targets or post-processing');
  pass('A blue-grey room lit by meaningful light: warm Core, violet intelligence, cyan interaction, pearl structures in depth');
}

// --- 4. no I/O in the render path -------------------------------------------------------

console.log('--- Render path ---');
{
  const read = (path: string) => readFileSync(path, 'utf8');
  const sources = {
    'EnvironmentRig.tsx': read('src/components/spatial/EnvironmentRig.tsx'),
    'environmentShaders.ts': read('src/components/spatial/environmentShaders.ts'),
    'ambience.ts': read('src/systems/environment/ambience.ts'),
    'SpatialCore.tsx': read('src/components/spatial/SpatialCore.tsx'),
    'AmbientField.tsx': read('src/components/spatial/AmbientField.tsx'),
    'ambientField.ts': read('src/systems/environment/ambientField.ts'),
    'SpatialCoreLabel.tsx': read('src/components/interface/SpatialCoreLabel.tsx'),
  };
  for (const [name, source] of Object.entries(sources)) {
    for (const forbidden of ['fetch(', 'routeUtterance', 'XMLHttpRequest', 'WebSocket', 'child_process', 'spawn(', 'performNative', 'requestNativeAction']) {
      assert(!source.includes(forbidden), `${name} contains no "${forbidden}"`);
    }
  }
  assert(!/\bdispatch\(/.test(sources['ambience.ts']), 'the ambience observes the bus and never dispatches');
  for (const name of ['EnvironmentRig.tsx', 'SpatialCore.tsx', 'AmbientField.tsx'] as const) {
    const loop = sources[name].split('useFrame(')[1]?.split('\n  });')[0] ?? '';
    assert(loop.length > 0, `${name} has a frame loop to inspect`);
    assert(!/new [A-Z]\w*\(/.test(loop), `${name}'s frame loop allocates no objects`);
    assert(!/\bset[A-Z]\w*\(/.test(loop.replace(/\.set(RGB|Scalar)?\(/g, '')), `${name}'s frame loop sets no React state`);
  }
  pass('The environment reads state and draws; it fetches, launches and dispatches nothing');
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} environment assertions FAILED`);
}
console.log(`ALL ${checks} ENVIRONMENT ASSERTIONS PASSED! 🎉`);
console.log('========================================');
