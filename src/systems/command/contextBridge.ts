import type {
  NovaCommand as NovaIntent,
  NovaCommandResponse,
  SpatialRelation as IntentRelation,
} from '../../types/nova';
import type { CommandSource, NovaCommand, SpatialRelation } from '../../types/command';
import type { WorkspaceId } from '../../types/workspace';
import type {
  NovaContextGraph,
  ReferenceCandidate,
  WindowContext,
} from '../../types/context';
import type { AppType } from '../../types/window';
import { APPS, genericAppFor } from '../../data/apps';
import { ENVIRONMENT } from '../../data/environment';
import { WORKSPACE_ORDER } from '../../data/workspaces';
import { TASKS } from '../../data/tasks';
import { installedApplications, resolveApplication } from '../native/applicationCatalog';
import { listMemories } from '../memory/memoryManager';
import { resolveMemory } from '../memory/memoryResolver';
import { isBeside, type RelatableObject } from '../context/spatialRelations';
import { getRelatedWindows } from '../context/contextGraph';
import { resolveReference } from '../context/referenceResolver';
import { dispatch } from './commandBus';

/**
 * Intent to command.
 *
 * Phase 3 gave the intelligence layer its own vocabulary — `MOVE`, `RESIZE`,
 * semantic relations like "beside", and contextual targets like "this". Phase 1
 * gave the command bus a smaller, concrete vocabulary that the store can
 * execute. This file is the one place those two meet, and it is where the
 * architecture's central rule is actually enforced:
 *
 *   INPUT → CONTEXT → AI / INTENT → **COMMAND** → COMMAND BUS → STATE → RENDER
 *
 * The model says what the user meant. The context engine says which object that
 * lands on. This translator says what it costs in NOVA's own terms. Nothing
 * here, and nothing above here, can reach a Three.js object.
 */

/** A translation that could not be completed without asking the user something. */
export interface BridgeClarification {
  question: string;
  candidates: ReferenceCandidate[];
  /**
   * What answering the question should do. Windows are re-asked by focusing the
   * chosen one and running the sentence again; a memory question already knows
   * its verb, so the answer is dispatched directly.
   */
  pendingAction?: 'memory-restore' | 'memory-delete';
}

export interface BridgeResult {
  commands: NovaCommand[];
  /** Plain-language account of what was resolved, for the inspector and logs. */
  log: string[];
  clarification: BridgeClarification | null;
  /** Windows the user asked to be shown, when the intent was a query, not an action. */
  highlighted: string[];
}

const WORKSPACE_IDS = new Set<string>(WORKSPACE_ORDER);

const MEMORY_ACTIONS = new Set(['SAVE_MEMORY', 'RESTORE_MEMORY', 'LIST_MEMORIES', 'DELETE_MEMORY']);

/**
 * Which NOVA spatial application is this the *category name* of?
 *
 * Only a category word claims a spatial surface here — "browser", not "Chrome".
 * A product name falls through to the installed-application catalog below,
 * which is the whole point: naming a specific application should get you that
 * application, not NOVA's generic stand-in for its kind.
 *
 * Returns null rather than a best guess, so an unrecognised name keeps the
 * existing unresolved behaviour instead of being opened as something else.
 */
function appTypeFromName(raw: string): AppType | null {
  return genericAppFor(raw);
}

/** Strip the possessive and filler a person naturally puts around a name. */
function cleanMemoryName(raw: string): string {
  return raw
    .trim()
    .replace(/^(my|the|our)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Translate one memory intent.
 *
 * `SAVE_MEMORY` needs only a name. The other three need NOVA to work out which
 * saved arrangement was meant, which is `resolveMemory`'s job — and which can
 * legitimately come back as a question.
 */
function translateMemory(
  graph: NovaContextGraph,
  intent: NovaIntent,
  rawTarget: string,
  log: string[],
): { commands: NovaCommand[] } | { clarification: BridgeClarification } {
  const named = cleanMemoryName(String(intent.parameters?.name ?? rawTarget ?? ''));

  if (intent.action === 'LIST_MEMORIES') {
    const memories = listMemories();
    log.push(
      memories.length
        ? `Saved: ${memories.map((memory) => memory.name).join(', ')}`
        : 'Nothing has been saved yet.',
    );
    return { commands: [{ action: 'memory-list', open: true }] };
  }

  if (intent.action === 'SAVE_MEMORY') {
    if (!named) {
      return {
        clarification: { question: 'What should I call this arrangement?', candidates: [] },
      };
    }
    log.push(`SAVE_MEMORY "${named}"`);
    return { commands: [{ action: 'memory-save', name: named }] };
  }

  const pendingAction = intent.action === 'DELETE_MEMORY' ? 'memory-delete' : 'memory-restore';
  const resolution = resolveMemory(named, listMemories(), {
    workspace: graph.workspace.id,
    task: graph.task?.id ?? null,
  });

  if (resolution.status === 'ambiguous') {
    return {
      clarification: {
        question: resolution.question,
        candidates: resolution.candidates.map((match) => ({
          id: match.memory.id,
          name: match.memory.name,
          reason: match.reason,
        })),
        pendingAction,
      },
    };
  }

  if (resolution.status === 'unresolved') {
    return {
      clarification: {
        question: resolution.question
          ? `${resolution.reason} ${resolution.question}`
          : resolution.reason,
        candidates: [],
      },
    };
  }

  log.push(`${intent.action} "${resolution.memory.name}" (${resolution.via})`);
  return {
    commands: [
      pendingAction === 'memory-delete'
        ? { action: 'memory-delete', id: resolution.memory.id }
        : { action: 'memory-restore', id: resolution.memory.id },
    ],
  };
}

/** Resolve an intent target against context. Concrete ids pass straight through. */
function resolveTarget(
  graph: NovaContextGraph,
  target: string,
): { id: string } | { clarification: BridgeClarification } | { missing: string } {
  const resolution = resolveReference(graph, target);
  if (resolution.status === 'resolved') return { id: resolution.windowId };
  if (resolution.status === 'resolved_set' && resolution.windowIds.length === 1) {
    return { id: resolution.windowIds[0] };
  }
  if (resolution.status === 'resolved_set') {
    return {
      clarification: {
        question: `"${target}" covers ${resolution.windowIds.length} windows — which one did you mean?`,
        candidates: resolution.windowIds.map((id) => ({
          id,
          name: graph.byId[id]?.name ?? id,
          reason: 'belongs to that task',
        })),
      },
    };
  }
  if (resolution.status === 'ambiguous') {
    return { clarification: { question: resolution.question, candidates: resolution.candidates } };
  }
  return { missing: resolution.reason };
}

function toRelatable(win: WindowContext): RelatableObject {
  const definition = APPS[win.type];
  return {
    id: win.id,
    position: win.position,
    width: definition.width,
    height: definition.height,
    scale: win.scale,
  };
}

/**
 * "Beside" is a relation with two possible answers, and choosing between them
 * is NOVA's job rather than the model's.
 *
 * The window keeps the side it is already on, unless something is already
 * sitting there — in which case it takes the other side. That is what a person
 * does when they put one sheet of paper next to another.
 */
function chooseSide(
  graph: NovaContextGraph,
  movingId: string,
  referenceId: string,
): 'left_of' | 'right_of' {
  const moving = graph.byId[movingId];
  const reference = graph.byId[referenceId];
  if (!moving || !reference) return 'right_of';

  const preferred: 'left_of' | 'right_of' =
    moving.position.x < reference.position.x ? 'left_of' : 'right_of';
  const opposite = preferred === 'left_of' ? 'right_of' : 'left_of';

  const occupant = graph.windows.find((win) => {
    if (win.id === movingId || win.id === referenceId || !win.visible) return false;
    const onPreferredSide =
      preferred === 'left_of'
        ? win.position.x < reference.position.x
        : win.position.x > reference.position.x;
    return onPreferredSide && isBeside(toRelatable(win), toRelatable(reference));
  });

  return occupant ? opposite : preferred;
}

/** The intent vocabulary's relations, in the command bus's terms. */
const RELATION_MAP: Partial<Record<IntentRelation, SpatialRelation>> = {
  left: 'left_of',
  right: 'right_of',
  above: 'above',
  below: 'below',
  front: 'in_front_of',
  near: 'in_front_of',
  behind: 'behind',
  far: 'behind',
};

/**
 * Where a region word puts a window when there is nothing to be relative to.
 * "Move the browser left" with no reference means the left of the room.
 */
function regionPosition(relation: IntentRelation) {
  const x = ENVIRONMENT.bounds.x * 0.62;
  const y = ENVIRONMENT.bounds.y * 0.5;
  switch (relation) {
    case 'left':
      return { x: -x };
    case 'right':
      return { x };
    case 'above':
      return { y };
    case 'below':
      return { y: -y };
    case 'center':
      return { x: 0, y: 0 };
    case 'front':
    case 'near':
      return { z: ENVIRONMENT.depth.front * 0.6 };
    case 'behind':
    case 'far':
      return { z: ENVIRONMENT.depth.back * 0.7 };
    default:
      return null;
  }
}

/**
 * What "open X" means.
 *
 * Two kinds of name, and the distinction is the whole of this fix:
 *
 *   a **category** — "browser", "terminal" — names one of NOVA's five spatial
 *   surfaces. It is revealed if it already exists and created if it does not,
 *   exactly as before.
 *
 *   a **product** — "Chrome", "Spotify", "Visual Studio Code" — names a real
 *   application. It is resolved against the installed-application catalog and
 *   launched by its own desktop id. It must never collapse into a category,
 *   because NOVA's Browser surface is not Chrome.
 *
 * The order matters on this host in particular: the catalog contains
 * applications literally named "Terminal" and "Files", so asking the catalog
 * first would divert "open terminal" away from its spatial window.
 */
/**
 * Words that name nothing and point at something.
 *
 * "Open this" is not a sentence about an application called "this" — it is a
 * sentence whose subject is supplied by a finger, a cursor or the focused
 * window. These are the only phrases `translateOpen` hands to the reference
 * resolver instead of to the installed-application catalog, because the catalog
 * can only ever answer with a name and there is no name here to answer with.
 */
const DEICTIC = /^(this|that|it|the one|this one|that one|here|there)$/;

function translateOpen(
  graph: NovaContextGraph,
  rawTarget: string,
  log: string[],
): { commands: NovaCommand[] } | { clarification: BridgeClarification } {
  /**
   * A pointed-at window is opened, never launched.
   *
   * Reference resolution already knows how to answer "which window is being
   * referred to", and Phase 7 already feeds it what the hand and the cursor are
   * aimed at. All that was missing was asking: "open this" previously reached
   * the catalog, which searched the installed applications for one called
   * "this", found none, and reported the sentence as unresolvable while the
   * answer was sitting under the user's finger.
   */
  if (DEICTIC.test(rawTarget.trim().toLowerCase())) {
    const pointed = resolveTarget(graph, rawTarget);
    if ('clarification' in pointed) return { clarification: pointed.clarification };
    if ('id' in pointed) {
      log.push(`OPEN "${rawTarget}" → ${pointed.id} (referent)`);
      return {
        commands: [
          { action: 'restore', target: pointed.id },
          { action: 'focus', target: pointed.id },
        ],
      };
    }
    // Nothing is being pointed at. Saying so is the honest answer; searching
    // the catalog for "this" is not.
    log.push(`OPEN "${rawTarget}": ${pointed.missing}`);
    return { commands: [] };
  }

  const category = appTypeFromName(rawTarget);

  if (category) {
    const existing = graph.byId[category];
    if (existing) {
      log.push(`OPEN "${rawTarget}" → reveal ${category}`);
      return {
        commands: [
          { action: 'restore', target: category },
          { action: 'focus', target: category },
        ],
      };
    }
    log.push(`OPEN "${rawTarget}" → open ${category} (not currently represented)`);
    return { commands: [{ action: 'open', target: category }] };
  }

  // Not a category, so it names something specific. Only the catalog can say
  // what — and it can only ever answer with an id it read from that catalog.
  const found = resolveApplication(rawTarget, installedApplications());

  if (found.status === 'resolved') {
    log.push(`OPEN "${rawTarget}" → launch ${found.id} (${found.via})`);
    return {
      commands: [{ action: 'open-application', applicationId: found.id, name: found.name }],
    };
  }

  if (found.status === 'ambiguous') {
    // Several installed applications fit. Launching the wrong one is a visible,
    // unwanted action on someone's desktop, so NOVA asks.
    return {
      clarification: {
        question: `${found.reason} Did you mean ${found.candidates
          .slice(0, 4)
          .map((candidate) => candidate.name)
          .join(' or ')}?`,
        candidates: found.candidates.slice(0, 4).map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          reason: 'installed on this computer',
        })),
      },
    };
  }

  log.push(`OPEN "${rawTarget}": ${found.reason}`);
  return { commands: [] };
}

function translateMove(
  graph: NovaContextGraph,
  id: string,
  intent: NovaIntent,
  log: string[],
): NovaCommand | BridgeClarification | null {
  const relation = intent.parameters?.relation;
  const relativeTo = intent.parameters?.relativeTo;

  if (relation && relativeTo) {
    const reference = resolveTarget(graph, String(relativeTo));
    if ('clarification' in reference) return reference.clarification;
    if ('missing' in reference) {
      log.push(`Could not place ${id}: ${reference.missing}`);
      return null;
    }
    if (reference.id === id) {
      log.push(`Ignored ${id} → ${relation} → itself.`);
      return null;
    }

    const mapped =
      relation === 'beside' || relation === 'next_to'
        ? chooseSide(graph, id, reference.id)
        : RELATION_MAP[relation];

    if (mapped) {
      log.push(`MOVE ${id} ${mapped.replace('_', ' ')} ${reference.id}`);
      return {
        action: 'move',
        target: id,
        relation: mapped,
        reference: reference.id,
      };
    }
  }

  if (relation) {
    const position = regionPosition(relation);
    if (position) {
      log.push(`MOVE ${id} to the ${relation} of the environment`);
      return { action: 'move', target: id, position };
    }
  }

  log.push(`MOVE ${id} had no usable relation.`);
  return null;
}

/**
 * Translate a whole intelligence-layer response into command-bus commands.
 *
 * Nothing is dispatched here — translation and execution are kept apart so the
 * same function can be exercised in a test, previewed in the inspector, or run
 * for real, with no branch that only exists in one of those cases.
 */
export function translateIntent(
  graph: NovaContextGraph,
  response: NovaCommandResponse,
): BridgeResult {
  const commands: NovaCommand[] = [];
  const log: string[] = [];
  const highlighted: string[] = [];

  if (response.status !== 'ok') {
    return {
      commands,
      log: [`Intent returned "${response.status}" — nothing executed.`],
      clarification: response.message
        ? { question: response.message, candidates: [] }
        : null,
      highlighted,
    };
  }

  for (const intent of response.commands ?? []) {
    const rawTarget = String(intent.target ?? '');

    // --- spatial memory ----------------------------------------------------
    // Memory intents name an arrangement, not a window, so they are resolved
    // against the memory store rather than against the context graph. As
    // everywhere else, an unclear reference produces a question, never a guess
    // — restoring the wrong memory rearranges the user's entire environment.
    if (MEMORY_ACTIONS.has(intent.action)) {
      const memoryResult = translateMemory(graph, intent, rawTarget, log);
      if ('clarification' in memoryResult) {
        return { commands, log, clarification: memoryResult.clarification, highlighted };
      }
      commands.push(...memoryResult.commands);
      continue;
    }

    if (intent.action === 'SWITCH_WORKSPACE') {
      const workspace = rawTarget.toLowerCase();
      if (WORKSPACE_IDS.has(workspace)) {
        log.push(`SWITCH_WORKSPACE → ${workspace}`);
        commands.push({ action: 'workspace', target: workspace as WorkspaceId });
      } else {
        log.push(`Unknown workspace "${rawTarget}".`);
      }
      continue;
    }

    if (intent.action === 'ARRANGE' && !rawTarget) {
      commands.push({ action: 'arrange' });
      continue;
    }

    // "Show me everything related to my database work" is a query about
    // context, not an instruction to move anything. It returns a working set.
    if (intent.action === 'SHOW' || intent.action === 'OPEN') {
      const asTask = TASKS[rawTarget.toLowerCase()];
      if (asTask) {
        const members = graph.windows
          .filter((win) => asTask.apps.includes(win.type))
          .map((win) => win.id);
        highlighted.push(...members);
        log.push(`Context set for ${asTask.name}: ${members.join(', ') || 'nothing open'}`);
        for (const id of members) commands.push({ action: 'restore', target: id });
        continue;
      }
    }

    /**
     * Opening is decided before reference resolution.
     *
     * `resolveTarget` asks the Phase 4 reference resolver, which knows every
     * alias in `APPS` — including product names like "chrome". If it ran first
     * it would answer "the Browser window", and "open Chrome" would reveal
     * NOVA's generic browser surface instead of launching the Chrome that is
     * actually installed. So the category question is asked here, first, and
     * only for OPEN. Every other action still resolves exactly as it did.
     */
    if (intent.action === 'OPEN') {
      const decision = translateOpen(graph, rawTarget, log);
      if ('clarification' in decision) {
        return { commands, log, clarification: decision.clarification, highlighted };
      }
      commands.push(...decision.commands);
      continue;
    }

    const resolved = resolveTarget(graph, rawTarget);
    if ('clarification' in resolved) {
      return { commands, log, clarification: resolved.clarification, highlighted };
    }
    if ('missing' in resolved) {
      /**
       * OPEN is the one action whose whole purpose is to act on something that
       * is *not* there yet.
       *
       * Every other action needs an existing window, so "Terminal is not open
       * in this workspace" is the right answer for them. For OPEN it was the
       * wrong answer to the right question: the user asked for it to be opened.
       *
       * The application registry is consulted directly rather than the context
       * graph, because the graph only knows what already exists. Nothing about
       * reference resolution changes — this is reached only after it has said
       * the thing is absent.
       */
      log.push(`Skipped ${intent.action}: ${resolved.missing}`);
      continue;
    }
    const id = resolved.id;
    log.push(`"${rawTarget}" → ${id}`);

    switch (intent.action) {
      case 'FOCUS':
        commands.push({ action: 'focus', target: id });
        break;

      case 'MOVE': {
        const translated = translateMove(graph, id, intent, log);
        if (!translated) break;
        if ('question' in translated) {
          return { commands, log, clarification: translated, highlighted };
        }
        commands.push(translated);
        break;
      }

      case 'RESIZE': {
        const { scale, scaleMultiplier } = intent.parameters ?? {};
        const current = graph.byId[id]?.scale ?? 1;
        // The model speaks in multipliers ("bigger" → 1.2); the bus wants an
        // absolute scale, and clamping stays where it already lives, in the bus.
        const next = scale ?? current * (scaleMultiplier ?? 1.2);
        log.push(`RESIZE ${id} → ${next.toFixed(2)}`);
        commands.push({ action: 'scale', target: id, scale: next });
        break;
      }

      case 'ROTATE': {
        const angle = intent.parameters?.angle ?? 0;
        const axis = intent.parameters?.axis ?? 'y';
        commands.push({ action: 'rotate', target: id, delta: { [axis]: angle } });
        break;
      }

      case 'BRING_FORWARD':
        commands.push({ action: 'move', target: id, delta: { z: 0.8 } });
        commands.push({ action: 'focus', target: id });
        break;

      case 'SEND_BACK':
        commands.push({ action: 'move', target: id, delta: { z: -0.8 } });
        break;

      // OPEN is handled earlier, by `translateOpen`, because it has to decide
      // between a NOVA surface and an installed application before the
      // reference resolver gets a chance to answer "the Browser window".
      case 'SHOW':
        commands.push({ action: 'restore', target: id });
        commands.push({ action: 'focus', target: id });
        break;

      case 'HIDE':
        commands.push({ action: 'minimize', target: id });
        break;

      case 'CLOSE':
        commands.push({ action: 'close', target: id });
        break;

      case 'ARRANGE':
        commands.push({ action: 'arrange' });
        break;
    }
  }

  return { commands, log, clarification: null, highlighted };
}

/**
 * Answer a question about context without changing anything.
 *
 * "Show me everything related to this" is a legitimate thing to say to a
 * spatial computer, and the honest response is a set of objects — not a move.
 */
export function resolveWorkingSet(graph: NovaContextGraph, phrase: string): BridgeResult {
  const resolution = resolveReference(graph, phrase);

  if (resolution.status === 'resolved_set') {
    return {
      commands: [],
      log: [`Working set: ${resolution.windowIds.join(', ')}`],
      clarification: null,
      highlighted: resolution.windowIds,
    };
  }
  if (resolution.status === 'resolved') {
    const related = getRelatedWindows(graph, resolution.windowId).map((win) => win.id);
    return {
      commands: [],
      log: [`Working set around ${resolution.windowId}: ${related.join(', ') || 'nothing'}`],
      clarification: null,
      highlighted: [resolution.windowId, ...related],
    };
  }
  if (resolution.status === 'ambiguous') {
    return {
      commands: [],
      log: [],
      clarification: { question: resolution.question, candidates: resolution.candidates },
      highlighted: [],
    };
  }
  return {
    commands: [],
    log: [resolution.reason],
    clarification: resolution.question
      ? { question: resolution.question, candidates: [] }
      : null,
    highlighted: [],
  };
}

/**
 * Translate, then run. The only function in this file that changes state.
 *
 * `source` is carried onto every envelope so the Core, the hints and anything
 * else listening can tell a spoken instruction from a typed one — without any
 * of them needing a second code path for it.
 */
export function executeIntent(
  graph: NovaContextGraph,
  response: NovaCommandResponse,
  source: CommandSource = 'ai',
): BridgeResult {
  const result = translateIntent(graph, response);
  if (result.clarification) return result;
  for (const command of result.commands) dispatch(command, source);
  return result;
}
