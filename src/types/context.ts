import type { MultimodalReferent } from './multimodal';
import type { NativeSnapshot } from './native';
import type { SpatialPosition, SpatialRotation } from './spatial';
import type { AppType } from './window';
import type { WorkspaceId } from './workspace';

/**
 * NOVA's context vocabulary.
 *
 * Phase 1 gave NOVA a world: windows at coordinates. This file gives that world
 * *meaning*. A coordinate says where a surface is; a relation says what being
 * there amounts to, and a task says what the arrangement is for.
 *
 * Nothing here is rendered and nothing here is authoritative. Every value in a
 * context graph is derived from `spatialStore`, which remains the single source
 * of truth. The graph is a reading of that state, rebuilt when it changes.
 */

/**
 * What a window *does* in a piece of work, independent of which app it is.
 * This is what lets "show me the documentation" find the browser without the
 * language layer ever knowing the word "browser".
 */
export type SemanticRole =
  | 'documentation'
  | 'implementation'
  | 'execution'
  | 'reference'
  | 'storage'
  | 'system';

/**
 * The relations NOVA can assert between two things in the space.
 *
 * `left`–`behind` are derived from geometry. `near`/`far` are derived from
 * distance. `beside`/`next_to` are adjacency: `beside` is specifically a
 * side-by-side neighbour, `next_to` is a neighbour on any axis. `contains` is
 * structural (a workspace or task contains windows) and `related_to` is
 * semantic — two windows serving the same task.
 */
export type ContextRelation =
  | 'left'
  | 'right'
  | 'above'
  | 'below'
  | 'front'
  | 'behind'
  | 'near'
  | 'far'
  | 'beside'
  | 'next_to'
  | 'contains'
  | 'related_to';

export type TaskId = string;

export interface SpatialRelationship {
  relation: ContextRelation;
  /** The other end: a window id, a task id, or a workspace id. */
  target: string;
  /**
   * 0–1, how strongly the relation holds. Used to rank candidates and to decide
   * when two readings are close enough to be genuinely ambiguous. Never rendered.
   */
  strength: number;
}

/**
 * One window, as context rather than as geometry.
 *
 * `position`/`rotation`/`scale` are copied from the store so a graph is a
 * complete, inert snapshot — a consumer can reason about it without reaching
 * back into live state, which is what makes it safe to hand to the AI layer.
 */
export interface WindowContext {
  id: string;
  type: AppType;
  name: string;
  visible: boolean;
  focused: boolean;
  minimized: boolean;
  workspaceId: WorkspaceId;
  /** The task this window primarily serves in the current arrangement. */
  taskId: TaskId | null;
  semanticRole: SemanticRole;
  position: SpatialPosition;
  rotation: SpatialRotation;
  scale: number;
  relationships: SpatialRelationship[];
  /** Timestamp (ms) of the last command that acted on this window. 0 = never. */
  lastInteractionAt: number;
}

export interface TaskContext {
  id: TaskId;
  name: string;
  /** How a person refers to this task in speech: "my database work". */
  aliases: string[];
  apps: AppType[];
  /** Ids present in the current workspace that serve this task. */
  windowIds: string[];
  active: boolean;
}

export interface WorkspaceContext {
  id: WorkspaceId;
  name: string;
  intent: string;
  windowIds: string[];
}

/**
 * The context graph.
 *
 * Deliberately a plain value, built in one pass and then read many times. It is
 * never mutated — a state change produces a new graph rather than patching this
 * one, for the same reason the store is immutable: a stale reading is obvious
 * rather than subtly wrong.
 */
export interface NovaContextGraph {
  /** When this reading was taken. */
  at: number;
  workspace: WorkspaceContext;
  /** The task the current arrangement is serving, if one is established. */
  task: TaskContext | null;
  tasks: TaskContext[];
  focusedId: string | null;
  /** Windows acted on, oldest first, most recent last. */
  recent: string[];
  /**
   * What the input devices point at right now, across every modality.
   *
   * Part of the graph rather than read from a live store, so that resolving a
   * reference stays a pure function of a snapshot — the same property that lets
   * Phase 4's resolver be tested against fixtures and Phase 5's memories be read
   * by the identical code.
   */
  referent: MultimodalReferent;
  /**
   * The host computer, as last observed. Read-only awareness.
   *
   * Deliberately a sibling of `windows` rather than merged into it. A native
   * window has a process and a compositor; a `WindowContext` has a position and
   * a scale. Nothing in NOVA may read one as the other.
   */
  native: NativeSnapshot;
  windows: WindowContext[];
  byId: Record<string, WindowContext>;
}

/**
 * What the model receives.
 *
 * Compact on purpose: ids, meaning, and relations expressed as `"beside:code"`.
 * No coordinates, no scene objects, no Three.js. Gemini is told what the world
 * *means*, and answers with intent; NOVA decides what that costs in world units.
 */
export interface GeminiWindowContext {
  id: string;
  type: AppType;
  name: string;
  semanticRole: SemanticRole;
  focused?: boolean;
  minimized?: boolean;
  task?: TaskId;
  relations: string[];
}

export interface GeminiContext {
  workspace: WorkspaceId;
  workspaceName: string;
  task: TaskId | null;
  taskName?: string;
  focusedWindow: string | null;
  /** Most recently interacted with last — how "it" gets resolved. */
  recent: string[];
  windows: GeminiWindowContext[];
  availableWorkspaces: Array<{ id: WorkspaceId; name: string; intent: string }>;
  availableTasks: Array<{ id: TaskId; name: string; windows: string[] }>;
  /**
   * Saved arrangements, by name only. The model needs to know what exists in
   * order to say "the user means that one"; it is never given the arrangements
   * themselves, and it never resolves which one — NOVA does that.
   */
  savedMemories?: Array<{ id: string; name: string; workspace: WorkspaceId }>;
  /**
   * Phase 13: Controlled projection of current spatial layer.
   * Exposes only clean names, never positions, coordinates or internal handles.
   */
  currentLayer?: {
    id: string;
    name: string;
    applications: string[];
  };
  availableLayers?: Array<{ id: string; name: string }>;
}

/** How a reference was resolved, kept so ambiguity can be explained honestly. */
export type ResolutionPath =
  /** A device was aimed at it, or it was just clicked or pinched. */
  | 'pointing'
  | 'focus'
  | 'recent'
  | 'app-name'
  | 'semantic-role'
  | 'spatial'
  | 'task'
  | 'workspace'
  | 'only-candidate';

export interface ReferenceCandidate {
  id: string;
  name: string;
  /** Why this one is a candidate, phrased for a person. */
  reason: string;
}

/**
 * The result of resolving "this", "the one on the right", "my database work".
 *
 * `ambiguous` is a first-class outcome, not a failure. NOVA would rather ask
 * than move the wrong surface — a wrong guess in a spatial interface is far
 * more expensive than a question, because the user has to undo it by hand.
 */
export type ReferenceResolution =
  | { status: 'resolved'; windowId: string; via: ResolutionPath }
  | {
      status: 'resolved_set';
      windowIds: string[];
      taskId?: TaskId;
      via: ResolutionPath;
    }
  | {
      status: 'ambiguous';
      candidates: ReferenceCandidate[];
      question: string;
    }
  | { status: 'unresolved'; reason: string; question?: string };
