/**
 * NOVA's voice vocabulary.
 *
 * Phase 6 adds one input device, not one intelligence. Everything in this file
 * stops at *text*: what the user said, how confident the recogniser was, and
 * what went wrong. Nothing here knows what a window is, and nothing downstream
 * of a transcript is different from what typing already goes through.
 *
 * No field holds audio, and none ever should. NOVA keeps the recognised words
 * for exactly as long as it takes to act on them.
 */

/**
 * The lifecycle of one spoken instruction.
 *
 * `unsupported` is a resting state, not an error: a browser without speech
 * recognition is a browser NOVA works fine in, minus one input device.
 */
export type VoiceState =
  | 'unsupported'
  | 'idle'
  /**
   * The microphone has been asked for but the engine is not yet running.
   *
   * Its own state rather than a shade of `listening`, because the interface
   * must never claim to be hearing someone while a permission prompt is still
   * on screen. Between pressing the key and the engine's `onstart`, the honest
   * word is "starting".
   */
  | 'starting'
  | 'listening'
  | 'processing'
  | 'success'
  | 'error';

export type VoiceErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-microphone'
  | 'no-speech'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface VoiceError {
  code: VoiceErrorCode;
  /** Phrased for the person, not for the console. */
  message: string;
}

/** What the browser will say about the microphone without prompting for it. */
export type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied';

/**
 * A finished utterance.
 *
 * Only ever constructed from a *final* recognition result. Interim text is
 * shown and then thrown away — acting on it would mean executing half a
 * sentence, which in a spatial interface means moving the wrong thing and then
 * moving it again.
 */
export interface VoiceCommandEvent {
  transcript: string;
  confidence: number;
  at: number;
}

/** What the speech engine reports back while it is running. */
export interface RecognizerHandlers {
  onStart(): void;
  onInterim(text: string): void;
  onFinal(text: string, confidence: number): void;
  onError(error: VoiceError): void;
  onEnd(): void;
}

/**
 * Speech to text, behind an interface.
 *
 * The Web Speech API is the implementation Phase 6 ships. Keeping it behind
 * three methods means the engine can be replaced — and, more immediately, that
 * the whole voice layer can be driven deterministically in a test without a
 * microphone, which is the only way any of this is verifiable.
 */
export interface SpeechRecognizer {
  readonly supported: boolean;
  start(handlers: RecognizerHandlers): void;
  /** Finish: stop capturing and deliver whatever was heard. */
  stop(): void;
  /** Cancel: stop capturing and discard it. */
  abort(): void;
}
