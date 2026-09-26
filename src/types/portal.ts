/**
 * The NOVA application portal's state (Phase 12).
 *
 * Deliberately tiny: whether the portal is meant to be open, when that last
 * changed, and how far open it was at that moment. Everything else — the four
 * phases, how far each application has travelled, where it is on screen — is
 * *derived* from these three numbers and the clock, so there are no timers to
 * fall out of step and no animation state to leak into the store.
 */
export interface PortalState {
  /** The intent: open or closed. */
  open: boolean;
  /** When the intent last changed (performance.now()). */
  at: number;
  /**
   * How far open the portal was when the intent changed, 0..1. A portal closed
   * half-way through blooming folds back from where it is instead of snapping.
   */
  from: number;
}

/** The four phases a portal is ever in. */
export type PortalPhase = 'closed' | 'opening' | 'open' | 'closing';
