import type {
  NovaCommand as NovaIntent,
  NovaCommandResponse,
  SpatialRelation as IntentRelation,
} from '../../types/nova';
import type { NovaContextGraph } from '../../types/context';
import { WORKSPACE_ORDER } from '../../data/workspaces';
import { getCurrentContext, buildGeminiContext } from '../context/contextEngine';
import { resolveReference } from '../context/referenceResolver';
import type { CommandSource } from '../../types/command';
import { executeIntent, resolveWorkingSet, type BridgeResult } from './contextBridge';
import { modalityOfSource, noteUtterance } from '../multimodal/interactionContext';
import { describeCommand, recordTrace } from '../multimodal/pipelineTrace';
import { interpret } from './commandParser';
import { dispatch } from './commandBus';

/**
 * Where an utterance goes.
 *
 * NOVA has three ways of understanding a sentence, and they are tried in the
 * order that respects the user's time:
 *
 *   1. The Phase 1 matcher, for the phrasings it already handles instantly.
 *   2. This file's contextual reading, for anything referring to *this*, *that*
 *      or a position — resolved against the context graph, locally.
 *   3. Gemini, when the intelligence server is running, for everything else.
 *
 * Every one of them produces the same thing: structured intent, translated by
 * `contextBridge` into command-bus commands. The model is one producer among
 * three, not a privileged path, and none of them can reach the scene.
 */

/**
 * Spatial memory phrasings.
 *
 * Read before anything else, because almost every one of them contains "this"
 * or "that" and would otherwise be taken for an instruction about a window.
 * "Save this" is not a sentence about the focused surface — it is a sentence
 * about the whole arrangement.
 */
const MEMORY_LIST = /\b(list|show|what|which)\b.*\b(saved|memor(y|ies)|workspaces|setups)\b/;
const MEMORY_DELETE = /\b(delete|forget|remove|drop)\b/;
const MEMORY_SAVE = /\b(save|remember|store)\b/;
const MEMORY_RESTORE =
  /\b(restore|continue|resume|reopen|load|bring back|go back to|take me back|pick up)\b/;

/**
 * Read an utterance as a memory instruction, or return null.
 *
 * Names are handed on almost untouched: the resolver strips filler with the
 * same word list it applies to stored names, so "continue my database work" and
 * a memory called "Database Work" meet in the middle rather than relying on
 * this function to guess where the name begins.
 */
export function memoryIntent(text: string): NovaCommandResponse | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;

  if (MEMORY_LIST.test(lower)) {
    return command({ action: 'LIST_MEMORIES', target: '' });
  }

  const aboutMemory = /\b(memor(y|ies)|saved|setup|workspace|session|arrangement)\b/.test(lower);

  if (MEMORY_DELETE.test(lower) && aboutMemory) {
    return command({ action: 'DELETE_MEMORY', target: lower, parameters: { name: lower } });
  }

  if (MEMORY_SAVE.test(lower)) {
    // "save this as X" names the memory; "remember this setup" does not, and
    // the bridge will ask what to call it rather than inventing a name.
    const asClause = /\bas\b\s+(.+)$/.exec(lower);
    const name = asClause ? asClause[1] : '';
    return command({ action: 'SAVE_MEMORY', target: name, parameters: { name } });
  }

  if (MEMORY_RESTORE.test(lower) && (aboutMemory || /\b(work|where i left off|previous)\b/.test(lower))) {
    return command({ action: 'RESTORE_MEMORY', target: lower, parameters: { name: lower } });
  }

  return null;
}

/** Phrases that mean the sentence cannot be understood without context. */
const CONTEXTUAL = /\b(this|that|it|the one|beside|next to|behind|in front|related to|everything)\b/;

const RELATION_PATTERNS: Array<[RegExp, IntentRelation]> = [
  [/\b(beside|next to|alongside)\b/, 'beside'],
  [/\b(to the left of|left of)\b/, 'left'],
  [/\b(to the right of|right of)\b/, 'right'],
  [/\b(on top of|above|over)\b/, 'above'],
  [/\b(below|under|beneath)\b/, 'below'],
  [/\b(in front of|ahead of)\b/, 'front'],
  [/\b(behind|back of)\b/, 'behind'],
];

function splitOn(text: string, pattern: RegExp): [string, string] {
  const match = pattern.exec(text);
  if (!match) return [text, ''];
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

/**
 * Read an utterance as intent, using context for anything it refers to rather
 * than names. Returns null when the sentence has no recognisable action, so the
 * caller can try the next reading rather than inventing one.
 */
export function localIntent(text: string, graph: NovaContextGraph): NovaCommandResponse | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;

  // Workspace switching is unambiguous and should never go anywhere else.
  const workspace = WORKSPACE_ORDER.find((id) => new RegExp(`\\b${id}\\b`).test(lower));
  if (workspace && /\b(switch|go to|open|enter|take me)\b/.test(lower)) {
    return command({ action: 'SWITCH_WORKSPACE', target: workspace });
  }

  // Relational placement: "move this beside the browser".
  for (const [pattern, relation] of RELATION_PATTERNS) {
    if (!pattern.test(lower)) continue;
    const [before, after] = splitOn(lower, pattern);
    const subject = stripVerb(before);
    if (!subject || !after.trim()) continue;
    return command({
      action: 'MOVE',
      target: subject,
      parameters: { relation, relativeTo: after.trim() },
    });
  }

  const subject = () => stripVerb(lower) || 'this';

  if (/\b(bigger|larger|grow|enlarge)\b/.test(lower)) {
    const much = /\b(much|a lot|way)\b/.test(lower);
    const slight = /\b(slightly|a bit|a little)\b/.test(lower);
    return command({
      action: 'RESIZE',
      target: subject(),
      parameters: { scaleMultiplier: much ? 1.4 : slight ? 1.1 : 1.2 },
    });
  }
  if (/\b(smaller|shrink|reduce)\b/.test(lower)) {
    const slight = /\b(slightly|a bit|a little)\b/.test(lower);
    return command({
      action: 'RESIZE',
      target: subject(),
      parameters: { scaleMultiplier: slight ? 0.9 : 0.8 },
    });
  }
  if (/\b(bring .* forward|closer|pull .* forward)\b/.test(lower)) {
    return command({ action: 'BRING_FORWARD', target: subject() });
  }
  if (/\b(send .* back|push .* back|further away)\b/.test(lower)) {
    return command({ action: 'SEND_BACK', target: subject() });
  }
  if (/\b(focus|select|work (on|in))\b/.test(lower)) {
    return command({ action: 'FOCUS', target: subject() });
  }
  if (/\b(open|launch|start)\b/.test(lower)) {
    /**
     * Reached only when the Phase 1 matcher could not name one of NOVA's five
     * applications — so this is the path an installed-but-undiscovered
     * application takes.
     *
     * The name is everything after the verb. `stripVerb` is not used here: it
     * strips the *spatial* verbs ("move", "make", "bring") and deliberately
     * leaves "open" alone, so it would hand the catalog "open calculator" and
     * find nothing. Nothing here decides what the name refers to; the bridge
     * resolves it against the host catalog.
     */
    const named = lower.replace(/^.*?\b(?:open|launch|start)\b\s*/, '').trim();
    if (named) return command({ action: 'OPEN', target: named });
  }
  if (/\b(hide|minimi[sz]e|collapse|stow)\b/.test(lower)) {
    return command({ action: 'HIDE', target: subject() });
  }
  if (/\b(close|dismiss|quit)\b/.test(lower)) {
    return command({ action: 'CLOSE', target: subject() });
  }

  // A bare reference with no verb: "the one on the right".
  const bare = resolveReference(graph, lower);
  if (bare.status === 'resolved') {
    return command({ action: 'FOCUS', target: bare.windowId });
  }

  return null;
}

function command(intent: NovaIntent): NovaCommandResponse {
  return { status: 'ok', commands: [intent] };
}

/** Remove the leading verb so what remains is the thing being referred to. */
function stripVerb(text: string): string {
  return text
    .replace(
      /\b(please|can you|could you|now|just|move|put|place|make|set|bring|send|push|pull|show|focus( on)?|select|hide|minimi[sz]e|collapse|close|dismiss|resize|scale)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

// --- the intelligence server -------------------------------------------------

let remoteAvailable: boolean | null = null;

/**
 * Ask once, at startup, whether the Phase 3 intelligence server is running.
 *
 * Probing once rather than per command matters: under plain `vite` there is no
 * `/api` route, and a failed request on every utterance would put a network
 * stall in front of an interaction that is currently instant.
 */
export async function probeIntelligence(): Promise<boolean> {
  if (remoteAvailable !== null) return remoteAvailable;
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    const body = await response.json();
    remoteAvailable = response.ok && body?.status === 'ok';
  } catch {
    remoteAvailable = false;
  }
  return remoteAvailable;
}

/**
 * How long NOVA will wait for the model before answering without it.
 *
 * An interaction that has already been spoken aloud cannot be left open-ended.
 * Without this bound, a slow or unreachable model left the voice indicator
 * saying "Processing" indefinitely — the whole interface waiting on a network
 * request the user was never told about. Four seconds is longer than the model
 * normally takes and shorter than anyone will stand in front of an audience.
 */
const REMOTE_INTENT_TIMEOUT_MS = 4_000;

async function requestRemoteIntent(utterance: string): Promise<NovaCommandResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_INTENT_TIMEOUT_MS);
  try {
    const response = await fetch('/api/gemini/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The model receives context, never the scene.
      body: JSON.stringify({ prompt: utterance, context: buildGeminiContext() }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as NovaCommandResponse;
  } catch {
    // A timeout and a refusal are the same thing here: NOVA falls through to
    // the local reading and, failing that, says it could not resolve the
    // sentence. Nothing is left pending.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RouteResult extends BridgeResult {
  understood: boolean;
  /** Which reading produced the result, for the inspector and for honesty. */
  via: 'phase1' | 'context' | 'gemini' | 'query' | 'memory';
}

/**
 * Turn what the user said into executed commands, or into a question.
 *
 * Nothing is executed while a reference is unresolved. That is the rule the
 * whole context layer exists to make possible: NOVA would rather ask which
 * window you meant than move the wrong one.
 *
 * `source` labels where the words came from. It changes nothing about how they
 * are read — a spoken sentence and a typed one take the identical path through
 * this function — it only keeps the resulting commands honest about their origin.
 */
export async function routeUtterance(
  text: string,
  source: CommandSource = 'command-line',
): Promise<RouteResult> {
  const utterance = text.trim();
  if (!utterance) {
    return { commands: [], log: [], clarification: null, highlighted: [], understood: false, via: 'phase1' };
  }

  const graph = getCurrentContext();
  const lower = utterance.toLowerCase();
  const modality = modalityOfSource(source);

  // The words themselves are a signal too — recorded for the developer trace
  // only. Nothing resolves a reference from this; the context engine does that.
  noteUtterance(modality, utterance);

  /**
   * Record how this instruction travelled, for the inspector.
   *
   * Wraps every return path so the trace is the truth about what happened
   * rather than a hopeful summary written at the top of the function.
   */
  const trace = (result: RouteResult): RouteResult => {
    const referent = graph.referent;
    recordTrace({
      at: performance.now(),
      inputModality: referent.status === 'resolved' ? referent.modality : null,
      inputTarget: referent.status === 'resolved' ? referent.windowId : null,
      utterance,
      utteranceModality: modality,
      resolution:
        result.log.find((line) => line.includes('→')) ??
        (referent.status === 'ambiguous' ? 'ambiguous across inputs' : null),
      intent: result.via,
      commands: result.commands.map(describeCommand),
      result: result.clarification
        ? 'clarification'
        : result.understood
          ? 'success'
          : 'unresolved',
      detail: result.clarification?.question,
    });
    return result;
  };

  // 0. Spatial memory, read first: these sentences are about the arrangement as
  //    a whole, and most of them contain a pronoun that would otherwise be
  //    resolved to a single window.
  const memory = memoryIntent(utterance);
  if (memory) {
    const result = executeIntent(graph, memory, source);
    return trace({ ...result, understood: true, via: 'memory' });
  }

  // A question about context is answered with context, not with movement.
  if (/\b(show me|what.?s|which)\b.*\b(related|about|part of|belongs?)\b/.test(lower)) {
    const working = resolveWorkingSet(graph, lower);
    return trace({ ...working, understood: true, via: 'query' });
  }

  // 1. The Phase 1 matcher keeps its exact behaviour for phrasings it knows,
  //    unless the sentence contains something only context can resolve.
  if (!CONTEXTUAL.test(lower)) {
    const phase1 = interpret(utterance);
    if (phase1.understood) {
      for (const command of phase1.commands) dispatch(command, source);
      return trace({
        commands: phase1.commands,
        log: ['Resolved locally'],
        clarification: null,
        highlighted: [],
        understood: true,
        via: 'phase1',
      });
    }
  }

  // 2. A contextual reading, resolved against the graph.
  const local = localIntent(utterance, graph);
  if (local) {
    const result = executeIntent(graph, local, source);
    if (result.clarification || result.commands.length) {
      return trace({ ...result, understood: true, via: 'context' });
    }
  }

  // 3. Gemini, when the intelligence server is running.
  if (await probeIntelligence()) {
    const remote = await requestRemoteIntent(utterance);
    if (remote) {
      const result = executeIntent(getCurrentContext(), remote, source);
      return trace({
        ...result,
        clarification:
          result.clarification ??
          (remote.status !== 'ok' && remote.message
            ? { question: remote.message, candidates: [] }
            : null),
        understood: remote.status === 'ok' || Boolean(remote.message),
        via: 'gemini',
      });
    }
  }

  // 4. One last attempt at the Phase 1 matcher, for contextual-looking text
  //    that turns out to name something outright.
  const fallback = interpret(utterance);
  if (fallback.understood) {
    for (const command of fallback.commands) dispatch(command, source);
    return trace({
      commands: fallback.commands,
      log: ['Resolved locally'],
      clarification: null,
      highlighted: [],
      understood: true,
      via: 'phase1',
    });
  }

  return trace({ commands: [], log: [], clarification: null, highlighted: [], understood: false, via: 'phase1' });
}
