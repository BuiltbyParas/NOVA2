import { useEffect, useRef } from 'react';
import type { VoiceCommandEvent } from '../../types/voice';
import { finishProcessing, probePermission, voiceInputSource } from './voiceInputSource';

/**
 * Where a spoken sentence goes.
 *
 * Nowhere new. The handler this connects is the same function the command line
 * runs when you type, so a sentence takes one path whether it was spoken or
 * typed — through the intent router, Gemini, the context engine and the command
 * bus, in that order. Phase 6 adds no execution of its own, and this file is the
 * proof: it moves a string and reports how it went.
 */

/** What acting on an utterance produced. Deliberately the shape `routeUtterance` returns. */
export interface UtteranceOutcome {
  understood: boolean;
  clarification: unknown | null;
}

export type UtteranceHandler = (text: string) => Promise<UtteranceOutcome>;

/**
 * Connect voice to the command pipeline. Returns a disconnect function.
 *
 * Plain, so a test can drive the whole path without React, and so the wiring is
 * readable in one place rather than distributed through a component.
 */
export function connectVoice(handle: UtteranceHandler): () => void {
  voiceInputSource.connect((event: VoiceCommandEvent) => {
    void (async () => {
      try {
        const outcome = await handle(event.transcript);

        // A question counts as understood: NOVA heard the sentence and needs one
        // more word, which is a conversation, not a recognition failure.
        if (outcome.clarification) {
          finishProcessing('success');
          return;
        }

        if (outcome.understood) {
          finishProcessing('success');
          return;
        }

        finishProcessing('error', {
          code: 'unknown',
          message: `NOVA could not resolve "${event.transcript}"`,
        });
      } catch {
        // Anything the pipeline throws stops here. A failed sentence must never
        // reach the spatial environment as a broken state.
        finishProcessing('error', {
          code: 'unknown',
          message: 'NOVA could not act on that.',
        });
      }
    })();
  });

  return () => voiceInputSource.disconnect();
}

/**
 * Attach voice to the running application.
 *
 * Mounted once, by the command line, because the command line is what already
 * knows how to turn a sentence into an outcome and how to ask a follow-up
 * question about it.
 */
export function useVoiceInput(handle: UtteranceHandler) {
  // The handler is a fresh closure every render, but re-connecting every render
  // would tear down a live recognition session. The connection is made once and
  // reads the current handler through this ref.
  const current = useRef(handle);
  // Updated in an effect rather than during render, so nothing reads or writes
  // a ref while React is rendering.
  useEffect(() => {
    current.current = handle;
  });

  useEffect(() => {
    const disconnect = connectVoice((text) => current.current(text));
    // Read-only: reports permission the browser has already decided, and never
    // touches the microphone, so nothing here can raise a prompt on startup.
    void probePermission();
    return disconnect;
  }, []);
}
