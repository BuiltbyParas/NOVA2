import type { NovaCommand } from './command';
import type { TaskId } from './context';
import type { WorkspaceId } from './workspace';

/**
 * NOVA's memory vocabulary.
 *
 * Phase 4 gave NOVA a reading of its world. Phase 5 lets a reading be kept.
 *
 * The distinction that governs this whole layer: *current state* is what NOVA is
 * doing right now and lives in `spatialStore`; a *memory* is a deliberate,
 * named snapshot of a state worth coming back to. Nothing here is written
 * automatically, on a timer, or per frame — a memory exists because the user
 * asked for one.
 */

/**
 * The schema version of a stored record.
 *
 * Bumped when the shape of `snapshot` changes in a way older records cannot
 * satisfy. `migrate()` in the serializer is the single place that has to care.
 */
export const MEMORY_SCHEMA_VERSION = 1;

/**
 * A window as it was, reduced to what is worth remembering.
 *
 * Deliberately not the whole `SpatialWindow`: `lifecycle` and `lifecycleAt` are
 * animation bookkeeping measured against a `performance.now()` clock that resets
 * on reload, and `width`/`height` are intrinsic to the application rather than
 * to this arrangement. Saving them would preserve nothing and would break the
 * moment an app's dimensions were retuned.
 */
export interface RememberedWindow {
  id: string;
  app: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  minimized: boolean;
  focused: boolean;
}

/**
 * A relation as it stood when the memory was taken.
 *
 * Derived, not authoritative — relationships are always recomputed from
 * positions after a restore. These are kept so a memory can be *read* and
 * searched without rebuilding a graph, and so a test can prove that what was
 * restored means the same thing as what was saved.
 */
export interface RememberedRelation {
  from: string;
  relation: string;
  to: string;
}

/**
 * What a memory records about the state it came from.
 *
 * This is a reduction of Phase 4's `ContextSnapshot`, not a parallel invention:
 * `memorySerializer.toContextSnapshot` turns one of these back into a genuine
 * `ContextSnapshot` that `buildContextGraph` accepts, so a saved arrangement can
 * be asked the same questions as a live one by the same code. Storing the raw
 * snapshot instead would persist an animation clock and a set of
 * `performance.now()` timestamps that mean nothing after a reload.
 */
export interface MemorySnapshot {
  workspace: { id: WorkspaceId; name: string };
  task: { id: TaskId; name: string } | null;
  focusedWindow: string | null;
  windows: RememberedWindow[];
  /** Derived from the windows above; recomputed rather than trusted on restore. */
  relationships: RememberedRelation[];
  /** Recency order at the time, most recently used last. */
  recent: string[];
  /** Phase 13: Remembered spatial application layer index */
  layerIndex?: number;
}

export interface SpatialMemory {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: MemorySnapshot;
  metadata: {
    source: 'user' | 'system';
    version: number;
    /** Incremented when an existing memory is saved over. */
    revision: number;
  };
}

/** Enough of a memory to list or choose between, without loading the arrangement. */
export interface MemorySummary {
  id: string;
  name: string;
  workspace: WorkspaceId;
  workspaceName: string;
  task: TaskId | null;
  taskName: string | null;
  windowCount: number;
  updatedAt: number;
}

/**
 * Persistence, behind an interface.
 *
 * Phase 5 proves memory locally with `localStorage`. Everything above this
 * interface is written as though storage were remote and fallible, so replacing
 * it with IndexedDB or a real database later is a matter of writing one class.
 */
export interface MemoryRepository {
  save(memory: SpatialMemory): void;
  get(id: string): SpatialMemory | null;
  getAll(): SpatialMemory[];
  delete(id: string): boolean;
  clear(): void;
}

/**
 * How a saved memory was matched to what the user said, and how sure NOVA is.
 * `score` is comparable only within one query's candidates.
 */
export interface MemoryMatch {
  memory: SpatialMemory;
  score: number;
  /** Plain-language account of why this matched, for the question NOVA asks. */
  reason: string;
}

/**
 * Resolving "continue my database work" against what has been saved.
 *
 * `ambiguous` is a first-class outcome, exactly as it is in Phase 4's reference
 * resolver. Restoring the wrong arrangement rearranges the user's whole
 * environment — the most expensive wrong guess NOVA can make.
 */
export type MemoryResolution =
  | { status: 'resolved'; memory: SpatialMemory; via: string }
  | { status: 'ambiguous'; candidates: MemoryMatch[]; question: string }
  | { status: 'unresolved'; reason: string; question?: string };

/**
 * A restore, worked out before any of it happens.
 *
 * The plan is a pure value: a list of ordinary `NovaCommand`s plus an account of
 * what could not be restored. Producing it separately from running it is what
 * makes restoration checkable — a test can assert the plan without moving
 * anything, and the debug panel can show what a restore *would* do.
 */
export interface RestorePlan {
  memoryId: string;
  memoryName: string;
  commands: NovaCommand[];
  /** Windows the memory holds that no longer exist in the environment. */
  missing: string[];
  /** Windows that were restored. */
  restored: string[];
}

/** What actually happened, in words the interface can show the user. */
export interface RestoreReport {
  memoryId: string;
  memoryName: string;
  restored: string[];
  missing: string[];
  message: string;
  at: number;
}
