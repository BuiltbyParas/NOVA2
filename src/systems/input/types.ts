/**
 * The input abstraction.
 *
 * NOVA never listens to DOM mouse events outside of this folder. Everything that
 * can point at something in the environment produces `PointerFrame`s, and the
 * interaction system consumes only those. A webcam hand tracker becomes a new
 * `InputSource` emitting the same frames — no other part of NOVA changes.
 */
export interface PointerFrame {
  /** Normalised device coordinates: -1..1, +y up. Resolution independent. */
  x: number;
  y: number;
  /** The "select" signal. Mouse button today; a pinch gesture later. */
  primary: boolean;
  /** Whether a pointer is present in the environment at all. */
  present: boolean;
  /** Push/pull along depth. Wheel today; hand distance from the camera later. */
  depthDelta: number;
  modifiers: {
    shift: boolean;
    alt: boolean;
    meta: boolean;
  };
  /** 0..1. Always 1 for a mouse; a tracked hand reports how sure it is. */
  confidence: number;
  /** Active gesture state if emitted by a vision hand tracker. */
  gesture?: string;
  /** High-level interaction intent inferred from the input pattern. */
  intent?: 'move' | 'scale' | 'activate' | 'default';
}

/**
 * Anything NOVA can be operated with.
 *
 * Generic in what it emits, because not every input device points at something.
 * Mouse and hand produce `PointerFrame`s and are arbitrated by `inputRouter`;
 * voice produces a finished utterance and goes to the command pipeline instead.
 * Forcing speech into a pointer event would be a lie about what was said, so the
 * abstraction widens rather than the modality bending to fit it.
 *
 * The default type parameter keeps every existing `InputSource` unchanged.
 */
export interface InputSource<TEvent = PointerFrame> {
  readonly id: string;
  connect(emit: (event: TEvent) => void): void;
  disconnect(): void;
}

export const IDLE_FRAME: PointerFrame = {
  x: 0,
  y: 0,
  primary: false,
  present: false,
  depthDelta: 0,
  modifiers: { shift: false, alt: false, meta: false },
  confidence: 1,
};
