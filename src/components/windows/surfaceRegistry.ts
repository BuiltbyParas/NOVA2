import type { AppType } from '../../types/window';

/**
 * Bridge between the scene and the DOM tree.
 *
 * A window's surface element is created inside the 3D scene but must be rendered
 * by React from outside it: inside a React Three Fiber tree the reconciler expects
 * scene objects, not HTML. Windows register their element here and a layer in the
 * ordinary DOM tree portals the surface into it.
 */
export interface SurfaceEntry {
  id: string;
  element: HTMLElement;
  app: AppType;
  title: string;
}

const entries = new Map<string, SurfaceEntry>();
const listeners = new Set<() => void>();
let snapshot: SurfaceEntry[] = [];

function publish() {
  snapshot = [...entries.values()];
  for (const listener of listeners) listener();
}

export function registerSurface(entry: SurfaceEntry) {
  entries.set(entry.id, entry);
  publish();
}

export function unregisterSurface(id: string) {
  if (entries.delete(id)) publish();
}

export function subscribeToSurfaces(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function surfaceSnapshot() {
  return snapshot;
}
