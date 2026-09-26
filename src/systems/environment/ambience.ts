import { spatial } from '../../state/spatialStore';
import { subscribeToCommands } from '../command/commandBus';
import { voice } from '../voice/voiceStore';
import { useIntelligenceStore } from '../intelligence/intelligenceSession';
import { handTracker } from '../../vision/handTracker';
import { MIN_HAND_CONFIDENCE } from '../multimodal/referentResolution';

/**
 * How the room responds (Phase 11, extended in 11B).
 *
 * The environment reacts to things NOVA already knows — a hand in view and
 * where it is, the microphone listening, the Intelligence Core thinking and
 * finishing, a sentence being carried out, an application opening — and to
 * nothing else. This file turns those facts into a few numbers and short-lived
 * pulses the renderer eases towards; it never animates anything itself.
 *
 * Two rules keep it honest and cheap:
 *
 *   - **State, not decoration.** A response means something is true right now.
 *     The room's only unprompted motion is its idle drift, which is slow,
 *     deterministic and computed on the GPU from time alone.
 *   - **Read, never act.** It observes stores and command envelopes; it
 *     dispatches nothing, fetches nothing and touches nothing native. The frame
 *     loop that reads it does only arithmetic.
 */

/** What the room is responding to at this moment. */
export interface AmbientSignals {
  /** A confident hand has been seen within the last moment. */
  handPresent: boolean;
  /** The microphone is open. */
  listening: boolean;
  /** The Intelligence Core is working on an answer. */
  thinking: boolean;
}

/** What the renderer eases towards. Both 0..1. */
export interface AmbientTargets {
  /** The room "waking": the floor and wall grids firm up while a hand is present. */
  wake: number;
  /** NOVA's own light: the accent in the stage light, and the Core's activity. */
  glow: number;
}

/**
 * The mapping, in full. Pure, so it can be pinned by a test.
 *
 * Thinking is the strongest because it is the longest wait; listening is a
 * little softer; a hand only firms the field, it never lights NOVA, because a
 * hand in view is not NOVA doing anything.
 */
export function ambientTargets(signals: AmbientSignals): AmbientTargets {
  return {
    wake: signals.handPresent ? 1 : 0,
    glow: signals.thinking ? 0.8 : signals.listening ? 0.55 : 0,
  };
}

/** The one word the NOVA Spatial Core is in. Strongest state wins. */
export type CoreMode = 'thinking' | 'listening' | 'hand' | 'idle';

export function coreMode(signals: AmbientSignals): CoreMode {
  if (signals.thinking) return 'thinking';
  if (signals.listening) return 'listening';
  if (signals.handPresent) return 'hand';
  return 'idle';
}

/** What the in-space status label says for each mode. Short, and never optimistic. */
export const CORE_MODE_LABEL: Record<CoreMode, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  hand: 'Hand tracked',
};

/**
 * How strongly the Core is moving, per mode — its rings' speed as a multiple of
 * the idle drift. Idle is deliberately slow; thinking is the only fast state.
 */
export const CORE_MODE_ENERGY: Record<CoreMode, number> = {
  idle: 1,
  hand: 1.4,
  listening: 2.2,
  thinking: 3.6,
};

// --- pulses ------------------------------------------------------------------------

/**
 * Brief responses to things that just happened.
 *
 *   - `command` — NOVA carried out a sentence (typed, spoken, or from the
 *     Intelligence Core): a quick kick of the Core.
 *   - `open` — an application opened: a wave travels out from the Core across
 *     the floor.
 *   - `settle` — the Intelligence Core finished answering: the Core eases back
 *     down, visibly, rather than simply stopping.
 *
 * Each is a timestamp; the renderer turns "how long ago" into a falloff.
 */
export type PulseKind = 'command' | 'open' | 'settle';

export const PULSE_MS: Record<PulseKind, number> = {
  command: 650,
  open: 1_800,
  settle: 1_100,
};

const pulses: Record<PulseKind, number> = { command: -Infinity, open: -Infinity, settle: -Infinity };

export function triggerPulse(kind: PulseKind, at: number = performance.now()) {
  if (reducedMotion) return;
  pulses[kind] = at;
}

/** 0..1 progress through a pulse, or null when none is running. */
export function pulseProgress(kind: PulseKind, now: number = performance.now()): number | null {
  const t = (now - pulses[kind]) / PULSE_MS[kind];
  return t >= 0 && t < 1 ? t : null;
}

export function clearPulses() {
  pulses.command = pulses.open = pulses.settle = -Infinity;
}

/**
 * Which command envelopes count as NOVA "carrying out" something.
 *
 * Only sentences — the command line, voice, the Intelligence Core — and a
 * gesture's activation. Dragging dispatches a move every frame and clicking
 * dispatches focus; those are the user's own hands at work, not NOVA acting, so
 * they do not pulse. NOVA's own start-up arrangement (`system`) does not either.
 */
const SENTENCE_SOURCES = new Set(['command-line', 'voice', 'ai']);
const QUIET_ACTIONS = new Set(['move', 'scale', 'rotate', 'blur', 'command', 'vision-debug', 'context-debug']);

export function isCarriedOut(action: string, source: string): boolean {
  if (QUIET_ACTIONS.has(action)) return false;
  if (SENTENCE_SOURCES.has(source)) return true;
  return source === 'gesture' && (action === 'open' || action === 'open-application');
}

// --- ripples ------------------------------------------------------------------

/**
 * One ripple of light when an application opens.
 *
 * Opening is the moment worth marking in the room: an air click lands as
 * `open <window>`, and so does the Command Deck, a typed or spoken `open`, and a
 * native launch. A ring of light spreads once across the far wall, directly
 * behind what opened, and is gone — focusing, dragging and pointing leave the
 * room alone. (The wall, not the floor: at NOVA's viewing angle the floor
 * beneath the windows is below the frame.)
 */
export const RIPPLE_MS = 1_400;

/** Where the ripple started — the world position of what opened — and when. */
export interface Ripple {
  x: number;
  y: number;
  z: number;
  at: number;
}

let ripple: Ripple | null = null;
let reducedMotion = false;

export function triggerRipple(x: number, y: number, z: number, at: number = performance.now()) {
  if (reducedMotion) return;
  ripple = { x, y, z, at };
}

/** How far the current ripple has travelled, 0..1, or null when there is none. */
export function rippleProgress(
  now: number = performance.now(),
): { x: number; y: number; z: number; t: number } | null {
  if (!ripple) return null;
  const t = (now - ripple.at) / RIPPLE_MS;
  if (t < 0 || t >= 1) return null;
  return { x: ripple.x, y: ripple.y, z: ripple.z, t };
}

/**
 * Where a point lands on the far wall, seen from the viewpoint.
 *
 * Pure. The ripple is drawn at the point on the wall directly behind the object
 * along the line of sight, so it appears to spread from behind the window that
 * opened, whatever the parallax; the wall's arcs are centred the same way behind
 * the Spatial Core. `out` lets a frame loop reuse one object instead of
 * allocating.
 */
export function projectOntoWall(
  point: { x: number; y: number; z: number },
  eye: { x: number; y: number; z: number },
  wallZ: number,
  out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const dz = point.z - eye.z;
  if (Math.abs(dz) < 1e-6) {
    out.x = point.x;
    out.y = point.y;
    return out;
  }
  const k = (wallZ - eye.z) / dz;
  out.x = eye.x + (point.x - eye.x) * k;
  out.y = eye.y + (point.y - eye.y) * k;
  return out;
}

export function clearRipple() {
  ripple = null;
}

/** For tests, and for a user who has asked for less motion. */
export function setReducedMotion(reduced: boolean) {
  reducedMotion = reduced;
  if (reduced) {
    ripple = null;
    clearPulses();
  }
}

/** Whether the user has asked for less motion. The idle drift respects it too. */
export function prefersReducedMotion(): boolean {
  return reducedMotion;
}

// --- signals --------------------------------------------------------------------

/** How long a hand stays "present" after it was last seen. Matches the HUD's hold. */
const HAND_HOLD_MS = 600;
let handSeenAt = -Infinity;

/** Read the signals now. Store reads only — safe to call once per frame. */
export function readAmbientSignals(now: number = performance.now()): AmbientSignals {
  const heard = voice().state;
  return {
    handPresent: spatial().visionActive && now - handSeenAt < HAND_HOLD_MS,
    listening: heard === 'starting' || heard === 'listening',
    thinking: useIntelligenceStore.getState().status === 'thinking',
  };
}

/** For tests: record a confident hand as seen at `at`. */
export function noteHandSeen(at: number = performance.now()) {
  handSeenAt = at;
}

/**
 * Start listening. Returns the stop function.
 *
 * Subscribes to the command bus for openings and to hand frames for presence —
 * both push-based, so the frame loop never polls anything slow.
 */
export function startAmbience(): () => void {
  const stopCommands = subscribeToCommands(({ command, source }) => {
    if (isCarriedOut(command.action, source)) triggerPulse('command');
    // Phase 12: the portal blooming open sends the opening wave through the room
    // and flares the bloom; folding it away settles.
    if (command.action === 'portal') triggerPulse(command.open ? 'open' : 'settle');
    if (command.action === 'open') {
      const win = spatial().windows[command.target];
      if (win) triggerRipple(win.position.x, win.position.y, win.position.z);
      triggerPulse('open');
      return;
    }
    if (command.action === 'open-application') {
      // A real application has no place in the room; the ripple leaves the Core,
      // because it is NOVA that reached out to the computer.
      const core = spatial().core.position;
      triggerRipple(core.x, core.y, core.z);
      triggerPulse('open');
    }
  });

  const stopHands = handTracker.onFrame((frame) => {
    if (frame && frame.detected && frame.confidence >= MIN_HAND_CONFIDENCE) noteHandSeen();
  });

  // An answer finishing is a moment worth marking: thinking → idle settles the Core.
  const stopIntelligence = useIntelligenceStore.subscribe((state, previous) => {
    if (previous.status === 'thinking' && state.status === 'idle') triggerPulse('settle');
  });

  return () => {
    stopCommands();
    stopHands();
    stopIntelligence();
    ripple = null;
    clearPulses();
  };
}
