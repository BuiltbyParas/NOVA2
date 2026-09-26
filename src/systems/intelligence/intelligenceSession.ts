import { create } from 'zustand';
import type { CommandSource } from '../../types/command';
import { getCurrentContext } from '../context/contextEngine';
import { interpret } from '../command/commandParser';
import { routeUtterance, type RouteResult } from '../command/intentRouter';
import { projectIntelligenceContext } from './intelligenceContext';
import {
  FAILURE_MESSAGES,
  isFailure,
  LIMITS,
  parseModelReply,
  trimHistory,
  type HistoryEntry,
  type IntelligenceErrorCode,
  type IntelligenceMode,
  type IntelligenceRequest,
  type IntelligenceResponse,
} from './protocol';

/**
 * The NOVA Intelligence session (Phase 10).
 *
 * A conversation, held in the browser, and one function — `converse` — that
 * takes a sentence from the surface or from the microphone and answers it.
 *
 * ── Where it sits ────────────────────────────────────────────────────────────
 *
 *     typed / spoken sentence
 *       → converse                      ← this file: the conversation
 *           → the model (via /api/intelligence/turn)
 *               conversation → a reply, shown; nothing runs
 *               action       → one NOVA instruction sentence
 *                                → routeUtterance   ← the existing pipeline
 *                                    → contextBridge → command bus → state
 *
 * An action from the model is a *sentence*, not a command object, and it goes
 * through the same `routeUtterance` the command line and voice use — so the
 * catalog, the category-versus-product rule, reference resolution, clarifying
 * questions and the native safety model all apply to it unchanged. The model
 * can ask for nothing a person could not type.
 *
 * Nothing here runs in a frame loop. Every request is started by a person
 * finishing a sentence, and awaited off the render path.
 */

export interface IntelligenceMessage {
  id: number;
  role: 'user' | 'nova';
  text: string;
  at: number;
  /** How NOVA answered. `error` marks a turn that failed. */
  mode?: IntelligenceMode | 'error';
  /** For an action: the instruction sentence, and how the pipeline took it. */
  action?: { command: string; outcome: 'done' | 'question' | 'unresolved' };
  /** Answers offered when NOVA asked a question, clickable in the surface. */
  candidates?: string[];
  /** Answered without the model (a direct command, or a fallback). */
  local?: boolean;
}

export type IntelligenceStatus = 'idle' | 'thinking';

interface IntelligenceState {
  open: boolean;
  status: IntelligenceStatus;
  messages: IntelligenceMessage[];
  /** What NOVA has done in this conversation, newest last — shown to the model as context. */
  recentActions: string[];
  /** The most recent failure, for the surface's header; cleared by a success. */
  lastFailure: IntelligenceErrorCode | null;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

/** The surface keeps this many messages on screen; older ones scroll away and are dropped. */
const MAX_MESSAGES = 60;

let nextId = 1;

export const useIntelligenceStore = create<IntelligenceState>((set) => ({
  open: false,
  status: 'idle',
  messages: [],
  recentActions: [],
  lastFailure: null,
  setOpen: (open) => set({ open }),
  reset: () => set({ messages: [], recentActions: [], lastFailure: null, status: 'idle' }),
}));

const state = () => useIntelligenceStore.getState();

function append(message: Omit<IntelligenceMessage, 'id' | 'at'>): IntelligenceMessage {
  const full: IntelligenceMessage = { ...message, id: nextId++, at: Date.now() };
  useIntelligenceStore.setState((current) => ({
    messages: [...current.messages, full].slice(-MAX_MESSAGES),
  }));
  return full;
}

function noteAction(description: string) {
  useIntelligenceStore.setState((current) => ({
    recentActions: [...current.recentActions, description].slice(-5),
  }));
}

// --- transport ---------------------------------------------------------------

/**
 * How long a conversational turn may take before NOVA stops waiting.
 *
 * Longer than the four seconds a spatial command gets, because an answer is
 * written rather than looked up — and still bounded, so a slow or unreachable
 * model can never leave the surface thinking forever.
 */
export const TURN_TIMEOUT_MS = 20_000;

export type IntelligenceTransport = (request: IntelligenceRequest) => Promise<IntelligenceResponse>;

/** The real transport: one POST to the NOVA server, which holds the key. */
const httpTransport: IntelligenceTransport = async (request) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  try {
    const response = await fetch('/api/intelligence/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      return { error: response.ok ? 'malformed' : 'unavailable' };
    }
    if (body && typeof body === 'object' && 'error' in body) {
      const code = (body as { error: unknown }).error;
      return { error: typeof code === 'string' && code in FAILURE_MESSAGES ? (code as IntelligenceErrorCode) : 'unavailable' };
    }
    if (!response.ok) return { error: response.status === 429 ? 'rate_limited' : 'unavailable' };
    // The server has already validated this; the browser checks again, because
    // it is the browser that acts on it.
    return parseModelReply(body);
  } catch (error) {
    return { error: (error as Error)?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
};

let transport: IntelligenceTransport = httpTransport;

/** Replace the transport. For the verification suite; returns the previous one. */
export function setIntelligenceTransport(next: IntelligenceTransport | null): IntelligenceTransport {
  const previous = transport;
  transport = next ?? httpTransport;
  return previous;
}

// --- the direct path -----------------------------------------------------------

/**
 * Sentences that are plainly instructions to NOVA, answered without the model.
 *
 * "open terminal" should not wait on a network round trip, and must still work
 * when the model is down. But the Phase 1 matcher is deliberately loose — it
 * reads "reset" anywhere as "arrange" — so a question like "how do I reset my
 * router?" must never be handed to it. Only a short sentence that *begins* with
 * a command verb, contains no question and no conversational reference, and
 * that the matcher itself understands, takes this path.
 */
const DIRECT_VERB = /^(please\s+)?(open|focus|close|minimi[sz]e|hide|restore|move|make|bring|send|switch|arrange|tidy)\b/i;
const CONVERSATIONAL_REFERENCE = /\b(it|that|this|them|those|these|previous|earlier|last one)\b/i;

export function isDirectCommand(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.includes('?')) return false;
  if (clean.split(/\s+/).length > 8) return false;
  if (!DIRECT_VERB.test(clean) || CONVERSATIONAL_REFERENCE.test(clean)) return false;
  return interpret(clean).understood;
}

/** Sentences that end the conversation rather than continue it. */
const RESET_PHRASE = /^(please\s+)?(start over|new conversation|clear (the )?(conversation|chat)|forget (this|our) conversation)\.?$/i;

// --- turning a pipeline result into words ---------------------------------------

function describeOutcome(command: string, result: RouteResult): IntelligenceMessage['action'] {
  if (result.clarification) return { command, outcome: 'question' };
  if (result.commands.length > 0) return { command, outcome: 'done' };
  return { command, outcome: 'unresolved' };
}

async function carryOut(
  command: string,
  source: CommandSource,
  reply: string,
  local: boolean,
): Promise<void> {
  const result = await routeUtterance(command, source);
  const action = describeOutcome(command, result);

  if (action?.outcome === 'question' && result.clarification) {
    append({
      role: 'nova',
      text: result.clarification.question,
      mode: 'clarification',
      action,
      candidates: result.clarification.candidates.map((candidate) => candidate.name).slice(0, 4),
      local,
    });
    noteAction(`asked about "${command}"`);
    return;
  }
  if (action?.outcome === 'done') {
    append({ role: 'nova', text: reply, mode: 'action', action, local });
    noteAction(command);
    return;
  }
  // NOVA said it would act and could not. The reply is replaced, never shown as
  // if it had worked.
  append({
    role: 'nova',
    text: `I tried "${command}", but NOVA couldn't carry it out — nothing matching is available here.`,
    mode: 'action',
    action,
    local,
  });
  noteAction(`could not "${command}"`);
}

// --- the conversation ------------------------------------------------------------

/** History as sent to the model: earlier turns only, failures left out. */
function historyForModel(): HistoryEntry[] {
  const messages = state().messages;
  const earlier = messages.slice(0, -1); // the newest is the message being asked
  return trimHistory(
    earlier
      .filter((message) => message.mode !== 'error')
      .map((message) => ({
        role: message.role,
        text:
          message.action && message.action.outcome === 'done'
            ? `${message.text} [NOVA did: ${message.action.command}]`
            : message.text,
      })),
  );
}

let queue: Promise<unknown> = Promise.resolve();

export interface ConverseOutcome {
  understood: boolean;
  clarification: null;
}

/**
 * Answer one sentence. The only way anything enters the conversation.
 *
 * Turns are queued, so a sentence spoken while NOVA is still thinking about the
 * last one waits its turn rather than racing it. Never throws: every failure
 * becomes a message in the conversation.
 */
export function converse(text: string, source: CommandSource = 'command-line'): Promise<ConverseOutcome> {
  const run = queue.then(() => turn(text, source));
  queue = run.catch(() => undefined);
  return run;
}

async function turn(text: string, source: CommandSource): Promise<ConverseOutcome> {
  const message = text.trim().slice(0, LIMITS.messageChars);
  if (!message) return { understood: false, clarification: null };

  if (RESET_PHRASE.test(message)) {
    state().reset();
    append({ role: 'nova', text: 'Starting fresh. What would you like to talk about?', mode: 'conversation', local: true });
    return { understood: true, clarification: null };
  }

  append({ role: 'user', text: message });
  useIntelligenceStore.setState({ status: 'thinking' });

  try {
    // 1. A plain instruction goes straight to the pipeline.
    if (isDirectCommand(message)) {
      await carryOut(message, source, 'Done.', true);
      return { understood: true, clarification: null };
    }

    // 2. Everything else is a conversational turn.
    const request: IntelligenceRequest = {
      message,
      history: historyForModel(),
      context: projectIntelligenceContext(getCurrentContext(), state().recentActions),
    };

    let response: IntelligenceResponse;
    try {
      response = await transport(request);
    } catch {
      response = { error: 'network' };
    }

    if (isFailure(response)) {
      useIntelligenceStore.setState({ lastFailure: response.error });
      await fallBack(message, source, response.error);
      return { understood: true, clarification: null };
    }

    useIntelligenceStore.setState({ lastFailure: null });

    if (response.mode === 'action' && response.command) {
      await carryOut(response.command, source, response.reply, false);
    } else {
      append({ role: 'nova', text: response.reply, mode: response.mode });
    }
    return { understood: true, clarification: null };
  } finally {
    useIntelligenceStore.setState({ status: 'idle' });
  }
}

/**
 * When the model cannot answer, NOVA still can — for plain instructions.
 *
 * A verb-led instruction is offered to the ordinary pipeline, exactly as if it
 * had been typed into the command line. If that runs something, the turn
 * succeeded without the model and says so. If not, the failure is named honestly.
 */
async function fallBack(message: string, source: CommandSource, error: IntelligenceErrorCode) {
  // Only a sentence that is plainly an instruction is offered. A question the
  // model could not answer must never be read by the loose Phase 1 matcher —
  // "how do I reset my router?" would otherwise rearrange the windows — and a
  // reference like "open it" meant something in the conversation that the
  // pipeline cannot know without the model.
  const instruction =
    DIRECT_VERB.test(message) && !message.includes('?') && !CONVERSATIONAL_REFERENCE.test(message);
  const result = instruction ? await routeUtterance(message, source) : null;
  if (result && result.commands.length > 0 && !result.clarification) {
    append({
      role: 'nova',
      text: `${FAILURE_MESSAGES[error]} I carried that out directly instead.`,
      mode: 'action',
      action: { command: message, outcome: 'done' },
      local: true,
    });
    noteAction(message);
    return;
  }
  append({
    role: 'nova',
    text: `${FAILURE_MESSAGES[error]} I can still carry out direct instructions, like "open terminal" or "switch to study".`,
    mode: 'error',
  });
}

/** Open or close the surface. UI state only: it changes nothing spatial. */
export function setIntelligenceOpen(open: boolean) {
  state().setOpen(open);
}

export function toggleIntelligence() {
  state().setOpen(!state().open);
}
