import type { CommandSource } from '../../types/command';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { portalApps, portalRevealDelay } from './portalModel';

/**
 * The NOVA application portal's one way in and one way out (Phase 12).
 *
 * Every input — the pointer on the Core, a hand's air click, the keyboard, the
 * demo — calls these functions, so there is exactly one implementation. They
 * speak only to the command bus:
 *
 *   opening  the portal's intent, then an ordinary `open` for every
 *            application not already out, each marked as revealed so it leaves
 *            the Core in turn. What comes out are NOVA's real spatial windows.
 *   closing  the portal's intent, then an ordinary `close` for every window,
 *            which folds each back into the Core.
 *
 * The portal owns the moment, never the windows: once out, they are dragged,
 * resized, pinched, focused, minimised and closed by the systems that always
 * did that.
 */

/**
 * The claim owner that is the portal itself. While another surface holds a
 * hand's activation (the Command Deck), the portal will not open.
 */
export const PORTAL_CLAIM = 'portal';

/** Windows that are out in the room (not already folding away). */
function liveWindows(): string[] {
  return Object.values(useSpatialStore.getState().windows)
    .filter((win) => win.lifecycle !== 'closing')
    .map((win) => win.id);
}

/**
 * Bring NOVA's applications out of the Core, or gather them back in.
 *
 * `claimedBy` is who currently owns a hand's activation (null if nobody).
 * Returns whether the request was accepted.
 */
export function requestPortal(open: boolean, source: CommandSource, claimedBy: string | null): boolean {
  if (open && claimedBy && claimedBy !== PORTAL_CLAIM) return false;

  if (open) {
    if (!useSpatialStore.getState().portal.open) dispatch({ action: 'portal', open: true }, source);
    const out = new Set(liveWindows());
    portalApps().forEach((app, index) => {
      if (!out.has(app)) dispatch({ action: 'open', target: app, reveal: { delayMs: portalRevealDelay(index) } }, source);
    });
    return true;
  }

  if (useSpatialStore.getState().portal.open) dispatch({ action: 'portal', open: false }, source);
  for (const id of liveWindows()) dispatch({ action: 'close', target: id }, source);
  return true;
}

/**
 * The Core, pressed: if applications are out, gather them in; otherwise bring
 * them out. Decided by what is actually in the room, so it is always right —
 * whether the windows came from the portal, a command, speech or a gesture.
 */
export function togglePortal(source: CommandSource, claimedBy: string | null): boolean {
  return requestPortal(liveWindows().length === 0, source, claimedBy);
}
