import type { CommandEnvelope, CommandSource, NovaCommand } from '../../types/command';
import { resolveWindowId, useSpatialStore } from '../../state/spatialStore';
import { ENVIRONMENT } from '../../data/environment';
import { WORKSPACES, WORKSPACE_FOCUS } from '../../data/workspaces';
import { APPS } from '../../data/apps';
import { TASKS } from '../../data/tasks';
import {
  deleteMemory,
  getMemory,
  planRestore,
  recordRestore,
  saveCurrentAs,
} from '../memory/memoryManager';
import { useMemoryStore } from '../memory/memoryStore';
import {
  SUSTAINED_LISTEN,
  cancelListening,
  startListening,
  stopListening,
} from '../voice/voiceInputSource';
import { getSystemAdapter, hasNativeCapability } from '../native/systemAdapter';
import { resolveRelation } from '../workspace/layoutEngine';
import { clamp } from '../../utils/math';

/**
 * The NOVA Command Bus.
 *
 * Every state change in the system passes through `dispatch`. Pointer, keyboard
 * and the command line are producers; later, gesture recognition, speech and
 * Gemini become producers too, emitting the same `NovaCommand` values.
 *
 * Nothing upstream of this file is permitted to mutate the store or touch the
 * scene graph. That boundary is the whole reason the interaction model can be
 * re-pointed at new input devices without rewriting NOVA.
 */

type Listener = (envelope: CommandEnvelope) => void;

const listeners = new Set<Listener>();

/** Observe commands (used by the Core to acknowledge system activity). */
export function subscribeToCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const CLOSE_TRANSITION_MS = 520;

function targetIds(target: string): string[] {
  const state = useSpatialStore.getState();
  if (target === 'all') return [...state.order].filter((id) => state.windows[id]);
  const id = resolveWindowId(target);
  return id ? [id] : [];
}

function applyMove(id: string, command: Extract<NovaCommand, { action: 'move' }>) {
  const store = useSpatialStore.getState();
  const win = store.windows[id];
  if (!win) return;

  let next = { ...win.position };

  if (command.relation && command.reference) {
    const referenceId = resolveWindowId(command.reference);
    const reference = referenceId ? store.windows[referenceId] : undefined;
    if (reference) next = resolveRelation(win, command.relation, reference);
  }
  if (command.position) next = { ...next, ...command.position };
  if (command.delta) {
    next = {
      x: next.x + (command.delta.x ?? 0),
      y: next.y + (command.delta.y ?? 0),
      z: next.z + (command.delta.z ?? 0),
    };
  }

  store.setTransform(id, {
    position: {
      x: clamp(next.x, -ENVIRONMENT.bounds.x, ENVIRONMENT.bounds.x),
      y: clamp(next.y, -ENVIRONMENT.bounds.y, ENVIRONMENT.bounds.y),
      z: clamp(next.z, ENVIRONMENT.depth.back, ENVIRONMENT.depth.front),
    },
  });
}

function execute(command: NovaCommand) {
  const store = useSpatialStore.getState();

  switch (command.action) {
    case 'focus': {
      const [id] = targetIds(command.target);
      if (!id) return;
      store.setMinimized(id, false);
      store.focusWindow(id);
      store.notify(`Focused ${APPS[store.windows[id].app].name}`);
      return;
    }

    case 'blur': {
      store.focusWindow(null);
      return;
    }

    case 'open': {
      /**
       * A category opens NOVA's own surface, and nothing else.
       *
       * "browser" names one of NOVA's five spatial applications; "Chrome" names
       * a program installed on this computer. Phase 9.5A drew that line for
       * *resolution* — it is why "open Chrome" stopped launching Firefox — and
       * this is the same line drawn for *launching*.
       *
       * It used to also launch the host's idea of a browser, which put a real
       * Firefox window on top of NOVA the moment someone said "open browser",
       * and a real terminal on top of that. The spatial shell was buried by the
       * very commands meant to arrange it. A real application is still one
       * sentence away — `open Chrome`, `open Spotify` — where the user has
       * named the real thing and can expect a real window.
       */
      store.openWindow(command.target, command.reveal);
      // A bloom reveals every application at once; it is not five announcements.
      if (!command.reveal) store.notify(`Opened ${APPS[command.target].name}`, 'success');
      return;
    }

    case 'open-application': {
      // A discovered application has no spatial representation in this phase,
      // so there is nothing to open in the environment — only the real thing to
      // start. The notice is the whole of NOVA's visible response.
      const label = command.name ?? command.applicationId;
      if (!hasNativeCapability('OPEN_APPLICATION')) {
        store.notify(`I can't open ${label} — no native provider`, 'error');
        return;
      }
      // Two notices, because launching a real application genuinely has two
      // moments: NOVA accepting the instruction, and the computer obeying it.
      store.notify(`Opening ${label}…`, 'working');
      void getSystemAdapter()
        .perform({ capability: 'OPEN_APPLICATION', applicationId: command.applicationId })
        .then((result) => {
          const store2 = useSpatialStore.getState();
          if (result.ok) store2.notify(`Opened ${label}`, 'success');
          else store2.notify(result.message ?? `I couldn't open ${label}`, 'error');
        })
        .catch(() => {
          /* `perform` never rejects; this is belt and braces. */
        });
      return;
    }

    case 'close': {
      for (const id of targetIds(command.target)) {
        store.beginClose(id);
        window.setTimeout(() => {
          // Only if it is still the window that was closed: reopened meanwhile
          // (a portal bloom straight after a gather), it stays.
          if (useSpatialStore.getState().windows[id]?.lifecycle === 'closing') {
            useSpatialStore.getState().removeWindow(id);
          }
        }, CLOSE_TRANSITION_MS);
      }
      return;
    }

    case 'minimize': {
      for (const id of targetIds(command.target)) store.setMinimized(id, true);
      return;
    }

    case 'restore': {
      for (const id of targetIds(command.target)) store.setMinimized(id, false);
      return;
    }

    case 'move': {
      for (const id of targetIds(command.target)) applyMove(id, command);
      return;
    }

    case 'scale': {
      for (const id of targetIds(command.target)) {
        const win = store.windows[id];
        if (!win) continue;
        const raw = command.scale ?? win.scale + (command.delta ?? 0);
        store.setTransform(id, {
          scale: clamp(raw, ENVIRONMENT.scale.min, ENVIRONMENT.scale.max),
        });
      }
      return;
    }

    case 'rotate': {
      for (const id of targetIds(command.target)) {
        const win = store.windows[id];
        if (!win) continue;
        const next = {
          x: command.rotation?.x ?? win.rotation.x + (command.delta?.x ?? 0),
          y: command.rotation?.y ?? win.rotation.y + (command.delta?.y ?? 0),
          z: command.rotation?.z ?? win.rotation.z + (command.delta?.z ?? 0),
        };
        store.setTransform(id, {
          rotation: {
            x: clamp(next.x, -ENVIRONMENT.rotationLimit.x, ENVIRONMENT.rotationLimit.x),
            y: clamp(next.y, -ENVIRONMENT.rotationLimit.y, ENVIRONMENT.rotationLimit.y),
            z: 0,
          },
        });
      }
      return;
    }

    case 'workspace': {
      // Phase 12: a new arrangement folds the portal away; it opened over the old one.
      store.setPortal(false);
      store.applyWorkspace(command.target);
      const focusApp = WORKSPACE_FOCUS[command.target];
      store.focusWindow(focusApp ? resolveWindowId(focusApp) : null);
      store.notify(
        `${WORKSPACES[command.target].name} · ${WORKSPACES[command.target].intent}`,
        'success',
      );
      return;
    }

    case 'layer': {
      store.navigateLayer(command.direction);
      return;
    }

    case 'layer-go': {
      store.goToLayer(command.target);
      return;
    }

    case 'task': {
      store.setTask(command.target);
      if (command.target && TASKS[command.target]) {
        store.notify(`Context · ${TASKS[command.target].name}`);
      }
      return;
    }

    case 'arrange': {
      store.applyWorkspace(store.workspace);
      store.notify(`Arranged ${WORKSPACES[store.workspace].name}`, 'success');
      return;
    }

    case 'core': {
      store.setCoreState(command.state);
      return;
    }

    case 'command': {
      store.setCommandOpen(command.open);
      store.setCoreState(command.open ? 'listening' : 'idle');
      return;
    }

    case 'portal': {
      // The portal only changes its own intent; what it reveals is derived.
      store.setPortal(command.open);
      return;
    }

    case 'vision': {
      const target = command.active !== undefined ? command.active : !store.visionActive;
      store.setVisionActive(target);
      // Spoken in the same voice as every other acknowledgement, and as the
      // driver's own outcome message that follows it.
      store.notify(target ? 'Starting the camera…' : 'Hand tracking off', target ? 'working' : 'info');
      return;
    }

    case 'voice-input': {
      // Explicit activation only: nothing in NOVA calls this on startup, so the
      // microphone permission prompt can only ever follow a deliberate action.
      // Sustained rather than single-shot: the engine ends its own session
      // after a second of silence, and a person who has just pressed the key
      // has usually not started talking yet.
      if (command.mode === 'start') startListening(SUSTAINED_LISTEN);
      else if (command.mode === 'stop') stopListening();
      else cancelListening();
      return;
    }

    case 'vision-debug': {
      store.toggleVisionDebug(command.open);
      return;
    }

    case 'context-debug': {
      store.toggleContextDebug(command.open);
      return;
    }

    case 'memory-save': {
      const memory = saveCurrentAs(command.name);
      store.notify(
        memory ? `Remembered ${memory.name}` : 'A memory needs a name.',
        memory ? 'success' : 'error',
      );
      return;
    }

    case 'memory-restore': {
      const memory = getMemory(command.id);
      if (!memory) {
        store.notify('That memory is no longer stored.', 'error');
        return;
      }
      // The plan is built here and run here, through this same bus. A restore
      // is not a privileged operation — it is the commands a person would have
      // issued to rebuild the arrangement by hand, in a deterministic order.
      const plan = planRestore(memory, new Set(Object.keys(store.windows)));
      for (const step of plan.commands) dispatch(step, 'system');
      store.notify(recordRestore(plan).message, 'success');
      return;
    }

    case 'memory-delete': {
      const memory = getMemory(command.id);
      const removed = deleteMemory(command.id);
      store.notify(
        removed && memory ? `Forgot ${memory.name}` : 'There was nothing to forget.',
        removed && memory ? 'success' : 'error',
      );
      return;
    }

    case 'memory-list': {
      useMemoryStore.getState().setInspectorOpen(command.open);
      return;
    }
  }
}

export function dispatch(command: NovaCommand, source: CommandSource = 'system') {
  execute(command);
  const envelope: CommandEnvelope = { command, source, at: performance.now() };
  for (const listener of listeners) listener(envelope);
}
