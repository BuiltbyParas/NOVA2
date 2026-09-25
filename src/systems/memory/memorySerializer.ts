import type { NovaContextGraph } from '../../types/context';
import type {
  MemorySnapshot,
  MemorySummary,
  RememberedRelation,
  RememberedWindow,
  SpatialMemory,
} from '../../types/memory';
import { MEMORY_SCHEMA_VERSION } from '../../types/memory';
import type { AppType, SpatialWindow } from '../../types/window';
import type { ContextSnapshot } from '../context/contextGraph';
import { APPS } from '../../data/apps';
import { WORKSPACES } from '../../data/workspaces';

/**
 * Turning a reading of the world into something that survives a reload, and back.
 *
 * A memory is taken from the Phase 4 *context graph* rather than from the raw
 * store, because the graph is where meaning lives: it already knows which task
 * each window serves and how the windows stand to one another. What it does not
 * carry — animation clocks, interaction timestamps, intrinsic app dimensions —
 * is exactly what should not be preserved, so the reduction is the design.
 *
 * `toContextSnapshot` is the inverse, and it is what makes the Phase 4 promise
 * literal: a saved arrangement can be fed back through `buildContextGraph` and
 * asked the same questions as a live one, using the same code.
 */

/** Relations worth keeping. Proximity drifts constantly and means little later. */
const DURABLE_RELATIONS = new Set([
  'beside',
  'next_to',
  'left',
  'right',
  'above',
  'below',
  'front',
  'behind',
  'related_to',
]);

export function captureMemorySnapshot(graph: NovaContextGraph): MemorySnapshot {
  const windows: RememberedWindow[] = graph.windows.map((win) => ({
    id: win.id,
    app: win.type,
    position: { ...win.position },
    rotation: { ...win.rotation },
    scale: win.scale,
    minimized: win.minimized,
    focused: win.focused,
  }));

  const relationships: RememberedRelation[] = [];
  for (const win of graph.windows) {
    for (const relationship of win.relationships) {
      if (!DURABLE_RELATIONS.has(relationship.relation)) continue;
      relationships.push({
        from: win.id,
        relation: relationship.relation,
        to: relationship.target,
      });
    }
  }

  return {
    workspace: { id: graph.workspace.id, name: graph.workspace.name },
    task: graph.task ? { id: graph.task.id, name: graph.task.name } : null,
    focusedWindow: graph.focusedId,
    windows,
    relationships,
    recent: [...graph.recent],
  };
}

/**
 * Rebuild a context snapshot from a memory.
 *
 * Fields that were deliberately not saved are reconstituted from configuration
 * (`width`/`height` from the app definition) or given inert values (`lifecycle`
 * settled, clocks at zero). The result is a legitimate input to
 * `buildContextGraph` — that is the point of the exercise.
 */
export function toContextSnapshot(memory: MemorySnapshot, at = 0): ContextSnapshot {
  const windows: SpatialWindow[] = memory.windows
    .filter((win) => Boolean(APPS[win.app as AppType]))
    .map((win) => {
      const definition = APPS[win.app as AppType];
      return {
        id: win.id,
        app: win.app as AppType,
        title: definition.title,
        position: { ...win.position },
        rotation: { ...win.rotation },
        scale: win.scale,
        width: definition.width,
        height: definition.height,
        focused: win.focused,
        minimized: win.minimized,
        lifecycle: 'settled',
        lifecycleAt: 0,
      };
    });

  return {
    windows,
    order: memory.recent.filter((id) => windows.some((win) => win.id === id)),
    focusedId: memory.focusedWindow,
    workspace: memory.workspace.id,
    activeTaskId: memory.task?.id ?? null,
    interactions: {},
    at,
  };
}

/** A stable, readable id. Names collide; ids must not. */
function memoryId(name: string, at: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'memory'}-${at.toString(36)}`;
}

/**
 * Build a record from the current reading.
 *
 * Saving over an existing memory keeps its id and creation time and increments
 * its revision, so "save this as my database workspace" twice updates one
 * arrangement rather than quietly accumulating near-duplicates the resolver
 * would then have to call ambiguous.
 */
export function createMemory(
  name: string,
  graph: NovaContextGraph,
  existing?: SpatialMemory | null,
  now = Date.now(),
): SpatialMemory {
  return {
    id: existing?.id ?? memoryId(name, now),
    name: name.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    snapshot: captureMemorySnapshot(graph),
    metadata: {
      source: 'user',
      version: MEMORY_SCHEMA_VERSION,
      revision: (existing?.metadata.revision ?? 0) + 1,
    },
  };
}

export function summarize(memory: SpatialMemory): MemorySummary {
  return {
    id: memory.id,
    name: memory.name,
    workspace: memory.snapshot.workspace.id,
    workspaceName: memory.snapshot.workspace.name,
    task: memory.snapshot.task?.id ?? null,
    taskName: memory.snapshot.task?.name ?? null,
    windowCount: memory.snapshot.windows.length,
    updatedAt: memory.updatedAt,
  };
}

/**
 * Bring a stored record up to the current schema, or reject it.
 *
 * There is one version so far, so this is mostly a validator. It exists now
 * rather than later because the alternative — discovering on the day of the
 * first schema change that nothing checks what came out of storage — is how
 * persistence layers start losing data.
 */
export function migrate(raw: unknown): SpatialMemory | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<SpatialMemory>;

  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  if (!record.snapshot || typeof record.snapshot !== 'object') return null;

  const snapshot = record.snapshot as Partial<MemorySnapshot>;
  if (!Array.isArray(snapshot.windows)) return null;
  if (!snapshot.workspace || !WORKSPACES[snapshot.workspace.id]) return null;

  const version = record.metadata?.version ?? 0;
  if (version > MEMORY_SCHEMA_VERSION) return null; // written by a newer NOVA

  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt ?? Date.now(),
    updatedAt: record.updatedAt ?? record.createdAt ?? Date.now(),
    snapshot: {
      workspace: snapshot.workspace,
      task: snapshot.task ?? null,
      focusedWindow: snapshot.focusedWindow ?? null,
      windows: snapshot.windows,
      relationships: snapshot.relationships ?? [],
      recent: snapshot.recent ?? [],
    },
    metadata: {
      source: record.metadata?.source ?? 'user',
      version: MEMORY_SCHEMA_VERSION,
      revision: record.metadata?.revision ?? 1,
    },
  };
}
