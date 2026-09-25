import type { SpatialLayer } from '../types/layer';

/**
 * Deterministic spatial application layer configuration.
 *
 * Each layer references authoritative application identifiers from the existing APPS catalog.
 * Layer 0: Home / General productivity (browser, files, notes)
 * Layer 1: Development (code, terminal)
 * Layer 2: Study / Reference (notes, browser, files)
 */
export const DEFAULT_LAYERS: SpatialLayer[] = [
  {
    id: 'home',
    name: 'Home',
    order: 0,
    applications: ['browser', 'files', 'notes'],
  },
  {
    id: 'development',
    name: 'Development',
    order: 1,
    applications: ['code', 'terminal'],
  },
  {
    id: 'study',
    name: 'Study',
    order: 2,
    applications: ['notes', 'browser'],
  },
];

export const LAYER_ORDER = DEFAULT_LAYERS.map((layer) => layer.id);

/**
 * Returns which layer an application deterministically belongs to.
 * Defaults to layer 0 (Home) if not specifically assigned.
 */
export function layerForApp(app: string): number {
  const index = DEFAULT_LAYERS.findIndex((layer) => layer.applications.includes(app as any));
  return index >= 0 ? index : 0;
}
