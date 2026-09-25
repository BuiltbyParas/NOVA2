import type { ModalitySignal, MultimodalReferent, ReferentTier } from '../../types/multimodal';

/**
 * Turning device observations into a referent — as a pure function.
 *
 * Separate from `interactionContext` so the context graph can compute a
 * referent from a snapshot without importing live device state. That keeps
 * `buildContextGraph` pure, which is the property Phase 4 rests on and Phase 5
 * reuses: the same code reads a live world, a fixture, and a saved memory.
 */

/**
 * How long a pointing or selecting act stays available as a referent.
 *
 * Long enough to point and then speak a sentence; short enough that a gesture
 * made a minute ago cannot silently steer a later instruction.
 */
export const REFERENT_TTL_MS = 8_000;

/**
 * Below this, a tracked hand is not sure enough to be taken as a deliberate
 * reference. A half-detected fingertip drifting across a surface is not the
 * user pointing at it, and must never drive a command.
 */
export const MIN_HAND_CONFIDENCE = 0.6;

/** A signal counts only if it is recent, aimed at something, and confident. */
export function usableSignal(signal: ModalitySignal, now: number): boolean {
  if (!signal.target) return false;
  if (now - signal.at > REFERENT_TTL_MS) return false;
  if (signal.modality === 'hand' && signal.confidence < MIN_HAND_CONFIDENCE) return false;
  return true;
}

/**
 * What "this" refers to, given everything the devices have said.
 *
 * The priority model, in full, and deliberately a ladder rather than a blend:
 *
 *   1. `select` — somebody clicked or pinched a window. A decision was taken.
 *   2. `point`  — a device is aimed at a window. A direction was indicated.
 *   3. (nothing here) — the caller falls back to the focused window, then to
 *      the most recently interacted one, exactly as Phase 4 already did.
 *
 * Tiers never mix. The strongest tier holding a live signal decides, and the
 * weaker ones are not consulted — so a hand pointing at Code beats a mouse
 * having focused Browser earlier, because pointing is the more recent and more
 * explicit act. That is stated here rather than left to be discovered.
 *
 * Within a tier, two devices aimed at different windows is genuine ambiguity.
 * NOVA reports it and the caller asks, because there is no honest reason to
 * rank a mouse above a hand.
 */
/**
 * Has this device since aimed itself somewhere else?
 *
 * One device has one current intention. Clicking the Browser and then aiming at
 * the Terminal is not two live references — it is a person who has moved on,
 * and the older act is spent. Without this the stronger tier held: a click two
 * seconds ago beat the window the cursor was visibly resting on, so "open this"
 * opened the thing the user had stopped pointing at.
 *
 * Scoped to *one* device on purpose. A hand pointing at the Terminal must not
 * erase a mouse click on the Browser — that is two people's worth of intent
 * disagreeing, which is genuine ambiguity and is reported as such.
 */
function superseded(selection: ModalitySignal, signals: ModalitySignal[], now: number): boolean {
  return signals.some(
    (signal) =>
      signal.type === 'point' &&
      signal.modality === selection.modality &&
      signal.at > selection.at &&
      signal.target !== null &&
      signal.target !== selection.target &&
      usableSignal(signal, now),
  );
}

export function resolveReferent(signals: ModalitySignal[], now: number): MultimodalReferent {
  const tiers: ReferentTier[] = ['select', 'point'];

  for (const tier of tiers) {
    const live = signals
      .filter((signal) => signal.type === tier && usableSignal(signal, now))
      .filter((signal) => tier !== 'select' || !superseded(signal, signals, now))
      .sort((a, b) => b.at - a.at);

    if (!live.length) continue;

    // One reading per device: several observations from the same hand mean the
    // hand moved, and the newest is what it is aimed at now. Only *different*
    // devices disagreeing is ambiguity.
    const byModality = new Map<string, ModalitySignal>();
    for (const signal of live) {
      if (!byModality.has(signal.modality)) byModality.set(signal.modality, signal);
    }
    const current = [...byModality.values()];

    const distinct = new Set(current.map((signal) => signal.target));
    if (distinct.size > 1) {
      // One entry per window, the most confident, so the question NOVA asks
      // lists each candidate once rather than once per device.
      const byWindow = new Map<string, ModalitySignal>();
      for (const signal of current) {
        const held = byWindow.get(signal.target!);
        if (!held || signal.confidence > held.confidence) byWindow.set(signal.target!, signal);
      }
      return {
        status: 'ambiguous',
        tier,
        candidates: [...byWindow.values()].map((signal) => ({
          windowId: signal.target!,
          modality: signal.modality,
          confidence: signal.confidence,
        })),
      };
    }

    const winner = current[0];
    return {
      status: 'resolved',
      windowId: winner.target!,
      modality: winner.modality,
      tier,
      confidence: winner.confidence,
      at: winner.at,
    };
  }

  return { status: 'none' };
}
