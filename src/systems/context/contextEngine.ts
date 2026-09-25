import type { WorkspaceId } from '../../types/workspace';
import type {
  ContextRelation,
  GeminiContext,
  NovaContextGraph,
  ReferenceResolution,
  TaskId,
  WindowContext,
} from '../../types/context';
import { resolveWindowId, useSpatialStore } from '../../state/spatialStore';
import { subscribeToCommands } from '../command/commandBus';
import {
  buildContextGraph,
  type ContextSnapshot,
  buildGeminiContext as composeGeminiContext,
  getFocusedWindow as focusedOf,
  getRecentContext as recentOf,
  getRelatedWindows as relatedOf,
  getSpatialRelation as relationOf,
  getWindowContext as windowOf,
  getWindowsByRelation as byRelationOf,
  getWindowsForTask as taskWindowsOf,
  getWindowsForWorkspace as workspaceWindowsOf,
} from './contextGraph';
import { resolveReference as resolveAgainst } from './referenceResolver';
import { activeSignals, onReferentChange } from '../multimodal/interactionContext';
import { useNativeStore } from '../native/nativeStore';

/**
 * The Context Engine.
 *
 * This is the only stateful part of the context layer, and it holds exactly one
 * thing the store does not: *when each window was last acted on*. Everything
 * else is derived.
 *
 * It is event-driven by construction. NOVA's architecture already guarantees
 * that nothing changes state except a command, so subscribing to the command
 * bus is a complete invalidation signal — there is no polling and no per-frame
 * work. Invalidation only marks the cached graph stale; the graph is rebuilt
 * lazily, the next time something actually asks a question. A pointer drag
 * therefore costs one integer increment per frame, not a graph rebuild.
 */

/** Window id → timestamp of the last command that acted on it. */
const interactions: Record<string, number> = {};

let revision = 0;
let cache: { revision: number; graph: NovaContextGraph } | null = null;

function invalidate() {
  revision += 1;
}

/** Record that something happened to a window. Exposed for input layers. */
export function noteInteraction(id: string, at: number = performance.now()) {
  interactions[id] = at;
  invalidate();
}

/**
 * Which window a command acted on, resolved after the bus has executed it so
 * keywords like `focused` point at the result rather than the previous state.
 */
function interactedWindow(command: { action: string; target?: unknown }): string | null {
  const acting = [
    'focus',
    'move',
    'scale',
    'rotate',
    'minimize',
    'restore',
    'close',
    'open',
  ];
  if (!acting.includes(command.action)) return null;
  if (typeof command.target !== 'string' || command.target === 'all') return null;
  return resolveWindowId(command.target);
}

/**
 * Connect the engine to the command bus. Returns an unsubscribe function.
 * Safe to call more than once; later calls replace nothing and simply add
 * another subscription, so callers should keep and use the returned handle.
 */
export function startContextEngine(): () => void {
  const stopCommands = subscribeToCommands((envelope) => {
    const id = interactedWindow(envelope.command);
    if (id) interactions[id] = envelope.at;
    invalidate();
  });

  // A device changing what it points at changes what "this" means, without any
  // command being issued. Invalidation is an integer bump and the graph is
  // rebuilt lazily, so pointing costs nothing until something asks a question.
  const stopReferent = onReferentChange(invalidate);

  // A new reading of the host changes the context too, and arrives on its own
  // schedule rather than through a command. Once every thirty seconds at most.
  const stopNative = useNativeStore.subscribe(invalidate);

  return () => {
    stopCommands();
    stopReferent();
    stopNative();
  };
}

/**
 * Read the store into the flat, inert snapshot the graph builder consumes.
 *
 * Exported because Phase 5 serializes from a reading of this, and because a
 * snapshot is the honest unit to hand to anything that wants NOVA's state
 * without a live subscription to it.
 */
export function captureSnapshot(): ContextSnapshot {
  const state = useSpatialStore.getState();
  return {
    windows: Object.values(state.windows),
    order: state.order,
    focusedId: state.focusedId,
    workspace: state.workspace,
    activeTaskId: state.activeTaskId,
    interactions: { ...interactions },
    signals: activeSignals(),
    // A plain read of the last stored reading. Native I/O happens on its own
    // schedule in `useNativeAwareness`; nothing here ever touches the host.
    native: useNativeStore.getState().snapshot,
    at: performance.now(),
  };
}

// --- the context API ---------------------------------------------------------

/**
 * The current reading of NOVA's world.
 *
 * Cached against a revision counter, so ten questions asked in one turn cost
 * one build. Never hold onto the returned graph across a command — it is a
 * snapshot, and a stale one should be obvious rather than quietly wrong.
 */
export function getCurrentContext(): NovaContextGraph {
  if (cache && cache.revision === revision) return cache.graph;
  const graph = buildContextGraph(captureSnapshot());
  cache = { revision, graph };
  return graph;
}

export function getFocusedWindow(): WindowContext | null {
  return focusedOf(getCurrentContext());
}

export function getWindowContext(id: string): WindowContext | null {
  return windowOf(getCurrentContext(), id);
}

export function getRelatedWindows(id: string): WindowContext[] {
  return relatedOf(getCurrentContext(), id);
}

export function getWindowsForTask(taskId: TaskId): WindowContext[] {
  return taskWindowsOf(getCurrentContext(), taskId);
}

export function getWindowsForWorkspace(workspaceId: WorkspaceId): WindowContext[] {
  return workspaceWindowsOf(getCurrentContext(), workspaceId);
}

export function getSpatialRelation(a: string, b: string): ContextRelation | null {
  return relationOf(getCurrentContext(), a, b);
}

export function getWindowsByRelation(id: string, relation: ContextRelation) {
  return byRelationOf(getCurrentContext(), id, relation);
}

export function getRecentContext(limit = 4): WindowContext[] {
  return recentOf(getCurrentContext(), limit);
}

export function resolveReference(reference: string): ReferenceResolution {
  return resolveAgainst(getCurrentContext(), reference);
}

/**
 * The payload handed to the model, including the names of saved arrangements.
 *
 * The memory summaries are read through a setter rather than imported, so the
 * context layer keeps no dependency on the memory layer — Phase 4 does not need
 * to know Phase 5 exists in order to describe the world to Gemini.
 */
let savedMemoryReader: (() => Array<{ id: string; name: string; workspace: WorkspaceId }>) | null =
  null;

export function setSavedMemoryReader(
  reader: () => Array<{ id: string; name: string; workspace: WorkspaceId }>,
) {
  savedMemoryReader = reader;
}

export function buildGeminiContext(): GeminiContext {
  return composeGeminiContext(getCurrentContext(), savedMemoryReader?.() ?? []);
}

/** Test-only reset, so suites do not inherit one another's interaction history. */
export function resetContextEngine() {
  for (const key of Object.keys(interactions)) delete interactions[key];
  cache = null;
  invalidate();
}
