import { useEffect } from 'react';
import { subscribeToCommands } from '../command/commandBus';
import { clearInteractionContext, modalityOfSource, noteSelection } from './interactionContext';

/**
 * Feeding the multimodal context from what NOVA is already doing.
 *
 * Every deliberate act on a window is already a command, and every command
 * envelope already says which device produced it. So selection needs no new
 * instrumentation anywhere — one subscription reads what the bus is saying and
 * records it as a referent.
 *
 * This is the whole of Phase 7's runtime cost: a map write on the commands that
 * act on a window, and nothing at all per frame.
 */

/** Commands that constitute acting on a window, rather than merely mentioning one. */
const DELIBERATE = new Set(['focus', 'move', 'scale', 'rotate', 'minimize', 'restore', 'open']);

export function startMultimodalContext(): () => void {
  return subscribeToCommands(({ command, source }) => {
    if (!DELIBERATE.has(command.action)) return;
    const target = (command as { target?: unknown }).target;
    if (typeof target !== 'string' || target === 'all') return;

    const modality = modalityOfSource(source);
    // A sentence is not a way of pointing. Voice and text name what they mean,
    // and letting them also set the referent would let "move the browser" make
    // the browser the answer to the next "this" — a feedback loop, not context.
    if (modality === 'voice' || modality === 'text' || modality === 'system') return;

    noteSelection(modality, target);
  });
}

export function useMultimodalContext() {
  useEffect(() => {
    const stop = startMultimodalContext();
    return () => {
      stop();
      clearInteractionContext();
    };
  }, []);
}
