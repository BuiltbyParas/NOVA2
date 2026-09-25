import { useEffect } from 'react';
import { dispatch } from '../command/commandBus';
import { useSpatialStore } from '../../state/spatialStore';
import { APP_ORDER } from '../../data/apps';
import { WORKSPACE_ORDER } from '../../data/workspaces';
import { voice } from '../voice/voiceStore';

/**
 * Keyboard as a command producer.
 *
 * Every binding emits the same `NovaCommand` values the pointer emits. The
 * keyboard is a first-class way to operate NOVA, not a shortcut layer bolted on
 * top — which is also why the spatial interface stays usable with no pointer at all.
 */
export function useKeyboardCommands() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useSpatialStore.getState();
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' || event.target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatch({ action: 'command', open: !state.commandOpen }, 'keyboard');
        return;
      }

      if (typing) return;

      if (event.key === 'Escape') {
        // Cancelling a live recognition comes first: the transcript is discarded
        // and nothing is executed.
        const speaking = voice().state;
        if (speaking === 'starting' || speaking === 'listening' || speaking === 'processing') {
          dispatch({ action: 'voice-input', mode: 'cancel' }, 'keyboard');
          return;
        }
        if (state.commandOpen) dispatch({ action: 'command', open: false }, 'keyboard');
        else dispatch({ action: 'blur' }, 'keyboard');
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        dispatch({ action: 'command', open: true }, 'keyboard');
        return;
      }

      // Number keys address applications directly.
      const index = Number.parseInt(event.key, 10) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < APP_ORDER.length) {
        dispatch({ action: 'focus', target: APP_ORDER[index] }, 'keyboard');
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const visible = state.order.filter((id) => !state.windows[id]?.minimized);
        if (!visible.length) return;
        const current = state.focusedId ? visible.indexOf(state.focusedId) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next = visible[(current + step + visible.length) % visible.length];
        dispatch({ action: 'focus', target: next }, 'keyboard');
        return;
      }

      if (event.key === '[' || event.key === ']') {
        const step = event.key === ']' ? 1 : -1;
        const current = WORKSPACE_ORDER.indexOf(state.workspace);
        const next =
          WORKSPACE_ORDER[(current + step + WORKSPACE_ORDER.length) % WORKSPACE_ORDER.length];
        dispatch({ action: 'workspace', target: next }, 'keyboard');
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'm' && state.focusedId) {
        dispatch({ action: 'minimize', target: state.focusedId }, 'keyboard');
        return;
      }
      if (key === 'x' && state.focusedId) {
        dispatch({ action: 'close', target: state.focusedId }, 'keyboard');
        return;
      }
      if (key === 'a') {
        dispatch({ action: 'arrange' }, 'keyboard');
        return;
      }
      if (key === 'v') {
        dispatch({ action: 'vision' }, 'keyboard');
        return;
      }
      if (key === 's') {
        // A keypress is explicit activation, so this may request the microphone.
        // "Starting" counts as speaking: pressing S again while a permission
        // prompt is open must cancel the attempt, not silently do nothing.
        const heard = voice().state;
        const speaking = heard === 'listening' || heard === 'starting';
        dispatch({ action: 'voice-input', mode: speaking ? 'stop' : 'start' }, 'keyboard');
        return;
      }
      if (key === 'p') {
        // Presentation mode is one flag, so its control is one key.
        useSpatialStore.getState().setPresentation(!state.presentation);
        return;
      }
      if (key === 'd') {
        dispatch({ action: 'vision-debug' }, 'keyboard');
        return;
      }
      if (key === 'c' && import.meta.env.DEV) {
        dispatch({ action: 'context-debug' }, 'keyboard');
        return;
      }

      if (!state.focusedId) return;
      const target = state.focusedId;

      if (key === '+' || key === '=') {
        dispatch({ action: 'scale', target, delta: 0.08 }, 'keyboard');
        return;
      }
      if (key === '-' || key === '_') {
        dispatch({ action: 'scale', target, delta: -0.08 }, 'keyboard');
        return;
      }

      const nudge = event.shiftKey ? 0.34 : 0.14;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          dispatch({ action: 'move', target, delta: { x: -nudge } }, 'keyboard');
          break;
        case 'ArrowRight':
          event.preventDefault();
          dispatch({ action: 'move', target, delta: { x: nudge } }, 'keyboard');
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (event.altKey) dispatch({ action: 'move', target, delta: { z: nudge } }, 'keyboard');
          else dispatch({ action: 'move', target, delta: { y: nudge } }, 'keyboard');
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (event.altKey) dispatch({ action: 'move', target, delta: { z: -nudge } }, 'keyboard');
          else dispatch({ action: 'move', target, delta: { y: -nudge } }, 'keyboard');
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
