import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../../systems/command/commandBus';
import { COMMAND_EXAMPLES } from '../../systems/command/commandParser';
import { routeUtterance } from '../../systems/command/intentRouter';
import { useVoiceStore } from '../../systems/voice/voiceStore';
import { useVoiceInput } from '../../systems/voice/voicePipeline';
import { converse, useIntelligenceStore } from '../../systems/intelligence/intelligenceSession';
import type { ReferenceCandidate } from '../../types/context';

/**
 * Speaking to NOVA in words.
 *
 * The path the text takes is the point: it becomes structured intent, intent is
 * resolved against context, and the result reaches state only as `NovaCommand`
 * values through the command bus. Phase 4 changes only the middle of that
 * sentence — this component asks `routeUtterance` instead of the local matcher,
 * and gained one new outcome: NOVA can now answer with a question.
 *
 * Phase 6 adds a second way for words to arrive here and nothing else. A spoken
 * sentence is handed to the same `run` a typed one is, so voice cannot diverge
 * from typing even by accident — there is only one function that acts on words.
 */
export function CommandLine() {
  const open = useSpatialStore((state) => state.commandOpen);
  const voiceState = useVoiceStore((state) => state.state);
  const interim = useVoiceStore((state) => state.interimTranscript);
  const spoken = useVoiceStore((state) => state.transcript);
  const voiceError = useVoiceStore((state) => state.error);
  const conversing = useIntelligenceStore((state) => state.open);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<{
    text: string;
    candidates: ReferenceCandidate[];
    pendingAction?: 'memory-restore' | 'memory-delete';
  } | null>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
      setQuestion(null);
      // Wait for the entrance so focus does not fight the transition.
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const run = async (text: string) => {
    setError(null);
    setQuestion(null);

    const result = await routeUtterance(text);

    // A question is a successful outcome, not a failure: NOVA understood the
    // instruction and could not tell which object it landed on. Nothing has
    // been executed, and the line stays open for the answer.
    if (result.clarification) {
      setQuestion({
        text: result.clarification.question,
        candidates: result.clarification.candidates,
        pendingAction: result.clarification.pendingAction,
      });
      return;
    }
    if (!result.understood) {
      const message = `I couldn't resolve "${text.trim()}"`;
      setError(message);
      // Said aloud as well as shown, so a failed instruction is answered in the
      // same place a successful one is rather than only in the field.
      useSpatialStore.getState().notify(message, 'error');
      return;
    }
    dispatch({ action: 'command', open: false }, 'command-line');
  };

  // Words arriving by voice take exactly the path words arriving by keyboard
  // take. `run` is passed straight through — there is no voice branch inside it.
  useVoiceInput(async (text) => {
    // While the Intelligence surface is open, a spoken sentence is part of that
    // conversation. It is still the one voice connection — only the handler it
    // reaches differs — and anything NOVA does as a result goes through
    // `routeUtterance` all the same.
    if (useIntelligenceStore.getState().open) return converse(text, 'voice');

    const result = await routeUtterance(text, 'voice');
    if (result.clarification) {
      setQuestion({
        text: result.clarification.question,
        candidates: result.clarification.candidates,
        pendingAction: result.clarification.pendingAction,
      });
      /**
       * A question asked of somebody who spoke has to be visible.
       *
       * The command line opens itself only while voice is live, so a
       * clarification arriving after the utterance finished was being rendered
       * into a panel that had already gone — NOVA asking a question nobody
       * could see. Opening the line puts the question and its answers on
       * screen, where they can be clicked or spoken to.
       */
      dispatch({ action: 'command', open: true }, 'voice');
      useSpatialStore.getState().notify(result.clarification.question, 'info');
    } else if (!result.understood) {
      const message = `I couldn't resolve "${text.trim()}"`;
      setError(message);
      useSpatialStore.getState().notify(message, 'error');
    }
    return { understood: result.understood, clarification: result.clarification };
  });

  /**
   * Answering a question.
   *
   * A memory question already knows its verb — "which one should I restore?" —
   * so the answer is dispatched directly. A window question does not change the
   * sentence, only which object it lands on, so the sentence is run again.
   */
  const answer = (candidate: ReferenceCandidate) => {
    const pending = question?.pendingAction;
    setQuestion(null);

    if (pending) {
      dispatch({ action: pending, id: candidate.id }, 'command-line');
      dispatch({ action: 'command', open: false }, 'command-line');
      return;
    }

    dispatch({ action: 'focus', target: candidate.id }, 'command-line');
    void run(value);
  };

  const starting = voiceState === 'starting';
  const listening = voiceState === 'listening';
  const processing = voiceState === 'processing';
  const voiceActive = starting || listening || processing;

  /** What the field shows. Spoken words land in the same line typed ones do. */
  const fieldText = listening ? interim : processing ? spoken : starting ? '' : value;
  const placeholder = starting
    ? 'Opening the microphone…'
    : listening
      ? 'Listening…'
      : processing
        ? 'Processing…'
        : 'Tell NOVA what you need';

  return (
    <AnimatePresence>
      {(open || (voiceActive && !conversing)) && (
        // The anchor does the centring; the motion element only animates, because
        // an animated transform would otherwise replace the centring translate.
        <div className="command-anchor">
        <motion.div
          className="command"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          transition={{ duration: 0.24, ease: [0.22, 0.9, 0.24, 1] }}
        >
          <form
            className="command__field"
            onSubmit={(event) => {
              event.preventDefault();
              void run(value);
            }}
          >
            <span className="command__sigil" data-voice={voiceActive ? voiceState : undefined} />
            <input
              ref={inputRef}
              className="command__input"
              value={fieldText}
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
              readOnly={voiceActive}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
                setQuestion(null);
              }}
            />
          </form>

          {question ? (
            <>
              <p className="command__error">{question.text}</p>
              {question.candidates.length > 0 && (
                <div className="command__examples">
                  {question.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="command__example"
                      onClick={() => answer(candidate)}
                    >
                      {candidate.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : error ? (
            <p className="command__error">{error}</p>
          ) : voiceError && voiceState === 'error' ? (
            <p className="command__error">{voiceError.message}</p>
          ) : voiceActive ? null : (
            <div className="command__examples">
              {COMMAND_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="command__example"
                  onClick={() => void run(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
