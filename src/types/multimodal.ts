/**
 * NOVA's multimodal vocabulary.
 *
 * By Phase 6 NOVA had three ways of being operated and one way of executing
 * anything. Phase 7 does not add a fourth way of executing; it adds a shared,
 * short-lived record of *what each device is currently referring to*, so that a
 * sentence spoken while pointing can mean what it obviously means.
 *
 * The rule this file exists to keep: a modality contributes a **referent**, not
 * a command. Pointing at a window says "that one". It never says "move it".
 */

/**
 * How NOVA was addressed. `system` covers NOVA's own startup arrangement, which
 * is not a person and therefore never a referent.
 */
export type InputModality = 'mouse' | 'hand' | 'voice' | 'text' | 'keyboard' | 'system';

/**
 * What a device said about an object, in ascending order of deliberateness.
 *
 * - `point`  — the device is aimed at this window (hover, fingertip).
 * - `select` — the user acted on it (click, pinch). Stronger: it took a decision.
 * - `focus`  — this window became the focused one, by whatever route.
 *
 * `utterance` is recorded for the developer trace only; words are resolved by
 * the context engine, never by this layer.
 */
export type ModalitySignalType = 'point' | 'select' | 'focus' | 'utterance';

/**
 * One normalised observation from one device.
 *
 * Deliberately free of hardware detail: the context engine consumes these
 * without knowing whether a target came from a mouse ray, a fingertip, or a
 * keyboard shortcut. A future device only has to produce these.
 */
export interface ModalitySignal {
  modality: InputModality;
  type: ModalitySignalType;
  /** The application identity referred to, or null when the device points at nothing. */
  target: string | null;
  /** 0–1. Always 1 for a mouse; a tracked hand reports how sure it is. */
  confidence: number;
  at: number;
  /** Present only on `utterance` signals, for the developer trace. */
  text?: string;
}

/** Which tiers can supply a referent, strongest first. */
export type ReferentTier = 'select' | 'point';

/**
 * What the devices, taken together, currently point at.
 *
 * `ambiguous` is a real outcome and not a failure: two devices aimed at
 * different windows with equal authority is a question, not a guess. NOVA would
 * rather ask which one than move the wrong surface.
 */
export type MultimodalReferent =
  | { status: 'none' }
  | {
      status: 'resolved';
      windowId: string;
      modality: InputModality;
      tier: ReferentTier;
      confidence: number;
      at: number;
    }
  | {
      status: 'ambiguous';
      tier: ReferentTier;
      candidates: Array<{ windowId: string; modality: InputModality; confidence: number }>;
    };

/**
 * One pass through NOVA, recorded for the developer inspector.
 *
 * Never used to decide anything. It exists so the path an instruction took —
 * which device supplied the referent, what the words were, what they resolved
 * to, and which commands came out — can be read at a glance while building.
 */
export interface PipelineTrace {
  at: number;
  /** The device that supplied the referent, if any. */
  inputModality: InputModality | null;
  inputTarget: string | null;
  /** The words, and where they came from. */
  utterance: string | null;
  utteranceModality: InputModality | null;
  /** How a contextual reference was settled, in plain language. */
  resolution: string | null;
  /** The structured intent, summarised. */
  intent: string | null;
  /** The commands that reached the bus. */
  commands: string[];
  result: 'success' | 'clarification' | 'unresolved' | 'error';
  detail?: string;
}
