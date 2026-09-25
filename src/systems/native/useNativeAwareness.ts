import { useEffect } from 'react';
import type { NativeSnapshot } from '../../types/native';
import { fetchNativeSnapshot } from './nativeBridge';
import { useNativeStore } from './nativeStore';
import { BRIDGE_SYSTEM_ADAPTER, NO_SYSTEM_ADAPTER, setSystemAdapter } from './systemAdapter';

/**
 * When NOVA looks at the computer.
 *
 * Explicitly, and on a timer measured in seconds — never from the render loop.
 * That separation is not a style preference: native I/O means reading a hundred
 * small files, and doing that anywhere near `useFrame` would put filesystem
 * latency inside a 16-millisecond budget on hardware that has none to spare.
 *
 * The spatial renderer never calls anything in this file. It does not know the
 * file exists.
 */

/**
 * How often to look again.
 *
 * Applications open and close on a human timescale, so thirty seconds is
 * frequent enough to stay roughly true and rare enough to be invisible. There
 * is no fast path and no way to ask for one.
 */
const REFRESH_INTERVAL_MS = 30_000;

/** Guards against overlapping requests, including across component remounts. */
let inFlight: Promise<NativeSnapshot> | null = null;

/**
 * Take one reading of the host.
 *
 * Safe to call at any time and from anywhere outside a render path. Concurrent
 * callers share the request in flight rather than starting a second one, so a
 * slow provider cannot accumulate a queue of pending scans.
 */
export function refreshNativeSnapshot(): Promise<NativeSnapshot> {
  if (inFlight) return inFlight;

  const store = useNativeStore.getState();
  store.setRefreshing(true);

  inFlight = fetchNativeSnapshot()
    .then((snapshot) => {
      const current = useNativeStore.getState();
      current.setSnapshot(snapshot);
      // The adapter follows what was actually seen: a provider that stops
      // answering makes NOVA report itself unaware again, rather than leaving a
      // stale adapter claiming a connection it no longer has.
      setSystemAdapter(snapshot.status === 'ok' ? BRIDGE_SYSTEM_ADAPTER : NO_SYSTEM_ADAPTER);
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
      useNativeStore.getState().setRefreshing(false);
    });

  return inFlight;
}

/**
 * Attach native awareness to the running application.
 *
 * One reading at startup, then one every thirty seconds while the tab is
 * visible. A backgrounded tab stops looking entirely — nobody is reading the
 * inspector, and a hidden page has no business scanning a filesystem.
 *
 * If no provider is reachable, every reading resolves to an `unavailable`
 * snapshot and NOVA carries on exactly as it did in Phase 7.
 */
export function useNativeAwareness() {
  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshNativeSnapshot();
    };

    void refreshNativeSnapshot();
    timer = window.setInterval(tick, REFRESH_INTERVAL_MS);

    // Look again on returning to the tab, so a snapshot taken before a long
    // absence is not the first thing shown on coming back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      setSystemAdapter(NO_SYSTEM_ADAPTER);
    };
  }, []);
}
