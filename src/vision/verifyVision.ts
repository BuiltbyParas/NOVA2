import { GestureRecognizer } from './gestureRecognizer';
import { Point2DSmoother } from './smoothing';
import { handTracker } from './handTracker';
import { LANDMARK, type HandFrame, type HandPoint } from './visionTypes';
import { createHandInputSource } from '../systems/input/handInputSource';
import { inputRouter } from '../systems/input/inputRouter';
import type { InputSource, PointerFrame } from '../systems/input/types';

function createOpenPalmHand(cx = 0.5, cy = 0.5): HandPoint[] {
  const points: HandPoint[] = [];
  for (let i = 0; i < 21; i++) {
    points.push({ x: cx, y: cy, z: 0 });
  }
  const wrist = { x: cx, y: cy + 0.3, z: 0 };
  points[LANDMARK.WRIST] = wrist;
  points[LANDMARK.MIDDLE_MCP] = { x: cx, y: cy, z: 0 }; // handSpan = 0.3

  // All 5 fingers extended outward
  points[LANDMARK.THUMB_MCP] = { x: cx - 0.15, y: cy + 0.15, z: 0 };
  points[LANDMARK.THUMB_TIP] = { x: cx - 0.30, y: cy, z: 0 };

  points[LANDMARK.INDEX_PIP] = { x: cx - 0.10, y: cy, z: 0 };
  points[LANDMARK.INDEX_TIP] = { x: cx - 0.10, y: cy - 0.30, z: 0 };

  points[LANDMARK.MIDDLE_PIP] = { x: cx, y: cy - 0.05, z: 0 };
  points[LANDMARK.MIDDLE_TIP] = { x: cx, y: cy - 0.35, z: 0 };

  points[LANDMARK.RING_PIP] = { x: cx + 0.10, y: cy, z: 0 };
  points[LANDMARK.RING_TIP] = { x: cx + 0.10, y: cy - 0.30, z: 0 };

  points[LANDMARK.PINKY_PIP] = { x: cx + 0.20, y: cy + 0.05, z: 0 };
  points[LANDMARK.PINKY_TIP] = { x: cx + 0.20, y: cy - 0.25, z: 0 };

  return points;
}

function createPointHand(cx = 0.5, cy = 0.5): HandPoint[] {
  const points: HandPoint[] = [];
  for (let i = 0; i < 21; i++) {
    points.push({ x: cx, y: cy, z: 0 });
  }
  const wrist = { x: cx, y: cy + 0.3, z: 0 };
  points[LANDMARK.WRIST] = wrist;
  points[LANDMARK.MIDDLE_MCP] = { x: cx, y: cy, z: 0 }; // handSpan = 0.3

  // Index extended
  points[LANDMARK.INDEX_PIP] = { x: cx, y: cy - 0.1, z: 0 };
  points[LANDMARK.INDEX_TIP] = { x: cx, y: cy - 0.25, z: 0 };

  // Thumb separated
  points[LANDMARK.THUMB_MCP] = { x: cx - 0.12, y: cy + 0.15, z: 0 };
  points[LANDMARK.THUMB_TIP] = { x: cx - 0.25, y: cy, z: 0 };

  // Other fingers curled into palm
  points[LANDMARK.MIDDLE_PIP] = { x: cx + 0.05, y: cy + 0.05, z: 0 };
  points[LANDMARK.MIDDLE_TIP] = { x: cx + 0.05, y: cy + 0.12, z: 0 };

  points[LANDMARK.RING_PIP] = { x: cx + 0.10, y: cy + 0.05, z: 0 };
  points[LANDMARK.RING_TIP] = { x: cx + 0.10, y: cy + 0.12, z: 0 };

  points[LANDMARK.PINKY_PIP] = { x: cx + 0.15, y: cy + 0.05, z: 0 };
  points[LANDMARK.PINKY_TIP] = { x: cx + 0.15, y: cy + 0.12, z: 0 };

  return points;
}

function createPinchHand(cx = 0.5, cy = 0.5): HandPoint[] {
  const points: HandPoint[] = [];
  for (let i = 0; i < 21; i++) {
    points.push({ x: cx, y: cy, z: 0 });
  }
  const wrist = { x: cx, y: cy + 0.3, z: 0 };
  points[LANDMARK.WRIST] = wrist;
  points[LANDMARK.MIDDLE_MCP] = { x: cx, y: cy, z: 0 }; // handSpan = 0.3

  // Thumb tip and Index tip touching
  points[LANDMARK.INDEX_PIP] = { x: cx, y: cy - 0.1, z: 0 };
  points[LANDMARK.INDEX_TIP] = { x: cx + 0.02, y: cy - 0.2, z: 0 };

  points[LANDMARK.THUMB_MCP] = { x: cx - 0.05, y: cy, z: 0 };
  points[LANDMARK.THUMB_TIP] = { x: cx - 0.02, y: cy - 0.2, z: 0 }; // distance = 0.04 / 0.3 = 0.133 < 0.38

  // Other fingers curled
  points[LANDMARK.MIDDLE_PIP] = { x: cx + 0.05, y: cy + 0.05, z: 0 };
  points[LANDMARK.MIDDLE_TIP] = { x: cx + 0.05, y: cy + 0.12, z: 0 };

  points[LANDMARK.RING_PIP] = { x: cx + 0.10, y: cy + 0.05, z: 0 };
  points[LANDMARK.RING_TIP] = { x: cx + 0.10, y: cy + 0.12, z: 0 };

  points[LANDMARK.PINKY_PIP] = { x: cx + 0.15, y: cy + 0.05, z: 0 };
  points[LANDMARK.PINKY_TIP] = { x: cx + 0.15, y: cy + 0.12, z: 0 };

  return points;
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// 1. OneEuroFilter & Point2DSmoother
console.log('--- Testing OneEuroFilter & Point2DSmoother ---');
const smoother = new Point2DSmoother(1.2, 0.015);
let pt = smoother.filter(0, 0, 1000);
assert(pt.x === 0 && pt.y === 0, 'Smoother initial output');
pt = smoother.filter(10, 10, 1033);
assert(pt.x > 0 && pt.x < 10, 'Smoother filters step response');
console.log('✓ Smoother passed');

// 2. Pointing & Pinch Lifecycle
console.log('--- Testing GestureRecognizer Point & Pinch ---');
const recognizer = new GestureRecognizer();

const pointHand = createPointHand(0.5, 0.5);
const f1 = recognizer.process(pointHand, 0.95, 1000);
assert(f1 !== null, 'f1 should be non-null');
assert(f1!.detected === true, 'f1 detected');
assert(f1!.isPinching === false, 'f1 not pinching');
assert(f1!.gesture === 'POINT', `f1 expected POINT, got ${f1!.gesture}`);
console.log('✓ Point gesture recognized');

const pinchHand = createPinchHand(0.5, 0.5);
const f2 = recognizer.process(pinchHand, 0.95, 1033);
assert(f2!.isPinching === true, 'f2 isPinching true');
assert(f2!.gesture === 'PINCH_START', `f2 expected PINCH_START, got ${f2!.gesture}`);
console.log('✓ PINCH_START edge triggered');

const f3 = recognizer.process(pinchHand, 0.95, 1066);
assert(f3!.isPinching === true, 'f3 isPinching true');
assert(f3!.gesture === 'PINCHING', `f3 expected PINCHING, got ${f3!.gesture}`);
console.log('✓ PINCHING sustained');

const f4 = recognizer.process(pointHand, 0.95, 1100);
assert(f4!.isPinching === false, 'f4 isPinching false');
assert(f4!.gesture === 'PINCH_END', `f4 expected PINCH_END, got ${f4!.gesture}`);
console.log('✓ PINCH_END edge triggered');

// 3. Open Palm Detection
console.log('--- Testing Open Palm Detection ---');
recognizer.reset();
const openPalm = createOpenPalmHand(0.5, 0.5);
const fOpen = recognizer.process(openPalm, 0.95, 1000);
assert(fOpen !== null, 'fOpen should be non-null');
assert(fOpen!.isOpenPalm === true, 'Expected isOpenPalm === true');
assert(fOpen!.gesture === 'OPEN_PALM', `Expected OPEN_PALM gesture, got ${fOpen!.gesture}`);
assert(fOpen!.isPinching === false, 'Open palm must not be pinching');
console.log('✓ Open Palm recognized');

// 4. Open Palm Drop During Drag
console.log('--- Testing Open Palm Drop During Drag ---');
recognizer.reset();
recognizer.process(pinchHand, 0.95, 1000); // PINCH_START
const pinchActive = recognizer.process(pinchHand, 0.95, 1033); // PINCHING
assert(pinchActive!.isPinching === true, 'Must be actively pinching');

// Hand immediately transitions to open palm
const openDrop = recognizer.process(openPalm, 0.95, 1066);
assert(openDrop!.isOpenPalm === true, 'Open palm detected');
assert(openDrop!.isPinching === false, 'Open palm must drop active pinch');
assert(openDrop!.gesture === 'PINCH_END', `Expected PINCH_END release on drop, got ${openDrop!.gesture}`);
console.log('✓ Open Palm drop during drag successfully cancels pinch');

// 5. Double Pinch & Window Activation
console.log('--- Testing Double Pinch Tap Activation ---');
recognizer.reset();

// Tap 1: short pinch (1000 -> 1066 = 66ms < 280ms)
recognizer.process(pinchHand, 0.95, 1000); // PINCH_START
recognizer.process(pinchHand, 0.95, 1033); // PINCHING
const tap1End = recognizer.process(pointHand, 0.95, 1066); // PINCH_END (Tap 1 ends)
assert(tap1End!.gesture === 'PINCH_END', 'Tap 1 ended');
assert(tap1End!.intent === 'default', 'Tap 1 intent should be default');

// Interval between taps: 133ms (1066 to 1200, within 60ms..360ms window)
recognizer.process(pointHand, 0.95, 1100); // Pointing
recognizer.process(pinchHand, 0.95, 1200); // Tap 2 PINCH_START
recognizer.process(pinchHand, 0.95, 1233); // Tap 2 PINCHING
const tap2End = recognizer.process(pointHand, 0.95, 1266); // Tap 2 PINCH_END
assert(tap2End!.gesture === 'DOUBLE_PINCH', `Expected DOUBLE_PINCH, got ${tap2End!.gesture}`);
assert(tap2End!.intent === 'activate', `Expected intent 'activate', got ${tap2End!.intent}`);
console.log('✓ Double-pinch detected and emitted intent = "activate"');

// 6. Movement During Pinch Disqualifies Double Pinch (Drag vs Tap)
console.log('--- Testing Movement Disqualifying Double Pinch ---');
recognizer.reset();
// Tap 1
recognizer.process(pinchHand, 0.95, 1000);
recognizer.process(pointHand, 0.95, 1066);

// Move hand significantly during pinch 2 (> 0.045 distance)
recognizer.process(createPinchHand(0.5, 0.5), 0.95, 1200);
// Move to 0.7 then 0.85
recognizer.process(createPinchHand(0.7, 0.5), 0.95, 1233);
recognizer.process(createPinchHand(0.85, 0.5), 0.95, 1266);
const movingPinchEnd = recognizer.process(createPointHand(0.85, 0.5), 0.95, 1300);
assert(movingPinchEnd!.gesture !== 'DOUBLE_PINCH', 'Moving pinch must not trigger DOUBLE_PINCH');
assert(movingPinchEnd!.intent !== 'activate', 'Moving pinch must not trigger activate');
console.log('✓ Drag movement correctly disqualified double-pinch');

// 6b. A single pinch, and a held one, are never a double pinch
console.log('--- Testing Single and Sustained Pinches ---');
recognizer.reset();
const singleTap: HandFrame[] = [
  recognizer.process(pinchHand, 0.95, 1000)!,
  recognizer.process(pinchHand, 0.95, 1033)!,
  recognizer.process(pointHand, 0.95, 1066)!,
  recognizer.process(pointHand, 0.95, 1400)!,
  recognizer.process(pointHand, 0.95, 1800)!,
];
assert(
  singleTap.every((frame) => frame.intent !== 'activate' && frame.gesture !== 'DOUBLE_PINCH'),
  'A single pinch must never activate',
);

// Two pinches, each held past the tap window: pinches, not taps.
recognizer.reset();
const held: HandFrame[] = [];
held.push(recognizer.process(pinchHand, 0.95, 1000)!);
held.push(recognizer.process(pinchHand, 0.95, 1150)!);
held.push(recognizer.process(pinchHand, 0.95, 1300)!); // 300ms > TAP_MAX_MS
held.push(recognizer.process(pointHand, 0.95, 1333)!);
held.push(recognizer.process(pinchHand, 0.95, 1450)!);
held.push(recognizer.process(pinchHand, 0.95, 1600)!);
held.push(recognizer.process(pinchHand, 0.95, 1750)!);
held.push(recognizer.process(pointHand, 0.95, 1783)!);
assert(
  held.every((frame) => frame.intent !== 'activate' && frame.gesture !== 'DOUBLE_PINCH'),
  'Sustained pinches must never activate',
);
console.log('✓ Single and sustained pinches never activate');

// 7. Pinch-and-Hold Resize Mode Transition
console.log('--- Testing Pinch-and-Hold Spatial Resize Mode ---');
recognizer.reset();
recognizer.process(pinchHand, 0.95, 2000); // PINCH_START
const pinchEarly = recognizer.process(pinchHand, 0.95, 2200); // 200ms in
assert(pinchEarly!.intent === 'move', `Expected intent 'move' early, got ${pinchEarly!.intent}`);

// Hold stationary past 500ms threshold (2000 + 550ms = 2550)
const pinchResize = recognizer.process(pinchHand, 0.95, 2550);
assert(pinchResize!.isPinching === true, 'Still pinching');
assert(pinchResize!.intent === 'scale', `Expected intent 'scale' after 500ms hold, got ${pinchResize!.intent}`);
console.log('✓ Pinch-and-hold stationary transition to scale mode verified');

// 8. Horizontal Swipe Workspace Navigation
console.log('--- Testing Horizontal Swipe Navigation ---');
recognizer.reset();
// Simulate rapid open-palm motion from left (raw x = 0.8 -> mirrored x = 0.2) to right (raw x = 0.2 -> mirrored x = 0.8)
// Screen NDC changes from -0.6 to +0.6 (dx = +1.2 > 0.20, dt = 0.08s -> vx = 15.0 > 1.2)
recognizer.process(createOpenPalmHand(0.8, 0.5), 0.95, 3000);
recognizer.process(createOpenPalmHand(0.5, 0.5), 0.95, 3040);
const swipeFrame = recognizer.process(createOpenPalmHand(0.2, 0.5), 0.95, 3080);
assert(swipeFrame !== null, 'swipeFrame should be non-null');
assert(swipeFrame!.gesture === 'SWIPE', `Expected SWIPE gesture, got ${swipeFrame!.gesture}`);
assert(swipeFrame!.swipeDirection === 'right', `Expected swipeDirection 'right', got ${swipeFrame!.swipeDirection}`);
console.log('✓ Horizontal swipe right detected');

// Test left swipe after cooldown (800ms cooldown: 4000 - 3080 > 800)
recognizer.process(createOpenPalmHand(0.2, 0.5), 0.95, 4000);
recognizer.process(createOpenPalmHand(0.5, 0.5), 0.95, 4040);
const swipeLeft = recognizer.process(createOpenPalmHand(0.8, 0.5), 0.95, 4080);
assert(swipeLeft !== null, 'swipeLeft should be non-null');
assert(swipeLeft!.gesture === 'SWIPE', `Expected SWIPE gesture, got ${swipeLeft!.gesture}`);
assert(swipeLeft!.swipeDirection === 'left', `Expected swipeDirection 'left', got ${swipeLeft!.swipeDirection}`);
console.log('✓ Horizontal swipe left detected');

// 9. Hand Loss Grace Period & Safe Drop
console.log('--- Testing Hand Loss & Safe Release ---');
recognizer.reset();
recognizer.process(pinchHand, 0.95, 5000); // PINCH_START
recognizer.process(pinchHand, 0.95, 5033); // PINCHING

// Hand temporarily lost for 100ms (< 250ms grace)
const lostGrace = recognizer.process(null, 0, 5133);
assert(lostGrace !== null, 'Should hold frame during grace period');
assert(lostGrace!.detected === false, 'detected false during grace');
assert(lostGrace!.isPinching === true, 'isPinching preserved during grace');
console.log('✓ Hand loss grace period held position stably');

// Hand lost for > 250ms
const lostExpired = recognizer.process(null, 0, 5350);
assert(lostExpired !== null, 'Should emit safe release frame on expiration');
assert(lostExpired!.gesture === 'PINCH_END', `Expected safe PINCH_END, got ${lostExpired!.gesture}`);
assert(lostExpired!.isPinching === false, 'isPinching false on safe release');
console.log('✓ Safe PINCH_END emitted on tracking loss during drag');

const lostFinal = recognizer.process(null, 0, 5383);
assert(lostFinal === null, 'Should be null after grace expiration and release');
console.log('✓ Final frame after loss cleanly dropped');

// ---------------------------------------------------------------------------
// The wiring between the camera and the rest of NOVA
//
// Everything above tests what a hand *means*. This tests that the meaning
// reaches anything at all — the seam that had never been covered, and the one
// place where hand tracking could be quietly disconnected without a single
// assertion noticing. It builds no camera: the tracker broadcasts frames to its
// subscribers, and this drives that broadcast directly.
// ---------------------------------------------------------------------------

console.log('--- Testing Hand → PointerFrame → inputRouter wiring ---');

/**
 * Deliver a frame as the tracker's own inference loop would.
 *
 * Reaches the subscriber set the tracker keeps, which is the same set
 * `onFrame` adds to. Done here rather than by adding a seam to the tracker,
 * because production code should not grow an injection point solely so a test
 * can reach it — and because this proves the *real* subscription path is live.
 */
function broadcast(frame: HandFrame | null) {
  const subscribers = (handTracker as unknown as {
    callbacks: Set<(frame: HandFrame | null, video: unknown) => void>;
  }).callbacks;
  for (const callback of subscribers) callback(frame, null);
}

function handFrame(overrides: Partial<HandFrame> = {}): HandFrame {
  const origin: HandPoint = { x: 0.5, y: 0.5, z: 0 };
  return {
    detected: true,
    confidence: 0.92,
    landmarks: new Array(21).fill(origin),
    indexTip: origin,
    thumbTip: origin,
    wrist: origin,
    indexMcp: origin,
    middleMcp: origin,
    pinchDistance: 0.8,
    isPinching: false,
    isOpenPalm: false,
    swipeDirection: null,
    intent: 'default',
    gesture: 'POINT',
    rawIndex: { x: 0.5, y: 0.5 },
    screenNdc: { x: 0, y: 0 },
    timestamp: 0,
    ...overrides,
  };
}

{
  const handSource = createHandInputSource();
  assert(handSource.id === 'hand', 'the hand source identifies itself as "hand"');
  assert(typeof handSource.connect === 'function', 'and satisfies the InputSource contract');
  assert(typeof handSource.disconnect === 'function', 'including disconnect');

  const seen: PointerFrame[] = [];
  inputRouter.setConsumer((frame) => seen.push(frame));
  inputRouter.register(handSource);

  // A pointing hand becomes an ordinary pointer frame. No new vocabulary, no
  // second interaction path — the same structure the mouse produces.
  broadcast(handFrame({ screenNdc: { x: 0.4, y: -0.25 }, confidence: 0.9 }));
  assert(seen.length === 1, `a tracked hand reaches the router, got ${seen.length} frames`);
  assert(seen[0].present === true, 'reported as a present pointer');
  assert(seen[0].x === 0.4 && seen[0].y === -0.25, 'carrying the normalised device coordinates');
  assert(seen[0].primary === false, 'a pointing hand is not pressing');
  assert(seen[0].confidence === 0.9, 'and its tracking confidence');
  assert(seen[0].gesture === 'POINT', 'the gesture travels with the frame');
  assert(
    inputRouter.activeModality() === 'hand',
    `the router attributes the pointer to the hand, got ${inputRouter.activeModality()}`,
  );

  // A pinch is the hand's press. `primary` is the same field a mouse button
  // sets, which is why dragging needs no hand-specific code anywhere.
  seen.length = 0;
  broadcast(handFrame({ isPinching: true, gesture: 'PINCHING', intent: 'move' }));
  assert(seen[0].primary === true, 'a pinch presses the same button a mouse does');
  assert(seen[0].intent === 'move', 'and carries the interaction intent');

  // Losing the hand releases it, rather than leaving a pointer pressed in space.
  seen.length = 0;
  broadcast(null);
  assert(seen.length === 1, 'losing the hand emits one final frame');
  assert(seen[0].present === false, 'marking the pointer absent');
  assert(seen[0].primary === false, 'and releasing the press');

  // A second loss says nothing: there is nothing left to release.
  seen.length = 0;
  broadcast(null);
  assert(seen.length === 0, 'a hand that is already gone emits nothing further');

  console.log('✓ Hand frames become PointerFrames and reach the input router');

  // Arbitration: the mouse may take over mid-task, and the hand may take it back.
  const mouseLike: InputSource = {
    id: 'mouse',
    connect() {},
    disconnect() {},
  };
  inputRouter.register(mouseLike);
  seen.length = 0;
  broadcast(handFrame({ confidence: 0.95 }));
  assert(inputRouter.activeModality() === 'hand', 'the hand holds the pointer while confident');
  console.log('✓ Mouse and hand share one pointer stream, arbitrated by confidence');

  inputRouter.unregister('mouse');
  inputRouter.unregister(handSource.id);
  seen.length = 0;
  broadcast(handFrame());
  assert(seen.length === 0, 'an unregistered hand source reaches nothing');
  console.log('✓ Unregistering the hand source cleanly detaches it');
}

console.log('\n========================================');
console.log('ALL VISION TEST SUITES PASSED! 🎉');
console.log('========================================');
