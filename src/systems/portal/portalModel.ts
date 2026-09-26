import type { AppType } from '../../types/window';
import type { PortalPhase, PortalState } from '../../types/portal';
import { APP_ORDER, APPS } from '../../data/apps';

/**
 * The NOVA application portal, as pure functions (Phase 12).
 *
 * The portal does not draw applications of its own. Opening it asks NOVA's
 * ordinary window system for each application — real spatial windows, which
 * then drag, resize, take a pinch and close like any other — and only decides
 * the *presentation* of that moment: when each window leaves the Core, and how
 * the Core itself gathers and releases the bloom. Nothing here touches the
 * store, the clock, the DOM or three.js.
 */

/** The Core gathers itself for this long before the first window leaves. */
export const PORTAL_CHARGE_MS = 200;
/** Each successive window leaves this much later than the one before. */
export const PORTAL_STAGGER_MS = 110;
/** From the first spark to the last window settled (its entry is 780 ms). */
export const PORTAL_OPEN_MS = 1450;
/** Windows fold back into the Core in their close transition (520 ms). */
export const PORTAL_CLOSE_MS = 520;

export const PORTAL_CLOSED: PortalState = { open: false, at: -Infinity, from: 0 };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * How far open the portal is, 0 (closed) .. 1 (fully open), linear in time.
 *
 * Opening runs from wherever it was (`from`) up to 1; closing from `from` down
 * to 0 — so a reversal mid-bloom is continuous.
 */
export function portalProgress(portal: PortalState, now: number): number {
  const elapsed = Math.max(0, now - portal.at);
  if (portal.open) {
    const span = (1 - portal.from) * PORTAL_OPEN_MS;
    return span <= 0 ? 1 : clamp01(portal.from + (elapsed / span) * (1 - portal.from));
  }
  const span = portal.from * PORTAL_CLOSE_MS;
  return span <= 0 ? 0 : clamp01(portal.from * (1 - elapsed / span));
}

export function portalPhase(portal: PortalState, now: number): PortalPhase {
  const progress = portalProgress(portal, now);
  if (portal.open) return progress >= 1 ? 'open' : 'opening';
  return progress <= 0 ? 'closed' : 'closing';
}

/** The state after the intent changes to `open` at `now`. A repeated intent changes nothing. */
export function nextPortalState(portal: PortalState, open: boolean, now: number): PortalState {
  if (portal.open === open) return portal;
  return { open, at: now, from: portalProgress(portal, now) };
}

/**
 * What the portal reveals: NOVA's own application catalog, in its own order.
 * Not a second list — `APP_ORDER`/`APPS` is where NOVA's applications are defined.
 */
export function portalApps(): readonly AppType[] {
  return APP_ORDER;
}

export function isPortalApp(id: string): id is AppType {
  return (APP_ORDER as readonly string[]).includes(id) && id in APPS;
}

/**
 * When the `index`-th application of a bloom leaves the Core, in ms after the
 * portal opens. One bloom, one clock: the first straight after the Core has
 * gathered itself, each next a beat later.
 */
export function portalRevealDelay(index: number): number {
  return PORTAL_CHARGE_MS + index * PORTAL_STAGGER_MS;
}

/** How brightly the Core gathers and releases the bloom, 0..1, at portal progress `p`. */
export function portalCharge(progress: number, opening: boolean): number {
  if (!opening) return progress * 0.35;
  const charge = PORTAL_CHARGE_MS / PORTAL_OPEN_MS;
  if (progress < charge) return progress / charge;
  return 0.35 + 0.65 * Math.exp(-(progress - charge) * 6);
}
