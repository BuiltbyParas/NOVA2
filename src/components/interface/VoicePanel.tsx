import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { dispatch } from '../../systems/command/commandBus';
import { useVoiceStore } from '../../systems/voice/voiceStore';
import { microphoneLevel, microphoneMetered } from '../../systems/voice/microphone';
import type { VoiceState } from '../../types/voice';

/**
 * The microphone, as a control rather than a chip.
 *
 * Voice is the input NOVA is most often accused of not having, because a
 * device that is listening and a device that is off look identical when both
 * are a five pixel dot. This is deliberately the one piece of system interface
 * with real weight: a button you can find without being told where it is, and a
 * label that says which of six things is actually true.
 *
 * The ring is driven by the measured input level, not by a timer. An orb that
 * pulses on its own would say "listening" in a room where the microphone is
 * muted, which is the specific lie this panel exists to stop telling. Where no
 * analyser could be attached the ring simply stays still, and the label carries
 * the state by itself.
 */

/** What the person is told, per lifecycle state. Short, and never optimistic. */
const LABELS: Record<VoiceState, string> = {
  unsupported: 'Voice unavailable',
  idle: 'Mic off',
  starting: 'Starting…',
  listening: 'Listening',
  processing: 'Processing',
  success: 'Understood',
  error: 'Mic error',
};

/**
 * Why speech recognition could not reach a service, where NOVA can tell.
 *
 * Brave is the case worth naming. It ships the Web Speech API but not the keys
 * that reach Google's recognition service, so `SpeechRecognition` exists,
 * starts, opens the microphone and then fails with `network` every single time.
 * "Could not reach the network" sends somebody to check their wi-fi for a
 * problem no amount of connectivity will fix.
 */
function networkReason(fallback: string): string {
  const nav = globalThis.navigator as (Navigator & { brave?: unknown }) | undefined;
  const ua = nav?.userAgent ?? '';
  if (nav?.brave || /Brave\//.test(ua)) {
    return 'Brave ships no speech service. Open NOVA in Chrome or Edge to use voice.';
  }
  return fallback;
}

/**
 * Why this browser cannot listen, in terms of the browser the person is using.
 *
 * "This browser does not support speech recognition" is true and unhelpful.
 * Firefox is the case that matters on this host: it ships no speech engine at
 * all, so no amount of permission granting will help, and saying which browsers
 * do work is the only useful thing NOVA can offer. Brave is deliberately not
 * among them — it has the API and no service behind it, which fails later and
 * more confusingly than not having the API at all.
 */
function unsupportedReason(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Firefox\//.test(ua)) {
    return 'Firefox ships no speech engine. Open NOVA in Chrome or Edge to use voice.';
  }
  if (!globalThis.isSecureContext) {
    return 'Speech recognition needs a secure context — use localhost or https.';
  }
  return 'This browser has no speech recognition engine. Chrome and Edge do.';
}

export function VoicePanel() {
  const state = useVoiceStore((store) => store.state);
  const supported = useVoiceStore((store) => store.supported);
  const interim = useVoiceStore((store) => store.interimTranscript);
  const transcript = useVoiceStore((store) => store.transcript);
  const error = useVoiceStore((store) => store.error);

  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Drive the level ring while — and only while — the microphone is open.
   *
   * Written straight to a custom property rather than through state: sixty
   * renders a second of a React tree that sits over a WebGL canvas is exactly
   * the cost NOVA cannot afford, and nothing here needs reconciliation.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const live = state === 'listening' || state === 'starting';
    if (!live) {
      root.style.setProperty('--level', '0');
      return;
    }

    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const level = microphoneLevel();
      // Rises quickly with speech and falls slowly, so a syllable reads as one
      // gesture rather than a flicker.
      smoothed = level > smoothed ? level : smoothed + (level - smoothed) * 0.12;
      root.style.setProperty('--level', smoothed.toFixed(3));
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      root.style.setProperty('--level', '0');
    };
  }, [state]);

  const listening = state === 'listening' || state === 'starting';
  const heard = state === 'listening' ? interim : transcript;

  const detail =
    state === 'unsupported'
      ? unsupportedReason()
      : state === 'error'
        ? error?.code === 'network'
          ? networkReason(error.message)
          : (error?.message ?? 'The microphone could not be used.')
        : heard
          ? `“${heard}”`
          : state === 'listening'
            ? microphoneMetered()
              ? 'Say a command — “open terminal”'
              : 'Say a command'
            : state === 'starting'
              ? 'Opening the microphone…'
              : 'Press S or click to speak';

  return (
    <div className="voice" ref={rootRef} data-status={state}>
      <button
        type="button"
        className="voice__key"
        disabled={!supported}
        aria-label={LABELS[state]}
        title={supported ? 'Speak to NOVA (S · Escape cancels)' : unsupportedReason()}
        onClick={() =>
          dispatch(
            { action: 'voice-input', mode: listening ? 'stop' : 'start' },
            'pointer',
          )
        }
      >
        {/* Two rings: one steady, one scaled by the live input level. */}
        <span className="voice__halo" />
        <span className="voice__level" />
        {supported ? <Mic size={15} strokeWidth={1.9} /> : <MicOff size={15} strokeWidth={1.9} />}
      </button>

      <div className="voice__readout">
        <span className="voice__state">{LABELS[state]}</span>
        <span className="voice__detail">{detail}</span>
      </div>
    </div>
  );
}
