import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Mic, RotateCcw, X } from 'lucide-react';
import { dispatch } from '../../systems/command/commandBus';
import { useVoiceStore } from '../../systems/voice/voiceStore';
import { interaction } from '../../systems/interaction/interactionSystem';
import { useSpatialStore } from '../../state/spatialStore';
import { prefersReducedMotion } from '../../systems/environment/ambience';
import {
  converse,
  setIntelligenceOpen,
  useIntelligenceStore,
  type IntelligenceMessage,
} from '../../systems/intelligence/intelligenceSession';

/**
 * The NOVA Intelligence Surface (Phase 10).
 *
 * A conversation with NOVA, drawn as one more piece of NOVA's glass rather than
 * as a chat page: the same translucent white, hairline and layered shadow as the
 * status HUD and the command line, the accent reserved for NOVA itself.
 *
 * It decides nothing. Every sentence goes to `converse`; every action NOVA takes
 * as a result goes through `routeUtterance` and the command bus like a typed
 * one. Voice is the existing microphone — the button dispatches the same
 * `voice-input` command the S key does, and while this surface is open a spoken
 * sentence is answered here rather than in the command line.
 *
 * Since the final Phase 11 refinement it is drawn in the room's own language —
 * dark spatial glass, hairline edges, violet only as NOVA's intelligence — and
 * the conversation is a field of lines rather than chat bubbles. Its states
 * (ready, listening, thinking, responding, acting) are presentation only,
 * derived from the session it already reads.
 *
 * A screen-space panel rather than a sixth spatial window, deliberately: a
 * spatial window is an `AppType`, and widening that would reach into every
 * workspace layout, memory and the application catalog's category rule — far
 * outside a conversation's business.
 */

const SUGGESTIONS = ['What can you do?', 'Explain spatial computing simply', 'Open terminal'];

/** Plain text, with paragraphs and "- " lists. Rendered as text, never as HTML. */
function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul className="intel__list" key={index}>
              {lines.map((line, i) => (
                <li key={i}>{line.replace(/^\s*[-•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p className="intel__para" key={index}>
            {block}
          </p>
        );
      })}
    </>
  );
}

const OUTCOME_LABEL = { done: 'done', question: 'needs an answer', unresolved: 'not available' } as const;

function Message({ message }: { message: IntelligenceMessage }) {
  return (
    <motion.div
      className="intel__msg"
      data-role={message.role}
      data-mode={message.mode}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 0.9, 0.24, 1] }}
    >
      <div className="intel__text">
        <Prose text={message.text} />
      </div>
      {message.action && (
        <div className="intel__action" data-outcome={message.action.outcome}>
          <span className="intel__action-command">{message.action.command}</span>
          <span className="intel__action-outcome">{OUTCOME_LABEL[message.action.outcome]}</span>
        </div>
      )}
      {message.candidates && message.candidates.length > 0 && (
        <div className="intel__chips">
          {message.candidates.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="intel__chip"
              onClick={() => void converse(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function IntelligenceSurface() {
  const open = useIntelligenceStore((state) => state.open);
  const status = useIntelligenceStore((state) => state.status);
  const messages = useIntelligenceStore((state) => state.messages);
  const lastFailure = useIntelligenceStore((state) => state.lastFailure);
  const reset = useIntelligenceStore((state) => state.reset);
  const voiceState = useVoiceStore((state) => state.state);
  // While the portal is open the surface steps back, so the applications are clear.
  const portalOpen = useSpatialStore((state) => state.portal.open);
  const interim = useVoiceStore((state) => state.interimTranscript);

  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);

  // Depth: the surface drifts a few pixels against the pointer, like the room
  // behind it. One transform per frame through a ref; still under reduced motion.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const element = surfaceRef.current;
      if (!element) return;
      const still = prefersReducedMotion() || !interaction.pointerPresent;
      const tx = still ? 0 : -interaction.pointer.x * 5;
      const ty = still ? 0 : interaction.pointer.y * 3;
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      element.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const listening = voiceState === 'starting' || voiceState === 'listening';
  const thinking = status === 'thinking' || voiceState === 'processing';

  // Focus the field on opening, after the entrance so focus does not fight it.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  // Keep the newest line in view. Runs when a message arrives, not per frame.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setValue('');
    void converse(clean);
  };

  const state = listening ? 'listening' : thinking ? 'thinking' : lastFailure ? 'offline' : 'ready';
  const stateLabel = { listening: 'Listening', thinking: 'Thinking', offline: 'Limited', ready: 'Ready' }[state];

  // The newest NOVA line: when it arrives, the field answers once — a light
  // passing through it (responding), or a trace along it when NOVA acted.
  const newest = messages.at(-1);
  const answer = newest && newest.role !== 'user' ? newest : null;
  const answerKind = answer?.action ? 'acting' : 'responding';

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={surfaceRef}
          className="intel"
          data-state={state}
          data-portal={portalOpen || undefined}
          role="dialog"
          aria-label="NOVA Intelligence"
          initial={{ opacity: 0, y: 14, scale: 0.985, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 10, scale: 0.99, filter: 'blur(6px)' }}
          transition={{ duration: 0.28, ease: [0.22, 0.9, 0.24, 1] }}
        >
          {answer && <span key={answer.id} className="intel__pulse" data-kind={answerKind} aria-hidden />}
          <header className="intel__head">
            <span className="intel__core" aria-hidden>
              <span className="intel__core-ring" />
            </span>
            <span className="intel__mark">NOVA</span>
            <span className="intel__title">Intelligence</span>
            <span className="intel__state" data-state={state}>
              <span className="intel__dot" />
              {stateLabel}
            </span>
            <button
              type="button"
              className="intel__icon"
              onClick={reset}
              title="New conversation"
              aria-label="New conversation"
              disabled={messages.length === 0 || thinking}
            >
              <RotateCcw size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="intel__icon"
              onClick={() => setIntelligenceOpen(false)}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </header>

          <span className="intel__stem" aria-hidden />
          <div className="intel__log" ref={logRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="intel__empty">
                <p className="intel__lead">Ask me anything, or tell me what to do.</p>
                <p className="intel__sub">
                  I keep track of the conversation, and anything I do goes through NOVA's own commands.
                </p>
                <div className="intel__chips">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" className="intel__chip" onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => <Message key={message.id} message={message} />)
            )}
            {thinking && (
              <div className="intel__thinking" aria-label="NOVA is thinking">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <form
            className="intel__field"
            data-listening={listening || undefined}
            onSubmit={(event) => {
              event.preventDefault();
              send(value);
            }}
          >
            <input
              ref={inputRef}
              className="intel__input"
              value={listening ? interim : value}
              readOnly={listening}
              placeholder={listening ? 'Listening…' : 'Message NOVA'}
              spellCheck
              autoComplete="off"
              maxLength={2000}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  if (listening) dispatch({ action: 'voice-input', mode: 'cancel' }, 'keyboard');
                  else setIntelligenceOpen(false);
                }
              }}
            />
            <button
              type="button"
              className="intel__icon intel__mic"
              aria-pressed={listening}
              title={listening ? 'Stop listening' : 'Speak (S)'}
              aria-label={listening ? 'Stop listening' : 'Speak'}
              disabled={voiceState === 'unsupported'}
              onClick={() =>
                dispatch({ action: 'voice-input', mode: listening ? 'stop' : 'start' }, 'pointer')
              }
            >
              <Mic size={14} strokeWidth={1.8} />
            </button>
            <button
              type="submit"
              className="intel__send"
              disabled={!value.trim() || listening}
              aria-label="Send"
              title="Send (Enter)"
            >
              <ArrowUp size={14} strokeWidth={2} />
            </button>
          </form>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
