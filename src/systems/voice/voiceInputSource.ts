import type { InputSource } from '../input/types';
import type {
  SpeechRecognizer,
  VoiceCommandEvent,
  VoiceError,
  VoiceErrorCode,
} from '../../types/voice';
import { createSpeechRecognizer } from './speechRecognizer';
import { ensureMicrophone, microphoneAvailable, releaseMicrophone } from './microphone';
import { useVoiceStore, voice } from './voiceStore';

/**
 * Voice, as an input source.
 *
 * It sits exactly where the mouse source and the hand source sit: it turns a
 * device into something NOVA understands and hands it on. What it hands on is a
 * finished sentence — and that is the last point at which voice is involved.
 * Nothing in this file knows what a window is, and nothing in it can move one.
 *
 * The one thing it guards carefully is *when* a sentence counts. Interim results
 * are published to the store so listening looks like listening, and are then
 * discarded. Only a final result is emitted.
 *
 * ── Why a listen is not a recognition session ────────────────────────────────
 * `SpeechRecognition` ends itself constantly. It ends after one phrase, after a
 * second of silence, and on `no-speech` before the user has finished deciding
 * what to say. Treating each of those as the end of listening is why NOVA
 * appeared not to hear anyone: the indicator went out between the moment
 * somebody pressed the key and the moment they spoke.
 *
 * So a *listen* is NOVA's unit, and a recognition session is the engine's. One
 * listen may span several sessions, bounded by a wall-clock window and a
 * restart budget — both finite, which is what stops a restart loop. Single-shot
 * listening remains the default and is what the verification suite drives.
 */

type Emit = (event: VoiceCommandEvent) => void;

/** How a listen should behave when the engine ends a session on its own. */
export interface ListenPolicy {
  /**
   * How long NOVA keeps listening across engine restarts. Zero means one
   * session and no restarts, which is the historical behaviour.
   */
  sustainMs?: number;
  /** A hard ceiling on restarts, independent of the clock. */
  maxRestarts?: number;
}

/**
 * What pressing the microphone does.
 *
 * Twelve seconds is long enough to press the key, look up and say a sentence,
 * and short enough that a microphone left open is noticed. Six restarts cannot
 * be reached by ordinary speech — it is the ceiling that makes a restart loop
 * impossible rather than merely unlikely.
 */
export const SUSTAINED_LISTEN: ListenPolicy = { sustainMs: 12_000, maxRestarts: 6 };

/** How long the interface holds a completed result before resting. */
const SUCCESS_LINGER_MS = 2_600;

/**
 * Errors that mean "carry on listening", not "stop".
 *
 * `no-speech` is the engine saying it heard silence, which during a twelve
 * second listen is simply a person who has not started talking yet. `aborted`
 * arrives when the engine tears its own session down. Neither is a failure of
 * the microphone, and reporting either as one is what made voice feel broken.
 */
const SOFT_ERRORS = new Set<VoiceErrorCode>(['no-speech', 'aborted']);

/** What a whole listen of silence is called, as opposed to one quiet session. */
const SILENCE: VoiceError = {
  code: 'no-speech',
  message: 'NOVA did not hear anything. Check the microphone is not muted.',
};

let factory: () => SpeechRecognizer = createSpeechRecognizer;
let recognizer: SpeechRecognizer | null = null;
let emit: Emit | null = null;

/** True between a cancel and the engine actually stopping. */
let cancelled = false;
/** Set when a final result arrives, so `onEnd` knows the session bore fruit. */
let delivered = false;
/**
 * Identifies the current listen. Handlers capture it and ignore anything that
 * arrives after NOVA has moved on — speech engines are free to deliver events
 * late, and a stale one must never touch a newer listen's state.
 */
let sessionId = 0;

/** The live listen's bounds. Reset on every `startListening`. */
let policy: ListenPolicy = {};
let listenUntil = 0;
let restarts = 0;
/** True once any speech has been recognised in this listen, interim or final. */
let heardAnything = false;
/**
 * True once the listen has reached an outcome it will not come back from.
 *
 * Without it a hard error was reported and then immediately undone: `fail`
 * moved the interface to `error`, the engine's `onend` followed a moment later,
 * saw a listen with time still on the clock, and started another session —
 * putting "Listening" back on screen over a microphone the browser had just
 * refused. An ended listen is ended.
 */
let ended = false;
/**
 * True when the person ended the listen themselves.
 *
 * A listen that runs out of patience should say it heard nothing; a listen
 * somebody stopped should say nothing at all, because they already know. Both
 * arrive at `onEnd` having heard no speech, and only this tells them apart.
 */
let stoppedByUser = false;
/** Cleared whenever the lifecycle moves, so a stale timer cannot rest a live session. */
let lingerTimer: ReturnType<typeof setTimeout> | null = null;

/** Replace the speech engine. Used by tests; a future engine would use it too. */
export function setRecognizerFactory(next: () => SpeechRecognizer) {
  factory = next;
  recognizer = null;
  refreshSupport();
}

function engine(): SpeechRecognizer {
  if (!recognizer) recognizer = factory();
  return recognizer;
}

/**
 * Work out whether this browser can listen at all.
 *
 * Read-only: it inspects what the browser exposes and never touches the
 * microphone, so nothing here can trigger a permission prompt.
 */
export function refreshSupport(): boolean {
  // Building the recogniser touches nothing: it only looks for the constructor.
  const supported = engine().supported;
  useVoiceStore.getState().setSupported(supported);
  return supported;
}

/**
 * Ask the browser what it already knows about microphone permission.
 *
 * `permissions.query` reports existing state without prompting. Where it is
 * unavailable the answer stays `unknown`, which is honest — NOVA finds out when
 * the user first asks it to listen, and not a moment earlier.
 */
export async function probePermission(): Promise<void> {
  const nav = globalThis.navigator as
    | (Navigator & { permissions?: { query(d: { name: string }): Promise<{ state: string }> } })
    | undefined;
  if (!nav?.permissions?.query) return;
  try {
    const status = await nav.permissions.query({ name: 'microphone' });
    const state = status.state;
    if (state === 'granted' || state === 'denied' || state === 'prompt') {
      useVoiceStore.getState().setPermission(state);
    }
  } catch {
    // Not every browser knows the "microphone" permission name. Staying at
    // `unknown` is correct; it is not an error worth showing anyone.
  }
}

function clearLinger() {
  if (lingerTimer === null) return;
  clearTimeout(lingerTimer);
  lingerTimer = null;
}

function fail(error: VoiceError) {
  const store = useVoiceStore.getState();
  ended = true;
  clearLinger();
  store.setError(error);
  store.setInterim('');
  store.setState('error');
}

/** Whether this listen is still entitled to another engine session. */
function mayRestart(): boolean {
  if (cancelled || delivered || ended) return false;
  const sustain = policy.sustainMs ?? 0;
  if (sustain <= 0) return false;
  if (restarts >= (policy.maxRestarts ?? 0)) return false;
  return Date.now() < listenUntil;
}

/**
 * Begin listening.
 *
 * Refuses while a session is already running or its result is still being acted
 * on, so a second press cannot start a rival recognition or execute two
 * instructions at once.
 *
 * Returns synchronously and starts the engine synchronously wherever the
 * microphone cannot be pre-flighted — which is what keeps the whole layer
 * drivable from a test with no browser at all.
 */
export function startListening(options: ListenPolicy = {}): boolean {
  const store = useVoiceStore.getState();

  if (!store.supported) {
    fail({ code: 'unsupported', message: 'This browser does not support speech recognition.' });
    return false;
  }
  if (store.state === 'starting' || store.state === 'listening' || store.state === 'processing') {
    return false;
  }

  const id = (sessionId += 1);
  cancelled = false;
  delivered = false;
  heardAnything = false;
  ended = false;
  stoppedByUser = false;
  restarts = 0;
  policy = options;
  listenUntil = Date.now() + (options.sustainMs ?? 0);
  clearLinger();
  store.setError(null);
  store.setInterim('');
  store.setTranscript('');
  // Not "listening": the engine has not confirmed it is running, and claiming
  // otherwise while a permission prompt is open is exactly the lie the
  // interface must not tell.
  store.setState('starting');

  /**
   * Open the microphone before the engine does.
   *
   * This is the fix for the most common real failure: the engine opens the
   * device itself, the browser raises a permission prompt, and the session ends
   * while the prompt is still on screen — leaving NOVA with no result, no error
   * and nothing to say. Asking first turns that into a decision NOVA can wait
   * for and report on.
   */
  if (microphoneAvailable()) {
    void ensureMicrophone().then((error) => {
      if (id !== sessionId || cancelled) return;
      if (error) {
        if (error.code === 'permission-denied') {
          useVoiceStore.getState().setPermission('denied');
        }
        fail(error);
        return;
      }
      useVoiceStore.getState().setPermission('granted');
      arm(id);
    });
  } else {
    arm(id);
  }

  return true;
}

/** Start one engine session on behalf of the listen identified by `id`. */
function arm(id: number) {
  if (id !== sessionId || cancelled) return;

  engine().start({
    onStart: () => {
      if (id !== sessionId || cancelled) return;
      const store = useVoiceStore.getState();
      // Reaching the engine means the microphone was granted.
      store.setPermission('granted');
      // Only now is "Listening" true.
      store.setState('listening');
    },

    onInterim: (text) => {
      // Feedback only. This text is never executed and never kept.
      if (id !== sessionId || cancelled) return;
      heardAnything = true;
      useVoiceStore.getState().setInterim(text);
    },

    onFinal: (text, confidence) => {
      if (id !== sessionId || cancelled || delivered) return;
      delivered = true;
      heardAnything = true;
      clearLinger();
      const store = useVoiceStore.getState();
      store.setTranscript(text);
      store.setInterim('');
      store.setState('processing');
      store.setLastCommand(text);
      emit?.({ transcript: text, confidence, at: Date.now() });
    },

    onError: (error) => {
      if (id !== sessionId || cancelled) return;
      if (error.code === 'permission-denied') {
        useVoiceStore.getState().setPermission('denied');
      }
      // A soft error inside a sustained listen is not an outcome — the engine
      // simply ended a session early. `onEnd` follows and decides whether to
      // begin another, so nothing is reported here.
      if (SOFT_ERRORS.has(error.code) && mayRestart()) return;
      // A sustained listen that ran out of patience says something more useful
      // than the engine's own wording, which describes one session rather than
      // the twelve seconds the person actually waited through.
      if (error.code === 'no-speech' && (policy.sustainMs ?? 0) > 0 && !heardAnything) {
        fail(SILENCE);
        return;
      }
      fail(error);
    },

    onEnd: () => {
      if (id !== sessionId) return;
      if (cancelled) {
        useVoiceStore.getState().reset();
        cancelled = false;
        return;
      }

      // The engine ended a session of its own accord and the listen has time
      // left. Continue it rather than reporting a result nobody asked about.
      if (mayRestart()) {
        restarts += 1;
        arm(id);
        return;
      }

      const state = voice().state;
      if (delivered || (state !== 'listening' && state !== 'starting')) return;

      const store = useVoiceStore.getState();
      store.setInterim('');

      /**
       * A sustained listen that heard nothing at all is worth saying out loud.
       *
       * Single-shot listening stays silent and idles, because the user stopped
       * it themselves and already knows. A twelve second window that produced
       * no speech is the case where somebody is waiting for NOVA to respond and
       * deserves to be told the microphone heard nothing.
       */
      if ((policy.sustainMs ?? 0) > 0 && !heardAnything && !stoppedByUser) {
        fail(SILENCE);
        return;
      }

      store.setState('idle');
    },
  });
}

/** Finish: deliver whatever was heard. */
export function stopListening() {
  const state = voice().state;
  if (state !== 'listening' && state !== 'starting') return;
  // Ending on purpose ends the whole listen, not just this engine session.
  listenUntil = 0;
  ended = true;
  stoppedByUser = true;
  engine().stop();
  // A stop before the engine ever started has no session to end itself.
  if (state === 'starting') {
    sessionId += 1;
    useVoiceStore.getState().reset();
  }
}

/** Cancel: discard whatever was heard and return to rest. */
export function cancelListening() {
  const state = voice().state;
  if (state !== 'starting' && state !== 'listening' && state !== 'processing') return;
  cancelled = true;
  delivered = false;
  ended = true;
  listenUntil = 0;
  clearLinger();
  engine().abort();
  const store = useVoiceStore.getState();
  store.setInterim('');
  store.setTranscript('');
  store.reset();
}

/**
 * Called by the pipeline once an utterance has been acted on.
 *
 * The result rests by itself. Leaving `success` on screen until the next
 * utterance made the indicator report the last thing that happened rather than
 * the current state of the device, which is the same class of dishonesty as a
 * false "Listening".
 */
export function finishProcessing(outcome: 'success' | 'error', error?: VoiceError) {
  const store = useVoiceStore.getState();
  if (outcome === 'error' && error) store.setError(error);
  store.setState(outcome);

  clearLinger();
  const id = sessionId;
  lingerTimer = setTimeout(() => {
    lingerTimer = null;
    if (id !== sessionId) return;
    const current = voice().state;
    if (current === 'success' || current === 'error') useVoiceStore.getState().reset();
  }, SUCCESS_LINGER_MS);
  // Never hold the process open for a cosmetic reset.
  (lingerTimer as unknown as { unref?: () => void }).unref?.();
}

/**
 * The source itself.
 *
 * Deliberately *not* registered with `inputRouter`: that router arbitrates
 * between devices competing to point at the same thing by confidence, which is
 * a question speech never asks. Voice has its own consumer, and the shared
 * abstraction is the `InputSource` contract rather than the routing.
 */
export const voiceInputSource: InputSource<VoiceCommandEvent> = {
  id: 'voice',

  connect(consumer) {
    emit = consumer;
    refreshSupport();
  },

  disconnect() {
    cancelListening();
    clearLinger();
    emit = null;
    recognizer = null;
    // The browser's recording indicator goes out with the connection.
    releaseMicrophone();
  },
};
