import type { MemoryMatch, MemoryResolution, SpatialMemory } from '../../types/memory';
import type { TaskId } from '../../types/context';
import type { WorkspaceId } from '../../types/workspace';

/**
 * Finding the memory somebody meant.
 *
 * Deterministic on purpose. Phase 5 does not get embeddings or a vector store —
 * not because they would not work, but because a scoring function whose every
 * decision can be read off the code is the right thing to build first. When this
 * stops being good enough, the shape of the problem will be clear enough to
 * choose a model for it.
 *
 * The rule inherited from Phase 4: when two memories are equally plausible,
 * ask. Restoring the wrong one rearranges the user's entire environment, which
 * is the most expensive mistake NOVA is capable of making.
 */

/** Below this, nothing matched well enough to act on. */
const MIN_CONFIDENCE = 0.3;
/** Within this of the leader, a candidate is a genuine rival. */
const AMBIGUITY_MARGIN = 0.12;

/**
 * Words that carry no identity.
 *
 * Both the query and the memory name are stripped with the same list, so
 * "database workspace" and "my database work" reduce to the same content.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'mine', 'our', 'me', 'i', 'it', 'this', 'that', 'those', 'these',
  'to', 'of', 'on', 'in', 'at', 'for', 'from', 'as', 'with', 'and', 'or',
  'please', 'can', 'you', 'now', 'just',
  'continue', 'resume', 'restore', 'reopen', 'load', 'go', 'back', 'again', 'return',
  'save', 'saving', 'remember', 'store', 'keep',
  'delete', 'forget', 'remove', 'drop',
  'show', 'list', 'display',
  'memory', 'memories', 'saved', 'setup', 'set', 'up', 'session', 'state',
  'work', 'working', 'workspace', 'workspaces', 'environment', 'arrangement', 'layout',
  'where', 'left', 'off', 'previous', 'last', 'before', 'earlier',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Content words, ordered, so two phrasings of the same name compare equal. */
function contentKey(text: string): string {
  return [...new Set(tokens(text))].sort().join(' ');
}

export interface MemoryQueryContext {
  workspace?: WorkspaceId;
  task?: TaskId | null;
}

/**
 * Score one memory against a phrase.
 *
 * Name evidence dominates. Workspace and task agreement contribute only enough
 * to break a tie between otherwise equal candidates, and recency less still —
 * neither should ever be able to outvote what the user actually said.
 */
function score(
  memory: SpatialMemory,
  query: string,
  context: MemoryQueryContext,
  newest: number,
): MemoryMatch | null {
  const queryNorm = normalize(query);
  const nameNorm = normalize(memory.name);

  if (queryNorm === nameNorm) {
    return { memory, score: 1, reason: 'exact name' };
  }

  const queryKey = contentKey(query);
  const nameKey = contentKey(memory.name);

  if (queryKey && queryKey === nameKey) {
    return { memory, score: 0.98, reason: 'same name' };
  }
  if (nameNorm && queryNorm.includes(nameNorm)) {
    return { memory, score: 0.95, reason: `you named "${memory.name}"` };
  }

  const queryTokens = new Set(tokens(query));
  const nameTokens = new Set(tokens(memory.name));

  let base = 0;
  let reason = '';

  if (queryTokens.size && nameTokens.size) {
    const shared = [...queryTokens].filter((word) => nameTokens.has(word));
    if (shared.length) {
      // How much of what was asked for is covered, and how specific the memory
      // is to it. A short, exactly-matching name should beat a long one that
      // merely contains the word.
      const askedFor = shared.length / queryTokens.size;
      const specificity = shared.length / nameTokens.size;
      base = 0.7 * askedFor + 0.3 * specificity;
      reason = `name mentions ${shared.join(', ')}`;
    }
  }

  // The words might describe the workspace or the task rather than the name.
  if (queryTokens.size) {
    const meta = new Set([
      ...tokens(memory.snapshot.workspace.name),
      ...tokens(memory.snapshot.task?.name ?? ''),
    ]);
    const shared = [...queryTokens].filter((word) => meta.has(word));
    if (shared.length) {
      const viaMeta = 0.55 * (shared.length / queryTokens.size);
      if (viaMeta > base) {
        base = viaMeta;
        reason = `saved in ${memory.snapshot.workspace.name}`;
      }
    }
  }

  if (base <= 0) return null;

  // Tie-breakers, kept deliberately small.
  let bonus = 0;
  if (context.workspace && memory.snapshot.workspace.id === context.workspace) bonus += 0.03;
  if (context.task && memory.snapshot.task?.id === context.task) bonus += 0.03;
  if (newest > 0 && memory.updatedAt === newest) bonus += 0.02;

  return { memory, score: Math.min(base + bonus, 0.94), reason };
}

/** Does the phrase name a memory at all, or is it "where I left off"? */
function hasContentWords(query: string): boolean {
  return tokens(query).length > 0;
}

/**
 * Resolve a phrase to a saved memory.
 *
 * Three outcomes, and the caller must handle all of them: one clear match, a
 * question, or nothing. There is no fourth outcome where NOVA picks the most
 * likely and hopes.
 */
export function resolveMemory(
  query: string,
  memories: SpatialMemory[],
  context: MemoryQueryContext = {},
): MemoryResolution {
  if (!memories.length) {
    return {
      status: 'unresolved',
      reason: 'Nothing has been saved yet.',
      question: 'Save an arrangement first — try "save this as my database workspace".',
    };
  }

  const newest = Math.max(...memories.map((memory) => memory.updatedAt));

  // "Continue where I left off" names nothing, and means the most recent one.
  // That is not a guess: the phrase is a reference to recency, and recency is
  // something NOVA knows exactly.
  if (!hasContentWords(query)) {
    const mostRecent = memories.find((memory) => memory.updatedAt === newest);
    if (mostRecent) {
      return { status: 'resolved', memory: mostRecent, via: 'most recently saved' };
    }
  }

  const matches = memories
    .map((memory) => score(memory, query, context, newest))
    .filter((match): match is MemoryMatch => match !== null)
    .sort((a, b) => b.score - a.score);

  if (!matches.length || matches[0].score < MIN_CONFIDENCE) {
    return {
      status: 'unresolved',
      reason: `Nothing saved matches "${query.trim()}".`,
      question:
        memories.length <= 4
          ? `Saved: ${memories.map((memory) => memory.name).join(', ')}.`
          : undefined,
    };
  }

  const rivals = matches.filter((match) => matches[0].score - match.score < AMBIGUITY_MARGIN);
  if (rivals.length > 1) {
    return {
      status: 'ambiguous',
      candidates: rivals,
      question: `I found ${rivals.length} saved workspaces that could be that — did you mean ${rivals
        .map((match) => `"${match.memory.name}"`)
        .join(' or ')}?`,
    };
  }

  return { status: 'resolved', memory: matches[0].memory, via: matches[0].reason };
}
