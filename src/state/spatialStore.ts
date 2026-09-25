import { create } from 'zustand';
import type { AppType, SpatialWindow } from '../types/window';
import type { WorkspaceId } from '../types/workspace';
import type { CoreState } from '../types/command';
import type { SpatialPosition, SpatialRotation } from '../types/spatial';
import type { TaskId } from '../types/context';
import { APPS, APP_ORDER } from '../data/apps';
import { WORKSPACES } from '../data/workspaces';
import { WORKSPACE_TASK } from '../data/tasks';

export type Quality = 'high' | 'low';

/**
 * How a notice should read.
 *
 * NOVA answers every instruction, and the answers are not all the same kind of
 * thing: starting a real application is a promise, finishing it is a result,
 * and failing to find it is neither. The kind is carried rather than inferred
 * from the words, so the acknowledgement can be styled and read without any
 * component parsing a sentence.
 */
export type NoticeKind = 'info' | 'working' | 'success' | 'error';

export interface Notice {
  text: string;
  kind: NoticeKind;
  at: number;
}

interface SpatialState {
  /** Every spatial window, keyed by id. The one source of truth. */
  windows: Record<string, SpatialWindow>;
  /** Recency order. Last entry is the most recently focused window. */
  order: string[];
  focusedId: string | null;

  workspace: WorkspaceId;
  workspaceChangedAt: number;

  /**
   * What the current arrangement is *for*. Workspaces are spatial; a task is the
   * work being done in one, and it is what lets NOVA answer "everything related
   * to my database assignment" without inspecting coordinates.
   */
  activeTaskId: TaskId | null;

  core: {
    position: SpatialPosition;
    state: CoreState;
    /** Timestamp of the last system event the Core should acknowledge. */
    pulseAt: number;
  };

  quality: Quality;
  commandOpen: boolean;
  notice: Notice | null;

  /**
   * Presentation mode.
   *
   * One flag, not a settings system. It hides the things that exist for whoever
   * is building NOVA — the developer inspectors and the keyboard legend — and
   * leaves everything that explains NOVA to somebody seeing it for the first
   * time. Nothing about behaviour changes, so a demonstration is the real
   * system rather than a mode of it.
   */
  presentation: boolean;

  visionActive: boolean;
  visionStatus: 'off' | 'starting' | 'active' | 'error';
  visionDebug: boolean;
  visionError: string | null;
  /** Developer-only context inspector. Never shown in a production build. */
  contextDebug: boolean;

  // --- mutators (called by the command bus, never by components directly) ---
  patchWindow: (id: string, patch: Partial<SpatialWindow>) => void;
  setTransform: (
    id: string,
    transform: { position?: SpatialPosition; rotation?: SpatialRotation; scale?: number },
  ) => void;
  focusWindow: (id: string | null) => void;
  setMinimized: (id: string, minimized: boolean) => void;
  beginClose: (id: string) => void;
  removeWindow: (id: string) => void;
  openWindow: (app: AppType) => string;
  applyWorkspace: (id: WorkspaceId) => void;
  setTask: (id: TaskId | null) => void;
  setCoreState: (state: CoreState) => void;
  pulseCore: () => void;
  setQuality: (quality: Quality) => void;
  setCommandOpen: (open: boolean) => void;
  notify: (text: string, kind?: NoticeKind) => void;
  setVisionActive: (active: boolean) => void;
  setVisionStatus: (status: 'off' | 'starting' | 'active' | 'error', error?: string | null) => void;
  toggleVision: () => void;
  toggleVisionDebug: (open?: boolean) => void;
  toggleContextDebug: (open?: boolean) => void;
  setPresentation: (presentation: boolean) => void;
}

const ENTRY_STAGGER_MS = 110;

/**
 * Whether NOVA starts presenting.
 *
 * Read once, from the address NOVA was opened at, so a demonstration can be
 * started by opening a link rather than by remembering a keystroke. Absent a
 * browser — under the verification suites — it is simply false.
 */
const PRESENTATION_AT_STARTUP = (() => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has('present');
  } catch {
    return false;
  }
})();

function createWindow(app: AppType, workspace: WorkspaceId, enterDelay = 0): SpatialWindow {
  const definition = APPS[app];
  const placement = WORKSPACES[workspace].placements[app];
  return {
    id: app,
    app,
    title: definition.title,
    position: { ...placement.position },
    rotation: { ...placement.rotation },
    scale: placement.scale,
    width: definition.width,
    height: definition.height,
    focused: false,
    minimized: false,
    lifecycle: 'entering',
    lifecycleAt: performance.now() + enterDelay,
  };
}

function initialWindows(): Record<string, SpatialWindow> {
  const windows: Record<string, SpatialWindow> = {};
  // Establish from the back of the space forward, so depth reveals itself.
  const byDepth = [...APP_ORDER].sort(
    (a, b) => WORKSPACES.home.placements[a].position.z - WORKSPACES.home.placements[b].position.z,
  );
  byDepth.forEach((app, index) => {
    windows[app] = createWindow(app, 'home', index * ENTRY_STAGGER_MS);
  });
  return windows;
}

export const useSpatialStore = create<SpatialState>((set, get) => ({
  windows: initialWindows(),
  order: [...APP_ORDER],
  focusedId: null,

  workspace: 'home',
  workspaceChangedAt: performance.now(),
  activeTaskId: WORKSPACE_TASK.home,

  core: {
    position: { ...WORKSPACES.home.core },
    state: 'idle',
    pulseAt: 0,
  },

  quality: 'high',
  commandOpen: false,
  notice: null,

  presentation: PRESENTATION_AT_STARTUP,

  visionActive: false,
  visionStatus: 'off',
  visionDebug: false,
  visionError: null,
  contextDebug: false,

  patchWindow: (id, patch) =>
    set((state) => {
      const target = state.windows[id];
      if (!target) return state;
      return { windows: { ...state.windows, [id]: { ...target, ...patch } } };
    }),

  setTransform: (id, transform) =>
    set((state) => {
      const target = state.windows[id];
      if (!target) return state;
      return {
        windows: {
          ...state.windows,
          [id]: {
            ...target,
            position: transform.position ?? target.position,
            rotation: transform.rotation ?? target.rotation,
            scale: transform.scale ?? target.scale,
          },
        },
      };
    }),

  focusWindow: (id) =>
    set((state) => {
      if (state.focusedId === id) return state;
      const windows = { ...state.windows };
      for (const key of Object.keys(windows)) {
        const shouldFocus = key === id;
        if (windows[key].focused !== shouldFocus) {
          windows[key] = { ...windows[key], focused: shouldFocus };
        }
      }
      const order = id ? [...state.order.filter((key) => key !== id), id] : state.order;
      return {
        windows,
        order,
        focusedId: id,
        core: { ...state.core, pulseAt: performance.now() },
      };
    }),

  setMinimized: (id, minimized) =>
    set((state) => {
      const target = state.windows[id];
      if (!target || target.minimized === minimized) return state;
      const windows = {
        ...state.windows,
        [id]: { ...target, minimized, focused: minimized ? false : target.focused },
      };
      const focusedId = minimized && state.focusedId === id ? null : state.focusedId;
      const order = minimized ? state.order : [...state.order.filter((k) => k !== id), id];
      return { windows, focusedId, order, core: { ...state.core, pulseAt: performance.now() } };
    }),

  beginClose: (id) =>
    set((state) => {
      const target = state.windows[id];
      if (!target || target.lifecycle === 'closing') return state;
      return {
        windows: {
          ...state.windows,
          [id]: { ...target, lifecycle: 'closing', lifecycleAt: performance.now(), focused: false },
        },
        focusedId: state.focusedId === id ? null : state.focusedId,
        core: { ...state.core, pulseAt: performance.now() },
      };
    }),

  removeWindow: (id) =>
    set((state) => {
      if (!state.windows[id]) return state;
      const windows = { ...state.windows };
      delete windows[id];
      return {
        windows,
        order: state.order.filter((key) => key !== id),
        focusedId: state.focusedId === id ? null : state.focusedId,
      };
    }),

  openWindow: (app) => {
    const existing = get().windows[app];
    if (existing) {
      get().setMinimized(app, false);
      get().focusWindow(app);
      return app;
    }
    const created = createWindow(app, get().workspace);
    set((state) => ({
      windows: { ...state.windows, [created.id]: created },
      order: [...state.order.filter((key) => key !== created.id), created.id],
    }));
    get().focusWindow(created.id);
    return created.id;
  },

  applyWorkspace: (id) =>
    set((state) => {
      const workspace = WORKSPACES[id];
      const minimizedApps = new Set(workspace.minimized ?? []);
      const windows = { ...state.windows };
      for (const key of Object.keys(windows)) {
        const target = windows[key];
        const placement = workspace.placements[target.app];
        if (!placement) continue;
        windows[key] = {
          ...target,
          position: { ...placement.position },
          rotation: { ...placement.rotation },
          scale: placement.scale,
          minimized: minimizedApps.has(target.app),
        };
      }
      return {
        windows,
        workspace: id,
        workspaceChangedAt: performance.now(),
        // Entering an arrangement enters the work it was arranged for.
        activeTaskId: WORKSPACE_TASK[id] ?? state.activeTaskId,
        core: { ...state.core, position: { ...workspace.core }, pulseAt: performance.now() },
      };
    }),

  setTask: (activeTaskId) => set({ activeTaskId }),

  setCoreState: (coreState) => set((state) => ({ core: { ...state.core, state: coreState } })),

  pulseCore: () => set((state) => ({ core: { ...state.core, pulseAt: performance.now() } })),

  setQuality: (quality) => set({ quality }),

  setCommandOpen: (commandOpen) => set({ commandOpen }),

  notify: (text, kind = 'info') => set({ notice: { text, kind, at: performance.now() } }),

  setVisionActive: (visionActive) =>
    set({
      visionActive,
      visionStatus: visionActive ? 'starting' : 'off',
      visionError: null,
    }),

  setVisionStatus: (visionStatus, error = null) =>
    set({
      visionStatus,
      visionActive: visionStatus === 'active' || visionStatus === 'starting',
      visionError: error,
    }),

  toggleVision: () =>
    set((state) => {
      const next = !state.visionActive;
      return {
        visionActive: next,
        visionStatus: next ? 'starting' : 'off',
        visionError: null,
      };
    }),

  toggleVisionDebug: (open) =>
    set((state) => ({ visionDebug: open !== undefined ? open : !state.visionDebug })),

  toggleContextDebug: (open) =>
    set((state) => ({ contextDebug: open !== undefined ? open : !state.contextDebug })),

  setPresentation: (presentation) =>
    set((state) => {
      if (state.presentation === presentation) return state;
      // Entering a presentation puts the instruments away; leaving one does not
      // reopen them, and neither turns the camera itself off.
      if (!presentation) return { presentation };
      return { presentation, visionDebug: false, contextDebug: false };
    }),
}));

/** Non-reactive read for the render loop. Avoids re-rendering React 60 times a second. */
export const spatial = () => useSpatialStore.getState();

/**
 * Resolve a command target to a concrete window id.
 * App ids resolve to the most recently focused window of that app.
 */
export function resolveWindowId(target: string): string | null {
  const state = useSpatialStore.getState();
  if (target === 'focused') return state.focusedId;
  if (state.windows[target]) return target;
  for (let i = state.order.length - 1; i >= 0; i -= 1) {
    const id = state.order[i];
    if (state.windows[id]?.app === target) return id;
  }
  return null;
}
