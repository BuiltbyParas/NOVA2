import { create } from 'zustand';
import type { MemorySummary, RestoreReport } from '../../types/memory';

/**
 * Memory metadata, for the parts of the interface that need to re-render.
 *
 * Deliberately separate from `spatialStore`: a memory is not spatial state, and
 * putting it there would make the source of truth for "where things are" also
 * responsible for "what we have saved". This store holds summaries only — never
 * the arrangements themselves, which stay in the repository until asked for.
 *
 * It is refreshed on explicit memory operations, never on a timer.
 */
interface MemoryState {
  summaries: MemorySummary[];
  /** The outcome of the last restore, including anything that was unavailable. */
  lastReport: RestoreReport | null;
  /** Developer memory inspector. Never shown in a production build. */
  inspectorOpen: boolean;

  setSummaries: (summaries: MemorySummary[]) => void;
  setLastReport: (report: RestoreReport | null) => void;
  setInspectorOpen: (open?: boolean) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  summaries: [],
  lastReport: null,
  inspectorOpen: false,

  setSummaries: (summaries) => set({ summaries }),
  setLastReport: (lastReport) => set({ lastReport }),
  setInspectorOpen: (open) =>
    set((state) => ({ inspectorOpen: open !== undefined ? open : !state.inspectorOpen })),
}));
