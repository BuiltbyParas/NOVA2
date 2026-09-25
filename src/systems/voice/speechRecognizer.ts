import type {
  RecognizerHandlers,
  SpeechRecognizer,
  VoiceError,
  VoiceErrorCode,
} from '../../types/voice';

/**
 * The Web Speech API, wrapped.
 *
 * This is the only file in NOVA that touches `SpeechRecognition`. It exists to
 * turn a browser API with six callbacks, vendor prefixes and a habit of ending
 * sessions on its own into three methods and a set of outcomes NOVA can reason
 * about.
 *
 * The API surface is declared locally rather than relied on from `lib.dom`,
 * because `webkitSpeechRecognition` is not in every TypeScript DOM library and
 * NOVA should not fail to compile over a vendor prefix.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function findConstructor(): SpeechRecognitionConstructor | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * The engine's error strings, in NOVA's terms.
 *
 * Every one of these is survivable. A microphone that is missing, refused or
 * silent leaves the spatial environment exactly as it was — voice is a device,
 * and a device that is unavailable is not a failure of the system.
 */
const ERRORS: Record<string, VoiceError> = {
  'not-allowed': {
    code: 'permission-denied',
    message: 'NOVA needs microphone permission to listen.',
  },
  'service-not-allowed': {
    code: 'permission-denied',
    message: 'Speech recognition was blocked by the browser.',
  },
  'audio-capture': {
    code: 'no-microphone',
    message: 'No microphone was found.',
  },
  'no-speech': {
    code: 'no-speech',
    message: 'NOVA did not hear anything.',
  },
  network: {
    code: 'network',
    message: 'Speech recognition could not reach the network.',
  },
  aborted: {
    code: 'aborted',
    message: 'Listening stopped.',
  },
};

export function describeError(raw: string): VoiceError {
  return (
    ERRORS[raw] ?? {
      code: 'unknown' as VoiceErrorCode,
      message: `Speech recognition failed (${raw}).`,
    }
  );
}

class WebSpeechRecognizer implements SpeechRecognizer {
  readonly supported = true;
  private session: SpeechRecognitionLike | null = null;
  /** Set while cancelling, so the engine's own abort error is not reported. */
  private cancelling = false;

  private readonly Constructor: SpeechRecognitionConstructor;

  constructor(Constructor: SpeechRecognitionConstructor) {
    this.Constructor = Constructor;
  }

  start(handlers: RecognizerHandlers) {
    // A session is single-use: the engine ends it after one utterance, so a new
    // one is built each time rather than reusing a finished object.
    this.stopSession();
    this.cancelling = false;

    let session: SpeechRecognitionLike;
    try {
      session = new this.Constructor();
    } catch {
      handlers.onError(describeError('unknown'));
      handlers.onEnd();
      return;
    }

    session.lang = 'en-US';
    // One instruction at a time. Continuous recognition would be an always-on
    // listener, which Phase 6 explicitly must not be.
    session.continuous = false;
    session.interimResults = true;
    session.maxAlternatives = 1;

    session.onstart = () => handlers.onStart();

    session.onresult = (event) => {
      // Results accumulate across events; only the ones marked final may act.
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result || result.length === 0) continue;
        const best = result[0];
        if (result.isFinal) {
          const transcript = best.transcript.trim();
          if (transcript) handlers.onFinal(transcript, best.confidence ?? 1);
        } else {
          interim += best.transcript;
        }
      }
      const trimmed = interim.trim();
      if (trimmed) handlers.onInterim(trimmed);
    };

    session.onerror = (event) => {
      if (this.cancelling && event.error === 'aborted') return;
      handlers.onError(describeError(event.error));
    };

    session.onend = () => {
      this.session = null;
      handlers.onEnd();
    };

    this.session = session;

    try {
      session.start();
    } catch {
      // Starting twice throws in some engines. Treat it as the session that is
      // already running rather than as a failure.
      this.session = null;
      handlers.onError(describeError('unknown'));
      handlers.onEnd();
    }
  }

  stop() {
    try {
      this.session?.stop();
    } catch {
      this.session = null;
    }
  }

  abort() {
    this.cancelling = true;
    try {
      this.session?.abort();
    } catch {
      this.session = null;
    }
  }

  /**
   * Discard a session that is still open.
   *
   * Its handlers are detached *before* it is aborted. A session NOVA has moved
   * on from must not be able to report anything — otherwise its `onend` arrives
   * after the next session has started and is read as that session ending.
   */
  private stopSession() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    session.onstart = null;
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    try {
      session.abort();
    } catch {
      /* the session is already gone */
    }
  }
}

/** Stands in where the browser has no speech engine. Every call is inert. */
class UnsupportedRecognizer implements SpeechRecognizer {
  readonly supported = false;

  start(handlers: RecognizerHandlers) {
    handlers.onError({
      code: 'unsupported',
      message: 'This browser does not support speech recognition.',
    });
    handlers.onEnd();
  }

  stop() {}
  abort() {}
}

export function createSpeechRecognizer(): SpeechRecognizer {
  const Constructor = findConstructor();
  return Constructor ? new WebSpeechRecognizer(Constructor) : new UnsupportedRecognizer();
}

export function isSpeechRecognitionSupported(): boolean {
  return findConstructor() !== null;
}
