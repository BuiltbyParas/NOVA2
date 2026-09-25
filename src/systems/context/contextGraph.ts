import type { SpatialWindow } from '../../types/window';
import type { WorkspaceId } from '../../types/workspace';
import type { ModalitySignal } from '../../types/multimodal';
import type { NativeSnapshot } from '../../types/native';
import { unavailableSnapshot } from '../../types/native';
import type {
  ContextRelation,
  GeminiContext,
  GeminiWindowContext,
  NovaContextGraph,
  SpatialRelationship,
  TaskContext,
  TaskId,
  WindowContext,
  WorkspaceContext,
} from '../../types/context';
import { APPS } from '../../data/apps';
import { WORKSPACES, WORKSPACE_ORDER } from '../../data/workspaces';
import { APP_ROLES, TASKS, TASK_ORDER, WORKSPACE_TASK } from '../../data/tasks';
import { spatial } from '../../state/spatialStore';
import { DEFAULT_LAYERS } from '../../data/layers';
import { resolveReferent } from '../multimodal/referentResolution';
import {
  deriveRelationships,
  getSpatialRelation as geometricRelation,
  type RelatableObject,
} from './spatialRelations';

/**
 * The context graph, and the questions it can answer.
 *
 * `buildContextGraph` is pure: state in, meaning out. That is the whole design.
 * It means a graph can be built from fixture data in a test, from the live store
 * at runtime, and — in Phase 5 — from a saved arrangement, with identical
 * results and no code path that only exists in one of those cases.
 */

/** Exactly what the graph needs from the rest of NOVA. Nothing more. */
export interface ContextSnapshot {
  windows: SpatialWindow[];
  /** Recency order from the store: most recently focused last. */
  order: string[];
  focusedId: string | null;
  workspace: WorkspaceId;
  activeTaskId: TaskId | null;
  /** Window id → timestamp of the last command that acted on it. */
  interactions: Record<string, number>;
  /**
   * What the input devices are currently pointing at or have just selected.
   *
   * Optional, because a graph built from fixture data or from a saved memory
   * has no devices attached to it — and must still answer every other question
   * identically. When absent, reference resolution behaves exactly as it did in
   * Phase 4.
   */
  signals?: ModalitySignal[];
  /**
   * What NOVA last saw of the computer it is running on.
   *
   * Optional, and purely *awareness*: nothing derived from it participates in
   * relations, reference resolution, focus or any transform. A graph built from
   * a fixture or a saved memory has none, and answers every other question
   * identically.
   */
  native?: NativeSnapshot;
  at: number;
}

const isPresent = (win: SpatialWindow) => win.lifecycle !== 'closing';
const isVisible = (win: SpatialWindow) => isPresent(win) && !win.minimized;

/**
 * Which task a window primarily serves.
 *
 * The active task wins when it claims the app, because the same editor means
 * something different depending on what the user sat down to do. Otherwise the
 * first task that claims it stands in, so a window is never contextless.
 */
function taskForApp(app: SpatialWindow['app'], activeTaskId: TaskId | null): TaskId | null {
  if (activeTaskId && TASKS[activeTaskId]?.apps.includes(app)) return activeTaskId;
  for (const id of TASK_ORDER) {
    if (TASKS[id].apps.includes(app)) return id;
  }
  return null;
}

export function buildContextGraph(snapshot: ContextSnapshot): NovaContextGraph {
  const present = snapshot.windows.filter(isPresent);
  const activeTaskId = snapshot.activeTaskId ?? WORKSPACE_TASK[snapshot.workspace] ?? null;

  // Only placed surfaces take part in spatial reasoning. A minimized window sits
  // in the dock beside the Core, so its coordinates describe where it is stored,
  // not where it is in the user's work — asserting relations from them would be
  // confidently wrong.
  const placed: RelatableObject[] = present.filter(isVisible);

  const windows: WindowContext[] = present.map((win) => {
    const taskId = taskForApp(win.app, activeTaskId);
    const relationships: SpatialRelationship[] = isVisible(win)
      ? deriveRelationships(win, placed)
      : [];

    // Semantic relation: serving the same task is a relationship in its own
    // right, and unlike the geometric ones it survives the windows being moved.
    for (const other of present) {
      if (other.id === win.id) continue;
      if (taskId && taskForApp(other.app, activeTaskId) === taskId) {
        relationships.push({ relation: 'related_to', target: other.id, strength: 1 });
      }
    }

    return {
      id: win.id,
      type: win.app,
      name: APPS[win.app].name,
      visible: isVisible(win),
      focused: win.focused,
      minimized: win.minimized,
      workspaceId: snapshot.workspace,
      taskId,
      semanticRole: APP_ROLES[win.app],
      position: { ...win.position },
      rotation: { ...win.rotation },
      scale: win.scale,
      relationships,
      lastInteractionAt: snapshot.interactions[win.id] ?? 0,
    };
  });

  const byId: Record<string, WindowContext> = {};
  for (const win of windows) byId[win.id] = win;

  const definition = WORKSPACES[snapshot.workspace];
  const workspace: WorkspaceContext = {
    id: definition.id,
    name: definition.name,
    intent: definition.intent,
    windowIds: windows.map((win) => win.id),
  };

  const tasks: TaskContext[] = TASK_ORDER.map((id) => {
    const task = TASKS[id];
    return {
      id: task.id,
      name: task.name,
      aliases: task.aliases,
      apps: task.apps,
      windowIds: windows.filter((win) => task.apps.includes(win.type)).map((win) => win.id),
      active: id === activeTaskId,
    };
  });

  // Recency: the store's focus order, narrowed to windows that still exist and
  // ordered by when a command last touched them, so a drag counts as much as a
  // focus. This is what "it" and "that" actually mean.
  const recent = [...windows]
    .filter((win) => win.lastInteractionAt > 0)
    .sort((a, b) => a.lastInteractionAt - b.lastInteractionAt)
    .map((win) => win.id);
  // The store's focus order is history too, just without timestamps. It runs
  // oldest-first, so it is walked backwards and prepended — otherwise the
  // fallback would hand back the *least* recent window as the most recent.
  for (let i = snapshot.order.length - 1; i >= 0; i -= 1) {
    const id = snapshot.order[i];
    if (byId[id] && !recent.includes(id)) recent.unshift(id);
  }

  // What the devices point at, computed here so the whole graph is one
  // consistent reading. A referent naming a window that is gone is discarded
  // rather than carried forward as a stale answer.
  const rawReferent = resolveReferent(snapshot.signals ?? [], snapshot.at);
  const referent =
    rawReferent.status === 'resolved' && !byId[rawReferent.windowId]
      ? { status: 'none' as const }
      : rawReferent;

  return {
    at: snapshot.at,
    workspace,
    task: tasks.find((task) => task.active) ?? null,
    tasks,
    focusedId: snapshot.focusedId && byId[snapshot.focusedId] ? snapshot.focusedId : null,
    recent,
    referent,
    // Carried through untouched. Native windows are *not* merged with spatial
    // windows and native geometry is never read as a spatial position: they are
    // different objects about different things, and Phase 8 does not reconcile
    // them.
    native: snapshot.native ?? unavailableSnapshot('Native awareness was not supplied.'),
    windows,
    byId,
  };
}

// --- queries -----------------------------------------------------------------

export function getFocusedWindow(graph: NovaContextGraph): WindowContext | null {
  return graph.focusedId ? (graph.byId[graph.focusedId] ?? null) : null;
}

export function getWindowContext(graph: NovaContextGraph, id: string): WindowContext | null {
  return graph.byId[id] ?? null;
}

export function getWindowsForWorkspace(
  graph: NovaContextGraph,
  workspaceId: WorkspaceId,
): WindowContext[] {
  if (graph.workspace.id !== workspaceId) return [];
  return graph.windows;
}

export function getWindowsForTask(graph: NovaContextGraph, taskId: TaskId): WindowContext[] {
  return graph.windows.filter((win) => win.taskId === taskId);
}

/**
 * Everything the given window is connected to, most relevant first.
 *
 * Relevance is meaning before geometry: windows serving the same task, then
 * ones sitting beside it, then ones merely near it. That ordering is the reason
 * "show me everything related to this" returns a working set rather than a
 * list of neighbours.
 */
export function getRelatedWindows(graph: NovaContextGraph, id: string): WindowContext[] {
  const subject = graph.byId[id];
  if (!subject) return [];

  const weight: Partial<Record<ContextRelation, number>> = {
    related_to: 3,
    beside: 2,
    next_to: 1.6,
    near: 1.2,
  };

  const scores = new Map<string, number>();
  for (const relationship of subject.relationships) {
    const bonus = weight[relationship.relation];
    if (!bonus) continue;
    const previous = scores.get(relationship.target) ?? 0;
    scores.set(relationship.target, previous + bonus * relationship.strength);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([targetId]) => graph.byId[targetId])
    .filter((win): win is WindowContext => Boolean(win));
}

/** Windows standing in a specific relation to `id`, strongest first. */
export function getWindowsByRelation(
  graph: NovaContextGraph,
  id: string,
  relation: ContextRelation,
): Array<{ window: WindowContext; strength: number }> {
  const subject = graph.byId[id];
  if (!subject) return [];
  return subject.relationships
    .filter((relationship) => relationship.relation === relation)
    .map((relationship) => ({
      window: graph.byId[relationship.target],
      strength: relationship.strength,
    }))
    .filter((entry) => Boolean(entry.window))
    .sort((a, b) => b.strength - a.strength);
}

/**
 * How `a` stands to `b`, where either may be a window, a task or the workspace.
 *
 * Containment is answered structurally rather than geometrically, which is what
 * makes "is the terminal part of this task?" a question the graph can answer.
 */
export function getSpatialRelation(
  graph: NovaContextGraph,
  a: string,
  b: string,
): ContextRelation | null {
  if (a === b) return null;

  if (a === graph.workspace.id && graph.byId[b]) return 'contains';
  const taskA = graph.tasks.find((task) => task.id === a);
  if (taskA) return taskA.windowIds.includes(b) ? 'contains' : null;

  const subject = graph.byId[a];
  const reference = graph.byId[b];
  if (!subject || !reference) return null;
  if (!subject.visible || !reference.visible) {
    return subject.taskId && subject.taskId === reference.taskId ? 'related_to' : null;
  }
  return geometricRelation(toRelatable(subject), toRelatable(reference));
}

/** Most recently interacted with first — the opposite order to the graph's. */
export function getRecentContext(graph: NovaContextGraph, limit = 4): WindowContext[] {
  return [...graph.recent]
    .reverse()
    .slice(0, limit)
    .map((id) => graph.byId[id])
    .filter((win): win is WindowContext => Boolean(win));
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

// --- the model's view --------------------------------------------------------

/**
 * Relations worth telling the model about.
 *
 * `near`/`far` are left out: they change constantly as windows drift and would
 * fill the prompt with noise that does not change what the user meant. The
 * relations that survive are the ones a person would say out loud.
 */
const REPORTED: ContextRelation[] = ['beside', 'left', 'right', 'above', 'below', 'front', 'behind'];

/**
 * The compact snapshot handed to Gemini.
 *
 * No coordinates, no rotations, no scene handles — the model is given what the
 * arrangement *means* and answers with intent. NOVA alone decides what that
 * intent costs in world units, which is the boundary Phase 3 established and
 * this phase has to keep.
 */
export function buildGeminiContext(
  graph: NovaContextGraph,
  savedMemories: Array<{ id: string; name: string; workspace: WorkspaceId }> = [],
): GeminiContext {
  const windows: GeminiWindowContext[] = graph.windows.map((win) => {
    // One relation per neighbour: the strongest thing true about the pair.
    const strongest = new Map<string, SpatialRelationship>();
    for (const relationship of win.relationships) {
      if (!REPORTED.includes(relationship.relation)) continue;
      const held = strongest.get(relationship.target);
      const rank = (value: SpatialRelationship) =>
        value.strength + (value.relation === 'beside' ? 0.5 : 0);
      if (!held || rank(relationship) > rank(held)) strongest.set(relationship.target, relationship);
    }

    return {
      id: win.id,
      type: win.type,
      name: win.name,
      semanticRole: win.semanticRole,
      ...(win.focused ? { focused: true } : {}),
      ...(win.minimized ? { minimized: true } : {}),
      ...(win.taskId ? { task: win.taskId } : {}),
      relations: [...strongest.values()]
        .sort((a, b) => b.strength - a.strength)
        .map((relationship) => `${relationship.relation}:${relationship.target}`),
    };
  });

  return {
    workspace: graph.workspace.id,
    workspaceName: graph.workspace.name,
    task: graph.task?.id ?? null,
    ...(graph.task ? { taskName: graph.task.name } : {}),
    focusedWindow: graph.focusedId,
    recent: [...graph.recent].reverse().slice(0, 4),
    windows,
    availableWorkspaces: WORKSPACE_ORDER.map((id) => ({
      id,
      name: WORKSPACES[id].name,
      intent: WORKSPACES[id].intent,
    })),
    availableTasks: graph.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      windows: task.windowIds,
    })),
    ...(savedMemories.length ? { savedMemories } : {}),
    currentLayer: (() => {
      try {
        const store = spatial();
        const activeIdx = store.layer?.currentLayerIndex ?? 0;
        const activeLayer = (store.layer?.layers ?? DEFAULT_LAYERS)[activeIdx];
        if (!activeLayer) return undefined;
        return {
          id: activeLayer.id,
          name: activeLayer.name,
          applications: activeLayer.applications.map((app) => APPS[app]?.name ?? app),
        };
      } catch {
        return undefined;
      }
    })(),
    availableLayers: (spatial()?.layer?.layers ?? DEFAULT_LAYERS).map((l) => ({
      id: l.id,
      name: l.name,
    })),
  };
}
