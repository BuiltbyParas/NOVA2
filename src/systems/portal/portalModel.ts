import type { AppType } from '../../types/window';
import type { PortalPhase, PortalState } from '../../types/portal';
import type { SpatialPosition } from '../../types/spatial';
import { APP_ORDER, APPS } from '../../data/apps';

/**
 * The NOVA application portal, as pure functions (Phase 12).
 *
 * Nothing here touches the store, the clock, the DOM or three.js: given the
 * portal's state and a time, it says which phase the portal is in, how far each
 * application has travelled out of it, and where that application sits in the
 * space around the Core. The renderer, the interaction layer and the tests all
 * read the same answers, which is what keeps them from drifting apart.
 */

/** How long the bloom takes from the first spark to the last application settling. */
export const PORTAL_OPEN_MS = 1050;
/** How long the applications take to fold back into the Core. */
export const PORTAL_CLOSE_MS = 480;

export const PORTAL_CLOSED: PortalState = { open: false, at: -Infinity, from: 0 };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * How far open the portal is, 0 (closed) .. 1 (fully open), linear in time.
 *
 * Opening runs from wherever it was (`from`) up to 1; closing from `from` down
 * to 0, each at its own speed — so a reversal mid-bloom is continuous.
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

// --- The applications ------------------------------------------------------------

/**
 * What the portal reveals: NOVA's own application catalog, in its own order.
 *
 * Not a second list — `APP_ORDER`/`APPS` is where NOVA's applications are
 * defined, and the same names are what "open <name>" resolves through
 * `genericAppFor` to the spatial application.
 */
export function portalApps(): readonly AppType[] {
  return APP_ORDER;
}

export function isPortalApp(id: string): id is AppType {
  return (APP_ORDER as readonly string[]).includes(id) && id in APPS;
}

/** The sentence selecting an application produces — exactly what typing or speech would. */
export function portalUtterance(app: AppType): string {
  return `open ${APPS[app].name.toLowerCase()}`;
}

// --- Where each application settles ------------------------------------------------

/**
 * The resting seat of the `index`-th of `count` applications, relative to the Core.
 *
 * Seats lie on an arc that opens *upwards* from the Core, alternating out from
 * the top: the first application directly above, then left, right, lower left,
 * lower right… so the arrangement grows symmetrically for any catalog size.
 * Higher seats sit further back and lower ones nearer the viewer, so the
 * applications occupy depth, not one flat plane.
 *
 * `depth` is an extra offset away from the viewer (world units, default 0).
 * Phase 12 always uses 0 — every application is in the foreground. It exists so
 * that a later phase can seat further applications behind these, on the same
 * arc, without this geometry changing.
 */
export function portalSeat(index: number, count: number, depth = 0): SpatialPosition {
  const step = count > 1 ? Math.min(48, 200 / (count - 1)) : 0;
  const ring = Math.ceil(index / 2);
  const side = index === 0 ? 0 : index % 2 === 1 ? 1 : -1;
  const angle = ((90 + side * step * ring) * Math.PI) / 180;
  return {
    x: Math.cos(angle) * SEAT_RADIUS.x,
    y: SEAT_CENTRE_Y + Math.sin(angle) * SEAT_RADIUS.y,
    z: -Math.sin(angle) * SEAT_RECEDE - depth,
  };
}

/** The arc's size: wide, and shallow enough to stay clear of the status panel. */
const SEAT_RADIUS = { x: 1.9, y: 1.4 };
const SEAT_CENTRE_Y = 0.95;
const SEAT_RECEDE = 0.45;

// --- How each application travels ------------------------------------------------------

/** How much of the bloom each successive application waits before leaving the Core. */
const STAGGER = 0.06;
/** The first part of the bloom is the Core gathering itself; nothing leaves yet. */
const CHARGE = 0.2;

/** One application's pose along its flight: where it is, how large, how visible. */
export interface PortalPose {
  x: number;
  y: number;
  z: number;
  /** 0..1 of its final size. */
  scale: number;
  opacity: number;
  /** 0 at the Core .. 1 settled. */
  travel: number;
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The pose of an application under reduced motion: already at its seat, only
 * fading in and out with the portal. No flight, no swell.
 */
export function portalStillPose(progress: number, index: number, count: number, out: PortalPose, depth = 0): PortalPose {
  const seat = portalSeat(index, count, depth);
  out.x = seat.x;
  out.y = seat.y;
  out.z = seat.z;
  out.scale = 1;
  out.opacity = clamp01(progress);
  out.travel = 1;
  return out;
}

/**
 * How far along its flight the `index`-th application is at portal progress `p`.
 *
 * One bloom, one clock: every application is a function of the same progress,
 * offset by a stagger, so the reveal is a single coordinated event rather than
 * five entrance animations. On the way back the same function runs in reverse,
 * so the last out is the first home.
 */
export function portalTravel(progress: number, index: number, count: number): number {
  const lastDelay = CHARGE + STAGGER * Math.max(0, count - 1);
  return clamp01((progress - CHARGE - STAGGER * index) / (1 - lastDelay));
}

/**
 * The pose of an application at portal progress `p`, written into `out`.
 *
 * Each flies from the heart of the Core out to its seat along a curve that
 * swings towards the viewer and then settles back — the applications are
 * *brought forward* out of the space, not slid across it — growing from a
 * compressed point to full size. `opening` chooses the easing: expansive on the
 * way out, gathered on the way back.
 */
export function portalPose(
  progress: number,
  index: number,
  count: number,
  opening: boolean,
  out: PortalPose,
  depth = 0,
): PortalPose {
  const seat = portalSeat(index, count, depth);
  const raw = portalTravel(progress, index, count);
  const t = opening ? easeOutExpo(raw) : easeInOutCubic(raw);
  // A quadratic curve from the Core (the origin, so its term vanishes) through
  // a control point pushed out and towards the viewer, to the seat.
  const cx = seat.x * 0.35;
  const cy = seat.y * 0.75 + 0.35;
  const cz = seat.z + 1.1;
  const b = 2 * (1 - t) * t;
  const c = t * t;
  out.x = b * cx + c * seat.x;
  out.y = b * cy + c * seat.y;
  out.z = b * cz + c * seat.z;
  // A small swell as it arrives, settling to exactly its size.
  out.scale = 0.1 + 0.9 * t + (opening ? 0.035 * Math.sin(Math.PI * raw) * raw : 0);
  out.opacity = clamp01(raw * 3.2);
  out.travel = raw;
  return out;
}

/** How brightly the Core gathers and releases the bloom, 0..1, at portal progress `p`. */
export function portalCharge(progress: number, opening: boolean): number {
  if (!opening) return progress * 0.35;
  // Rises through the charge, peaks as the first application leaves, then settles to a glow.
  if (progress < CHARGE) return progress / CHARGE;
  return 0.35 + 0.65 * Math.exp(-(progress - CHARGE) * 6);
}
