import { useEffect, useState } from 'react';
import { handTracker } from './handTracker';
import { MIN_HAND_CONFIDENCE } from '../systems/multimodal/referentResolution';

/**
 * Whether a hand is actually being seen right now.
 *
 * The camera running and NOVA tracking a hand are different facts, and the
 * interface had been reporting the first as though it were the second: the
 * moment `handTracker.start()` resolved, the HUD said "Tracking" — over an
 * empty room, with no hand anywhere near the lens. That is the same class of
 * untruth as showing "Listening" over a closed microphone, and it is worth one
 * small observer to avoid.
 *
 * Read-only. It subscribes to the frames the tracker already broadcasts, holds
 * no landmark data, and keeps no history. Nothing here can move a window.
 */

/**
 * How long a hand may vanish before NOVA stops claiming to track it.
 *
 * The recogniser already bridges brief detection gaps of its own; this is the
 * label's own patience, so a single dropped frame does not flicker the HUD
 * between two words while somebody is holding their hand perfectly still.
 */
const PRESENCE_HOLD_MS = 600;

export function useHandPresence(active: boolean): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    // Nothing to observe while the camera is off. The value is masked on the
    // way out rather than reset here, so the hook never sets state during the
    // render that turned tracking off.
    if (!active) return;

    let current = false;
    let lastSeen = 0;
    let timer: number | null = null;

    /**
     * Only a *change* reaches React.
     *
     * Frames arrive at camera rate. Rendering the interface thirty times a
     * second to re-draw a word that has not changed is precisely the cost NOVA
     * cannot afford over a live WebGL canvas, so the boolean is compared here
     * and the setter is called perhaps twice a minute.
     */
    const publish = (next: boolean) => {
      if (next === current) return;
      current = next;
      setPresent(next);
    };

    const unsubscribe = handTracker.onFrame((frame) => {
      const seen =
        frame !== null && frame.detected && frame.confidence >= MIN_HAND_CONFIDENCE;

      if (seen) {
        lastSeen = performance.now();
        publish(true);
        return;
      }

      // Not a loss yet — give the hand a moment to come back before saying so.
      if (!current) return;
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (performance.now() - lastSeen >= PRESENCE_HOLD_MS) publish(false);
      }, PRESENCE_HOLD_MS);
    });

    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
      setPresent(false);
    };
  }, [active]);

  // Masked rather than trusted: a stale `true` from the frame before the camera
  // stopped must never read as a hand that is still there.
  return active && present;
}
