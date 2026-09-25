import { create } from 'zustand';
import type { NativeSnapshot } from '../../types/native';
import { unavailableSnapshot } from '../../types/native';

/**
 * What NOVA currently believes about the computer it is running on.
 *
 * Separate from `spatialStore` on purpose, and the separation is the point of
 * Phase 8: the host's windows and NOVA's surfaces are different objects about
 * different things. Nothing in here can move a surface, and nothing in here is
 * ever read as a position.
 *
 * Updated only by an explicit refresh — never per frame, never from the render
 * loop. The initial value is an honest "nothing has been looked at yet" rather
 * than an empty snapshot that would read like an answer.
 */
interface NativeState {
  snapshot: NativeSnapshot;
  /** True while a refresh is in flight, so a second one is never started. */
  refreshing: boolean;
  lastRefreshAt: number;

  setSnapshot: (snapshot: NativeSnapshot) => void;
  setRefreshing: (refreshing: boolean) => void;
}

export const useNativeStore = create<NativeState>((set) => ({
  snapshot: unavailableSnapshot('Native awareness has not been queried yet.'),
  refreshing: false,
  lastRefreshAt: 0,

  setSnapshot: (snapshot) => set({ snapshot, lastRefreshAt: snapshot.at }),
  setRefreshing: (refreshing) => set({ refreshing }),
}));

/** Non-reactive read, for the context engine and for tests. */
export const nativeState = () => useNativeStore.getState();
