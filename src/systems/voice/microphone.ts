import type { VoiceError } from '../../types/voice';

/**
 * The microphone itself, as distinct from speech recognition.
 *
 * The Web Speech API opens the microphone on NOVA's behalf and tells it almost
 * nothing about what happened. That indirection is the single largest source of
 * "voice does not work": the engine is asked to listen, a permission prompt
 * appears, the engine ends its session before anyone has answered it, and NOVA
 * is left showing nothing at all. Asking for the device *first* turns that into
 * an ordinary, diagnosable outcome — granted, denied, or no device.
 *
 * It also makes the listening indicator honest. The level published here is
 * measured from the actual input signal, so a silent orb means a silent
 * microphone rather than a stylistic choice. Nothing is recorded: the analyser
 * reads the live time-domain buffer and the buffer is overwritten by the next
 * read. No sample is kept, copied or sent anywhere.
 */

interface MediaLike {
  getUserMedia(constraints: { audio: boolean }): Promise<MediaStreamLike>;
}

interface MediaStreamLike {
  getTracks(): Array<{ stop(): void; readonly label?: string }>;
}

/** Held open across sessions so a second `start` does not re-prompt. */
let stream: MediaStreamLike | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buffer: Uint8Array<ArrayBuffer> | null = null;
let pending: Promise<VoiceError | null> | null = null;

function media(): MediaLike | null {
  const nav = globalThis.navigator as (Navigator & { mediaDevices?: MediaLike }) | undefined;
  return nav?.mediaDevices?.getUserMedia ? (nav.mediaDevices as MediaLike) : null;
}

/** True where a real microphone can be asked for at all — false under Node. */
export function microphoneAvailable(): boolean {
  return media() !== null;
}

/**
 * The browser's own words for why the microphone could not be opened, in NOVA's.
 *
 * Deliberately specific. "Microphone unavailable" is true of all of these and
 * useful for none of them; a person who has muted their input needs to be told
 * that, not told to check their browser settings.
 */
function describe(error: unknown): VoiceError {
  const name = (error as { name?: string } | null)?.name ?? 'UnknownError';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        code: 'permission-denied',
        message: 'Microphone permission was refused. Allow it for this site and try again.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { code: 'no-microphone', message: 'No microphone was found on this computer.' };
    case 'NotReadableError':
      return {
        code: 'no-microphone',
        message: 'The microphone is in use by another application.',
      };
    default:
      return { code: 'unknown', message: 'The microphone could not be opened.' };
  }
}

/**
 * Open the microphone, or say why not.
 *
 * Resolves to `null` on success. Concurrent callers share one request, so
 * pressing the key twice cannot raise two permission prompts.
 */
export function ensureMicrophone(): Promise<VoiceError | null> {
  if (stream) return Promise.resolve(null);
  if (pending) return pending;

  const devices = media();
  if (!devices) {
    // No `mediaDevices` at all: either a very old browser or an insecure
    // context. Speech recognition will fail for the same reason, and its own
    // error is the more accurate one, so this is not treated as fatal here.
    return Promise.resolve(null);
  }

  pending = devices
    .getUserMedia({ audio: true })
    .then((granted) => {
      stream = granted;
      attachAnalyser(granted);
      return null;
    })
    .catch((error: unknown) => describe(error))
    .finally(() => {
      pending = null;
    });

  return pending;
}

/**
 * Wire an analyser onto the live stream.
 *
 * Failure here is silent on purpose: the level meter is a nicety, and a browser
 * that will not give NOVA an `AudioContext` should still be able to listen.
 */
function attachAnalyser(granted: MediaStreamLike) {
  if (analyser) return;
  try {
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    const node = context.createAnalyser();
    // Small window: this measures loudness, not spectrum, and a short buffer
    // follows speech onsets closely enough to look alive.
    node.fftSize = 256;
    node.smoothingTimeConstant = 0.7;
    context.createMediaStreamSource(granted as unknown as MediaStream).connect(node);
    analyser = node;
    buffer = new Uint8Array(new ArrayBuffer(node.fftSize));
  } catch {
    analyser = null;
    buffer = null;
  }
}

/**
 * How loud the microphone is right now, from 0 to roughly 1.
 *
 * Computed on demand rather than in a loop of its own, so it costs nothing
 * except when something is actually drawing it. Returns 0 when no analyser
 * exists — which the interface renders as "no signal", never as a fake one.
 */
export function microphoneLevel(): number {
  if (!analyser || !buffer) return 0;
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centred = (buffer[i] - 128) / 128;
    sum += centred * centred;
  }
  const rms = Math.sqrt(sum / buffer.length);
  // Speech at a normal distance sits around 0.02–0.2 RMS. Scaled so ordinary
  // talking fills most of the indicator without clipping on a loud syllable.
  return Math.min(1, rms * 6.5);
}

/** True once the analyser is running, so the interface can tell real from absent. */
export function microphoneMetered(): boolean {
  return analyser !== null;
}

/**
 * Close the microphone.
 *
 * Called when voice is disconnected. NOVA holds the device only while it is a
 * usable input, and the browser's recording indicator should go out with it.
 */
export function releaseMicrophone() {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      /* the track is already gone */
    }
  }
  stream = null;
  analyser = null;
  buffer = null;
  const closing = context;
  context = null;
  try {
    void closing?.close();
  } catch {
    /* an already-closed context is not a problem */
  }
}
