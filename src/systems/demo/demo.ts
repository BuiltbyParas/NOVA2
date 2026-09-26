import { create } from 'zustand';
import type { AppType } from '../../types/window';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { interaction } from '../interaction/interactionSystem';
import { requestPortal } from '../portal/portal';
import { routeUtterance } from '../command/intentRouter';
import {
  converse,
  setIntelligenceOpen,
  useIntelligenceStore,
  type IntelligenceMessage,
} from '../intelligence/intelligenceSession';

/**
 * NOVA Demo Mode — "Explore NOVA".
 *
 * A deterministic, roughly 25-second showcase of what NOVA already does. It is a
 * *script*, not a feature: every beat calls an existing entry point exactly as a
 * person's input would — the command bus, the portal's `requestPortal` (which
 * brings NOVA's real spatial windows out of the Core), `routeUtterance` to
 * focus one, the Phase 13 layer command, and `converse` with a plain
 * instruction, which NOVA
 * answers through its own direct path without calling the model. Nothing is
 * mocked, nothing writes the spatial store directly, and nothing reaches Gemini.
 *
 * Afterwards — or the moment it is cancelled — it puts back what it changed:
 * the windows it opened are closed, the layer, focus and portal return to how
 * they were, and the lines it added to the conversation are removed.
 */

export const DEMO_APP: AppType = 'browser';
/** The instruction the demo asks NOVA — answered on the direct path, no model. */
export const DEMO_INSTRUCTION = 'open terminal';

export interface DemoBeat {
  /** When the beat runs, ms after the demo starts. */
  at: number;
  /** What the caption says while it plays. */
  caption: string;
  run: () => void;
}

/** One running demo's memory of what to put back. */
interface Snapshot {
  windows: Set<string>;
  focusedId: string | null;
  layerIndex: number;
  intelligenceOpen: boolean;
  messageCount: number;
  recentActions: readonly string[];
}

let snapshot: Snapshot | null = null;

function takeSnapshot(): Snapshot {
  const spatial = useSpatialStore.getState();
  const intelligence = useIntelligenceStore.getState();
  return {
    windows: new Set(Object.keys(spatial.windows)),
    focusedId: spatial.focusedId,
    layerIndex: spatial.layer.currentLayerIndex,
    intelligenceOpen: intelligence.open,
    messageCount: intelligence.messages.length,
    recentActions: [...intelligence.recentActions],
  };
}

/** The script. Pure data plus calls into existing entry points. */
export const DEMO_BEATS: readonly DemoBeat[] = [
  {
    at: 0,
    caption: 'NOVA wakes',
    run: () => dispatch({ action: 'core', state: 'working' }, 'system'),
  },
  {
    at: 1800,
    caption: 'Applications bloom from the Core',
    run: () => {
      requestPortal(true, 'system', interaction.activationOwner());
    },
  },
  {
    at: 5200,
    caption: 'Focusing Browser',
    run: () => {
      void routeUtterance(`focus ${DEMO_APP}`, 'system');
    },
  },
  {
    at: 8800,
    caption: 'Into the Development layer',
    run: () => dispatch({ action: 'layer', direction: 'next' }, 'system'),
  },
  {
    at: 12200,
    caption: `Asking NOVA: “${DEMO_INSTRUCTION}”`,
    run: () => setIntelligenceOpen(true),
  },
  {
    at: 13600,
    caption: 'NOVA carries it out',
    run: () => {
      void converse(DEMO_INSTRUCTION, 'system');
    },
  },
  {
    at: 19000,
    caption: 'Back to the room',
    run: () => restore(),
  },
];

/** When the demo ends, after the last beat has had time to settle. */
export const DEMO_DURATION_MS = 22500;

/** Put back everything the demo changed. Safe to call more than once. */
function restore(): void {
  const before = snapshot;
  if (!before) return;
  const spatial = useSpatialStore.getState();

  // The portal folds away, but only the windows the demo brought out go back
  // into the Core; the user's own stay where they were.
  if (spatial.portal.open) dispatch({ action: 'portal', open: false }, 'system');
  for (const id of Object.keys(spatial.windows)) {
    if (!before.windows.has(id)) dispatch({ action: 'close', target: id }, 'system');
  }
  returnToLayer(before.layerIndex);
  if (before.focusedId && useSpatialStore.getState().windows[before.focusedId]) {
    dispatch({ action: 'focus', target: before.focusedId }, 'system');
  } else {
    dispatch({ action: 'blur' }, 'system');
  }
  dispatch({ action: 'core', state: 'idle' }, 'system');

  // The conversation loses only the lines the demo added.
  const intelligence = useIntelligenceStore.getState();
  useIntelligenceStore.setState({
    messages: intelligence.messages.slice(0, before.messageCount) as IntelligenceMessage[],
    recentActions: [...before.recentActions],
  });
  setIntelligenceOpen(before.intelligenceOpen);
  snapshot = null;
}

/**
 * Go back to a layer. Phase 13 deliberately ignores layer commands while a
 * transition is running, so if one is under way (the demo was cancelled
 * mid-transition) this waits for it to settle, then asks.
 */
let stopWaitingForLayer: (() => void) | null = null;
function returnToLayer(index: number): void {
  stopWaitingForLayer?.();
  stopWaitingForLayer = null;
  const go = () => {
    const { layer } = useSpatialStore.getState();
    if (layer.currentLayerIndex !== index) dispatch({ action: 'layer-go', target: index }, 'system');
  };
  if (useSpatialStore.getState().layer.phase === 'idle') {
    go();
    return;
  }
  const unsubscribe = useSpatialStore.subscribe((state) => {
    if (state.layer.phase !== 'idle') return;
    unsubscribe();
    stopWaitingForLayer = null;
    go();
  });
  stopWaitingForLayer = unsubscribe;
}

// --- running it ----------------------------------------------------------------------

/** A clock the runner schedules on. The real one is `setTimeout`; tests pass their own. */
export type DemoScheduler = (run: () => void, ms: number) => () => void;

const realScheduler: DemoScheduler = (run, ms) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

interface DemoState {
  running: boolean;
  /** Index of the beat that played last, -1 before the first. */
  beat: number;
  caption: string;
}

export const useDemoStore = create<DemoState>(() => ({ running: false, beat: -1, caption: '' }));

let cancels: Array<() => void> = [];

/** Start the showcase. Returns false if one is already running. */
export function startDemo(schedule: DemoScheduler = realScheduler): boolean {
  if (useDemoStore.getState().running) return false;
  // A new demo starts from here; a return from an earlier one is no longer wanted.
  stopWaitingForLayer?.();
  stopWaitingForLayer = null;
  snapshot = takeSnapshot();
  useDemoStore.setState({ running: true, beat: -1, caption: '' });
  cancels = DEMO_BEATS.map((beat, index) =>
    schedule(() => {
      useDemoStore.setState({ beat: index, caption: beat.caption });
      beat.run();
    }, beat.at),
  );
  cancels.push(schedule(() => finish(), DEMO_DURATION_MS));
  return true;
}

/** Stop at once — Escape, or the trigger pressed again — and put everything back. */
export function cancelDemo(): void {
  if (!useDemoStore.getState().running) return;
  finish();
}

function finish(): void {
  for (const cancel of cancels) cancel();
  cancels = [];
  restore();
  useDemoStore.setState({ running: false, beat: -1, caption: '' });
}
