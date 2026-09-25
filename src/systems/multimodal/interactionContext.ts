import type { InputModality, ModalitySignal, MultimodalReferent } from '../../types/multimodal';
import type { CommandSource } from '../../types/command';
import { MIN_HAND_CONFIDENCE, REFERENT_TTL_MS, resolveReferent } from './referentResolution';

/**
 * What the devices are currently referring to.
 *
 * This is the whole of Phase 7's new state, and it is deliberately tiny: a
 * handful of recent observations, none older than a few seconds. It is **not**
 * memory. Spatial Memory (Phase 5) remembers arrangements on purpose and
 * forever; this remembers that a finger was aimed at the browser a moment ago,
 * and forgets it shortly after.
 *
 * Nothing here executes anything. It answers one question — "which window does
 * 'this' mean?" — and hands the answer to the Phase 4 resolver, which is still
 * the only thing that resolves references.
 */

export { MIN_HAND_CONFIDENCE, REFERENT_TTL_MS };

/** Signals kept per (modality, tier). Only the most recent of each matters. */
const signals = new Map<string, ModalitySignal>();

let revision = 0;
/** Notified when the referent may have changed, so caches can invalidate. */
const listeners = new Set<() => void>();

const key = (modality: InputModality, type: string) => `${modality}:${type}`;

/**
 * The clock this layer runs on.
 *
 * `performance.now()`, deliberately, because the context snapshot is stamped
 * with it and the two are compared against each other. These timestamps measure
 * elapsed time inside one session and are never persisted — Spatial Memory uses
 * wall-clock time, and that difference is exactly the difference between the
 * two layers.
 */
const now = () => performance.now();

function changed() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function onReferentChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bumped whenever a signal lands. Cheap enough to compare every frame. */
export function referentRevision(): number {
  return revision;
}

/**
 * Record what a device is aimed at.
 *
 * Called only when the target *changes*, never per frame: NOVA's frame loop
 * stays free of multimodal work, and a drag across a surface costs one map
 * write at the moment it crosses a boundary.
 */
export function notePointing(
  modality: InputModality,
  target: string | null,
  confidence: number,
  at: number = now(),
) {
  const previous = signals.get(key(modality, 'point'));
  if (previous?.target === target) return;
  signals.set(key(modality, 'point'), { modality, type: 'point', target, confidence, at });
  changed();
}

/** Record a deliberate act on a window: a click, a pinch, a keyboard focus. */
export function noteSelection(
  modality: InputModality,
  target: string,
  confidence = 1,
  at: number = now(),
) {
  const slot = key(modality, 'select');
  const previous = signals.get(slot);
  signals.set(slot, { modality, type: 'select', target, confidence, at });
  // Dragging dispatches a command every frame, and every one of them is the
  // same act on the same window. Refresh the timestamp, but only wake anything
  // up when the window itself changed.
  if (previous?.target !== target) changed();
}

/** Record words, for the developer trace only. Resolution happens elsewhere. */
export function noteUtterance(modality: InputModality, text: string, at: number = now()) {
  signals.set(key(modality, 'utterance'), {
    modality,
    type: 'utterance',
    target: null,
    confidence: 1,
    at,
    text,
  });
  changed();
}

/** Every live signal, newest first. For the inspector and for tests. */
export function activeSignals(at: number = now()): ModalitySignal[] {
  return [...signals.values()]
    .filter((signal) => at - signal.at <= REFERENT_TTL_MS)
    .sort((a, b) => b.at - a.at);
}

/** Forget everything. Used on teardown and between test cases. */
export function clearInteractionContext() {
  signals.clear();
  changed();
}

/**
 * Which modality a command envelope came from.
 *
 * The command bus has always labelled its envelopes; this reads that label
 * rather than introducing a parallel notion of where input comes from.
 */
export function modalityOfSource(source: CommandSource): InputModality {
  switch (source) {
    case 'pointer':
      return 'mouse';
    case 'gesture':
      return 'hand';
    case 'voice':
      return 'voice';
    case 'command-line':
      return 'text';
    case 'keyboard':
      return 'keyboard';
    default:
      return 'system';
  }
}

/**
 * What "this" currently refers to, across every device.
 *
 * The priority model lives in `referentResolution`, as a pure function, so the
 * live answer and the answer computed from a snapshot cannot drift apart.
 */
export function currentReferent(at: number = now()): MultimodalReferent {
  return resolveReferent([...signals.values()], at);
}
