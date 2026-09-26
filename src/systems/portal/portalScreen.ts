import type { PortalPhase } from '../../types/portal';

/**
 * The portal's moment, this frame (Phase 12): its phase, progress, the Core's
 * charge and where the Core is on screen. Written once per frame by
 * `PortalDriver` (which has the camera), read by the Core's halo and the glow
 * in `PortalLayer`. A plain mutable object like `cursor`: no React renders.
 */
export const portalScreen = {
  phase: 'closed' as PortalPhase,
  /** 0..1, how far open. */
  progress: 0,
  /** How brightly the Core is gathering / releasing the bloom, 0..1. */
  charge: 0,
  /** The Core on screen. */
  originX: 0,
  originY: 0,
};
