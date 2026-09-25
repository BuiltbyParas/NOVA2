import type { InputModality, MultimodalReferent } from '../../types/multimodal';
import { MIN_HAND_CONFIDENCE } from './referentResolution';

/**
 * What a gesture means.
 *
 * A pure function, and deliberately a very small one: a gesture plus whatever
 * the devices are currently indicating, in — an intention, or nothing, out. It
 * decides *whether* and *what*, never *how*. It cannot reach the spatial store,
 * the command bus or the operating system, and it holds no state of its own.
 *
 * ── Why the intention is also a sentence ─────────────────────────────────────
 * Pointing at Terminal and double-pinching should mean exactly what typing
 * "open terminal" means — not something similar, and not a gesture-only shortcut
 * that happens to look the same. So the intention carries the canonical
 * utterance alongside its structured form, and the driver hands that to
 * `routeUtterance`, the one place every spoken and typed sentence already goes.
 *
 * That equivalence is free architecture: when a later phase teaches gestures to
 * close, resize or move something, the intent stack, the context engine, the
 * ambiguity handling and the native launch path all already understand it.
 */

/** The part of a hand frame a gesture's meaning depends on. */
export interface GestureObservation {
  /** A `GestureState` from the recogniser — `DOUBLE_PINCH`, `PINCHING`, … */
  gesture: string;
  /** 0–1, as the tracker reported it. */
  confidence: number;
}

export interface GestureCommandIntent {
  gesture: 'DOUBLE_PINCH';
  action: 'OPEN';
  /** The window the referent resolved to. Always one NOVA already knows. */
  target: string;
  /** The sentence this gesture is equivalent to: `"open terminal"`. */
  utterance: string;
  modality: InputModality;
  confidence: number;
}

/**
 * Gestures that carry a command.
 *
 * Exactly one today. Everything else — pointing, pinching, dragging, swiping,
 * an open palm — keeps the spatial meaning it already had, and must not acquire
 * a second one here. A pinch that both drags a window *and* opened something
 * would make dragging unusable.
 */
const COMMANDING_GESTURES = new Set(['DOUBLE_PINCH']);

/**
 * Read one gesture as an intention.
 *
 * Returns null far more often than not, and every one of those paths matters:
 *
 *   - the gesture carries no command (a point, a drag, a swipe, a palm)
 *   - nothing is being indicated, so there is no object to act on
 *   - two devices indicate different things, which is a question, not a command
 *   - the hand was not confident enough to be taken as deliberate
 *
 * A gesture is a blunt instrument. Acting on an unclear one means opening
 * something the user did not ask for, so the bar to produce a command at all is
 * deliberately high.
 */
export function gestureIntent(
  observation: GestureObservation,
  referent: MultimodalReferent,
): GestureCommandIntent | null {
  if (!COMMANDING_GESTURES.has(observation.gesture)) return null;

  // The referent resolver already applies this floor to the signals it stores;
  // applying it again here means the gesture layer cannot be handed a confident
  // referent by one code path and a doubtful gesture by another.
  if (observation.confidence < MIN_HAND_CONFIDENCE) return null;

  // `ambiguous` and `none` both mean NOVA does not know what is being pointed
  // at. Neither is something to guess at with a gesture.
  if (referent.status !== 'resolved') return null;

  return {
    gesture: 'DOUBLE_PINCH',
    action: 'OPEN',
    target: referent.windowId,
    utterance: `open ${referent.windowId}`,
    modality: referent.modality,
    confidence: observation.confidence,
  };
}
