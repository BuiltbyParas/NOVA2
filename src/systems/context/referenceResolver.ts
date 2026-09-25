import type {
  ContextRelation,
  NovaContextGraph,
  ReferenceCandidate,
  ReferenceResolution,
  SemanticRole,
  WindowContext,
} from '../../types/context';
import type { AppType } from '../../types/window';
import { APPS, APP_ORDER } from '../../data/apps';
import { findTaskByPhrase } from '../../data/tasks';
import { getRelatedWindows } from './contextGraph';

/**
 * Turning what the user said into which window they meant.
 *
 * "this", "it", "the one on the right", "everything related to my database
 * work" — all of these are references to objects NOVA already knows about, and
 * resolving them is NOVA's job, not the model's. The model reports intent; the
 * context engine decides which surface that intent lands on, because only NOVA
 * knows what is currently focused, what was touched last and what sits where.
 *
 * When two readings are equally good this returns `ambiguous` rather than a
 * best guess. In a spatial interface a wrong guess costs the user a manual
 * correction; a question costs them a word.
 */

/**
 * How far apart two candidates must be, in spatial units, before one is
 * genuinely "the one on the right". Under this margin NOVA asks.
 */
const AMBIGUITY_MARGIN = 0.8;

const PRONOUNS = [
  'this',
  'that',
  'it',
  'this one',
  'that one',
  'current_window',
  'focused_window',
  'current window',
  'focused window',
  'focused',
  'the window',
  // Multimodal phrasings: the user naming the act of indicating rather than the
  // object. All of them land in the same place — `resolveDeictic` — because the
  // referent is what they are all reaching for.
  'the selected window',
  'selected',
  'the selection',
  "the window i'm pointing at",
  'the window i am pointing at',
  "the one i'm pointing at",
  'the one i am pointing at',
  'pointing at',
];

const ROLE_WORDS: Array<{ role: SemanticRole; terms: string[] }> = [
  { role: 'documentation', terms: ['documentation', 'docs', 'the docs'] },
  { role: 'implementation', terms: ['implementation', 'the source', 'source code'] },
  { role: 'execution', terms: ['execution', 'the commands'] },
  { role: 'storage', terms: ['storage', 'my files'] },
];

/** Words that make a reference plural — "everything", "all of it". */
const SET_WORDS = ['everything', 'all ', 'every ', 'the whole', 'each '];

type Extreme = { relation: ContextRelation; axis: 'x' | 'y' | 'z'; sign: 1 | -1 };

const EXTREMES: Array<{ terms: string[]; extreme: Extreme }> = [
  { terms: ['on the right', 'rightmost', 'to the right', 'right of'], extreme: { relation: 'right', axis: 'x', sign: 1 } },
  { terms: ['on the left', 'leftmost', 'to the left', 'left of'], extreme: { relation: 'left', axis: 'x', sign: -1 } },
  { terms: ['above', 'on top', 'the top one', 'highest'], extreme: { relation: 'above', axis: 'y', sign: 1 } },
  { terms: ['below', 'underneath', 'the bottom one', 'lowest'], extreme: { relation: 'below', axis: 'y', sign: -1 } },
  { terms: ['in front', 'at the front', 'front of', 'nearest', 'closest'], extreme: { relation: 'front', axis: 'z', sign: 1 } },
  { terms: ['behind', 'at the back', 'furthest', 'farthest'], extreme: { relation: 'behind', axis: 'z', sign: -1 } },
];

const describe = (win: WindowContext) => win.name;

/** The earliest spatial description in the phrase, with where it begins. */
function findExtreme(text: string): { extreme: Extreme; term: string; index: number } | null {
  let best: { extreme: Extreme; term: string; index: number } | null = null;
  for (const { terms, extreme } of EXTREMES) {
    for (const term of terms) {
      const index = text.indexOf(term);
      if (index >= 0 && (!best || index < best.index)) best = { extreme, term, index };
    }
  }
  return best;
}

function candidatesOf(windows: WindowContext[], reason: string): ReferenceCandidate[] {
  return windows.map((win) => ({ id: win.id, name: describe(win), reason }));
}

function ask(windows: WindowContext[], reason: string, question: string): ReferenceResolution {
  return { status: 'ambiguous', candidates: candidatesOf(windows, reason), question };
}

/**
 * The first application named in the phrase, with where it was named.
 *
 * Matching is bounded to whole words: "dev" must not be found inside
 * "development", or asking for a workspace would silently select the editor.
 */
function findApp(text: string): { app: AppType; index: number } | null {
  let best: { app: AppType; index: number } | null = null;
  for (const app of APP_ORDER) {
    for (const alias of APPS[app].aliases) {
      const match = new RegExp(`\\b${alias}\\b`).exec(text);
      if (match && (!best || match.index < best.index)) best = { app, index: match.index };
    }
  }
  return best;
}

function windowForApp(graph: NovaContextGraph, app: AppType): WindowContext | null {
  return graph.windows.find((win) => win.type === app) ?? null;
}

/**
 * Pick the window furthest along an axis, or say the field is too close to call.
 * Minimized windows are excluded — a surface in the dock is not "the one on the
 * right" no matter where its stored coordinates happen to put it.
 */
function resolveExtreme(graph: NovaContextGraph, extreme: Extreme): ReferenceResolution {
  const placed = graph.windows.filter((win) => win.visible);
  if (!placed.length) return { status: 'unresolved', reason: 'No windows are placed in this workspace.' };
  if (placed.length === 1) return { status: 'resolved', windowId: placed[0].id, via: 'only-candidate' };

  const ranked = [...placed].sort(
    (a, b) => (b.position[extreme.axis] - a.position[extreme.axis]) * extreme.sign,
  );
  const lead = ranked[0].position[extreme.axis] * extreme.sign;
  const contenders = ranked.filter(
    (win) => lead - win.position[extreme.axis] * extreme.sign < AMBIGUITY_MARGIN,
  );

  if (contenders.length > 1) {
    return ask(
      contenders,
      `sits ${extreme.relation} in the current arrangement`,
      `Two windows are ${extreme.relation === 'front' || extreme.relation === 'behind' ? '' : 'equally far '}${extreme.relation} — did you mean ${contenders.map(describe).join(' or ')}?`,
    );
  }
  return { status: 'resolved', windowId: ranked[0].id, via: 'spatial' };
}

/** "right of code" — an explicit anchor, so the reading is unambiguous by axis. */
function resolveRelativeToAnchor(
  graph: NovaContextGraph,
  extreme: Extreme,
  anchor: WindowContext,
): ReferenceResolution {
  const sign = extreme.sign;
  const beyond = graph.windows
    .filter((win) => win.visible && win.id !== anchor.id)
    .filter((win) => (win.position[extreme.axis] - anchor.position[extreme.axis]) * sign > 0.2)
    .sort(
      (a, b) =>
        Math.abs(a.position[extreme.axis] - anchor.position[extreme.axis]) -
        Math.abs(b.position[extreme.axis] - anchor.position[extreme.axis]),
    );

  if (!beyond.length) {
    return {
      status: 'unresolved',
      reason: `Nothing sits ${extreme.relation} of ${describe(anchor)}.`,
    };
  }
  if (beyond.length > 1) {
    const gap = Math.abs(
      beyond[0].position[extreme.axis] - beyond[1].position[extreme.axis],
    );
    if (gap < AMBIGUITY_MARGIN) {
      return ask(
        beyond.slice(0, 2),
        `sits ${extreme.relation} of ${describe(anchor)}`,
        `Both are ${extreme.relation} of ${describe(anchor)} — did you mean ${beyond
          .slice(0, 2)
          .map(describe)
          .join(' or ')}?`,
      );
    }
  }
  return { status: 'resolved', windowId: beyond[0].id, via: 'spatial' };
}

/**
 * "this", "it" — resolved from what the user is indicating, then focus, then
 * what was touched last.
 *
 * The multimodal referent comes first because it is the most explicit thing
 * available: a hand aimed at a window, or a surface just clicked, is the user
 * saying "that one" with their body while saying "this" with their mouth. Focus
 * and recency remain exactly as Phase 4 defined them and take over the moment
 * no device is indicating anything.
 */
export function resolveDeictic(graph: NovaContextGraph): ReferenceResolution {
  const referent = graph.referent;

  if (referent.status === 'resolved' && graph.byId[referent.windowId]?.visible) {
    return { status: 'resolved', windowId: referent.windowId, via: 'pointing' };
  }

  // Two devices indicating different windows is not something to rank. NOVA
  // names both and asks, rather than deciding that a mouse outranks a hand.
  if (referent.status === 'ambiguous') {
    const candidates = referent.candidates
      .map((candidate) => graph.byId[candidate.windowId])
      .filter((win): win is WindowContext => Boolean(win) && win.visible);
    if (candidates.length > 1) {
      return ask(
        candidates,
        'is being pointed at',
        `Two inputs are indicating different windows — did you mean ${candidates
          .map(describe)
          .join(' or ')}?`,
      );
    }
    if (candidates.length === 1) {
      return { status: 'resolved', windowId: candidates[0].id, via: 'pointing' };
    }
  }

  if (graph.focusedId) return { status: 'resolved', windowId: graph.focusedId, via: 'focus' };

  const recent = [...graph.recent].reverse().filter((id) => graph.byId[id]?.visible);
  if (recent.length) return { status: 'resolved', windowId: recent[0], via: 'recent' };

  const placed = graph.windows.filter((win) => win.visible);
  if (placed.length === 1) return { status: 'resolved', windowId: placed[0].id, via: 'only-candidate' };
  if (!placed.length) return { status: 'unresolved', reason: 'There are no windows to act on.' };

  return ask(
    placed,
    'is open in this workspace',
    'Nothing is focused — which window do you mean?',
  );
}

/**
 * Resolve one reference against the graph.
 *
 * The order is specific-to-general, because a phrase that names something
 * outright should never be second-guessed by a pronoun heuristic: "the terminal
 * related to this task" is about the terminal, whatever else it mentions.
 */
export function resolveReference(graph: NovaContextGraph, reference: string): ReferenceResolution {
  const text = reference.trim().toLowerCase();
  if (!text) return { status: 'unresolved', reason: 'No reference was given.' };

  // A concrete window id from the model or the command bus needs no inference.
  if (graph.byId[text]) return { status: 'resolved', windowId: text, via: 'app-name' };

  const named = findApp(text);
  const spatial = findExtreme(text);

  // 1. Named application — unless a spatial phrase came first, in which case the
  //    application is the anchor and not the subject: "right of code" is about
  //    whatever sits right of the editor, not the editor.
  if (named && (!spatial || named.index < spatial.index)) {
    const win = windowForApp(graph, named.app);
    if (win) return { status: 'resolved', windowId: win.id, via: 'app-name' };
    return {
      status: 'unresolved',
      reason: `${APPS[named.app].name} is not open in this workspace.`,
    };
  }

  // 2. Named by what it is for, rather than what it is.
  for (const { role, terms } of ROLE_WORDS) {
    if (!terms.some((term) => text.includes(term))) continue;
    const matches = graph.windows.filter((win) => win.visible && win.semanticRole === role);
    if (matches.length === 1) return { status: 'resolved', windowId: matches[0].id, via: 'semantic-role' };
    if (matches.length > 1) {
      return ask(matches, `is the ${role} surface`, `Which ${role} window do you mean?`);
    }
  }

  // 3. Spatial description, with or without an explicit anchor.
  if (spatial) {
    const after = text.slice(spatial.index + spatial.term.length);
    const anchorApp = findApp(after);
    const anchor = anchorApp ? windowForApp(graph, anchorApp.app) : null;
    if (anchor) return resolveRelativeToAnchor(graph, spatial.extreme, anchor);
    return resolveExtreme(graph, spatial.extreme);
  }

  // 4. A task: "everything related to my database work".
  const task = findTaskByPhrase(text);
  if (task) {
    const windowIds = graph.windows
      .filter((win) => win.visible && task.apps.includes(win.type))
      .map((win) => win.id);
    if (!windowIds.length) {
      return {
        status: 'unresolved',
        reason: `Nothing from ${task.name} is open in ${graph.workspace.name}.`,
        question: `${task.name} usually uses ${task.apps.join(', ')} — should I open them?`,
      };
    }
    return { status: 'resolved_set', windowIds, taskId: task.id, via: 'task' };
  }

  // 5. "everything related to this" — a set anchored on the current object.
  const plural = SET_WORDS.some((word) => text.includes(word));
  if (plural) {
    const anchor = resolveDeictic(graph);
    if (anchor.status !== 'resolved') return anchor;
    const related = getRelatedWindows(graph, anchor.windowId);
    return {
      status: 'resolved_set',
      windowIds: [anchor.windowId, ...related.map((win) => win.id)],
      via: 'task',
    };
  }

  // 6. A pronoun, resolved from focus and recency.
  if (PRONOUNS.some((pronoun) => new RegExp(`\\b${pronoun}\\b`).test(text))) {
    return resolveDeictic(graph);
  }

  return {
    status: 'unresolved',
    reason: `NOVA could not tell which object "${reference.trim()}" refers to.`,
    question: 'Which window do you mean?',
  };
}
