import type { GestureObservation } from './gestureIntent';
import { gestureIntent } from './gestureIntent';
import { currentReferent } from './interactionContext';
import { routeUtterance } from '../command/intentRouter';

/**
 * Where a gesture's intention goes.
 *
 * Nowhere new. The utterance it produces is handed to `routeUtterance` — the
 * same function the command line calls when you type and the voice pipeline
 * calls when you speak. There is no gesture branch inside it, no second command
 * bus, and no gesture-specific launcher: a double pinch on Terminal and the
 * words "open terminal" are the same instruction arriving by different means.
 *
 * This file is the whole of Phase 9.5B's runtime cost: it reads the referent,
 * asks a pure function what the gesture means, and passes a sentence on.
 */

/**
 * Set once, in development, so the path a gesture took can be read at a glance.
 *
 * Guarded rather than read directly: `import.meta.env` is Vite's, and this
 * module is also loaded by the verification suites, which run under plain Node.
 */
const TRACE = typeof import.meta.env !== 'undefined' && Boolean(import.meta.env.DEV);

/**
 * Act on one gesture, if it means anything.
 *
 * Returns whether an intention was produced, so the caller can tell "the
 * gesture said nothing" from "the gesture was acted on" without inspecting
 * state. Never throws: a gesture that cannot be resolved is a no-op, because
 * the alternative is an unasked-for application appearing on someone's screen.
 *
 * Deliberately not awaited by its caller — this is invoked from the interaction
 * layer, and a network round trip must never sit inside a frame.
 */
export function performGestureIntent(observation: GestureObservation): boolean {
  const referent = currentReferent();
  const intention = gestureIntent(observation, referent);

  if (!intention) {
    if (TRACE && observation.gesture === 'DOUBLE_PINCH') {
      // Worth one line: a double pinch that did nothing is the case a person
      // is most likely to be puzzled by.
      console.info(
        `[Gesture] DOUBLE_PINCH → no command (referent: ${referent.status}, ` +
          `confidence: ${observation.confidence.toFixed(2)})`,
      );
    }
    return false;
  }

  if (TRACE) {
    console.info(
      `[Gesture] ${intention.gesture} → referent=${intention.target} → ` +
        `${intention.action} · "${intention.utterance}"`,
    );
  }

  // The identical entry point typing and speech use. Fire and forget: the
  // result reaches the user through the ordinary notice and trace machinery.
  void routeUtterance(intention.utterance, 'gesture');
  return true;
}
