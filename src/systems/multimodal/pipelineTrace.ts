import { create } from 'zustand';
import type { NovaCommand } from '../../types/command';
import type { PipelineTrace } from '../../types/multimodal';

/**
 * A record of how instructions travelled through NOVA.
 *
 * Purely an instrument. Nothing reads a trace to decide anything — it exists so
 * that the path an instruction took can be read while building: which device
 * supplied the referent, what the words were, what they resolved to, which
 * commands reached the bus, and what happened.
 *
 * Bounded on purpose. Keeping a long history would make this a log, and a log
 * of what the user did is the sort of thing that quietly becomes a feature.
 */
const LIMIT = 6;

interface TraceState {
  traces: PipelineTrace[];
  record: (trace: PipelineTrace) => void;
  clear: () => void;
}

export const useTraceStore = create<TraceState>((set) => ({
  traces: [],
  record: (trace) => set((state) => ({ traces: [trace, ...state.traces].slice(0, LIMIT) })),
  clear: () => set({ traces: [] }),
}));

export function recordTrace(trace: PipelineTrace) {
  useTraceStore.getState().record(trace);
}

/** A command in the shorthand the inspector shows: `MOVE(browser, left_of, code)`. */
export function describeCommand(command: NovaCommand): string {
  const parts: string[] = [];
  if ('target' in command && typeof command.target === 'string') parts.push(command.target);

  switch (command.action) {
    case 'move':
      if (command.relation) parts.push(command.relation);
      if (command.reference) parts.push(String(command.reference));
      if (command.position) parts.push(`→(${Object.values(command.position).map(Number).join(',')})`);
      if (command.delta) parts.push(`Δ(${Object.values(command.delta).map(Number).join(',')})`);
      break;
    case 'scale':
      if (command.scale !== undefined) parts.push(command.scale.toFixed(2));
      if (command.delta !== undefined) parts.push(`Δ${command.delta}`);
      break;
    case 'memory-save':
      parts.push(command.name);
      break;
    case 'memory-restore':
    case 'memory-delete':
      parts.push(command.id);
      break;
    default:
      break;
  }

  return `${command.action.toUpperCase()}(${parts.join(', ')})`;
}
