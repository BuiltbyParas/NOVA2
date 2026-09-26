import type { PortalPhase } from '../../types/portal';

/**
 * Where the portal and its applications are on screen, this frame (Phase 12).
 *
 * Written once per frame by `PortalDriver` inside the scene (which has the
 * camera) and read by `PortalLayer` outside it (which draws the accessible
 * controls). A plain mutable object like `cursor` and `spatialCoreScreen`:
 * following it costs no React renders, and the arrays are allocated once.
 */
export interface PortalItemScreen {
  x: number;
  y: number;
  /** Size relative to the item's designed size, including perspective. */
  scale: number;
  opacity: number;
  /** 0 at the Core .. 1 settled. */
  travel: number;
  /** Distance from the camera, for ordering nearer items above farther ones. */
  depth: number;
}

export const MAX_PORTAL_ITEMS = 16;

export const portalScreen = {
  phase: 'closed' as PortalPhase,
  /** 0..1, how far open. */
  progress: 0,
  /** How brightly the Core is gathering / releasing the bloom, 0..1. */
  charge: 0,
  /** The Core on screen: the origin of every flight. */
  originX: 0,
  originY: 0,
  count: 0,
  items: Array.from({ length: MAX_PORTAL_ITEMS }, (): PortalItemScreen => ({
    x: 0,
    y: 0,
    scale: 0,
    opacity: 0,
    travel: 0,
    depth: 0,
  })),
};
