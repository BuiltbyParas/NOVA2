import type { CommandSource } from '../../types/command';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { routeUtterance } from '../command/intentRouter';
import { isPortalApp, portalUtterance } from './portalModel';

/**
 * The NOVA application portal's one way in and one way out (Phase 12).
 *
 * Every input — the pointer on the Core, a hand's air click, the keyboard, a
 * click on the portal's own controls — calls these two functions, so there is
 * exactly one portal-opening implementation, not one per device. Both end in
 * the command bus or the command router; neither touches the store directly,
 * launches anything, or knows how the portal is drawn.
 */

/**
 * The claim owner that is the portal itself.
 *
 * A hand's activation belongs to whichever surface has claimed it (see
 * `interaction.claimActivation`). While the portal is open it holds that claim;
 * while anything else holds it — the Command Deck — the portal will not open,
 * so it never takes the hand away from a surface that is using it.
 */
export const PORTAL_CLAIM = 'portal';

/**
 * Ask for the portal to be open or closed.
 *
 * `claimedBy` is who currently owns a hand's activation (null if nobody).
 * Returns whether the request was accepted.
 */
export function requestPortal(open: boolean, source: CommandSource, claimedBy: string | null): boolean {
  if (open && claimedBy && claimedBy !== PORTAL_CLAIM) return false;
  if (useSpatialStore.getState().portal.open === open) return true;
  dispatch({ action: 'portal', open }, source);
  return true;
}

/** Open the portal if it is closed, close it if it is open. */
export function togglePortal(source: CommandSource, claimedBy: string | null): boolean {
  return requestPortal(!useSpatialStore.getState().portal.open, source, claimedBy);
}

/**
 * Choose an application from the portal.
 *
 * Only an application the portal actually offers is accepted — anything else is
 * refused here, before a sentence is formed. The portal closes first (its
 * applications fold back into the Core as the window comes out of it), then the
 * choice goes out as the sentence "open <name>" through `routeUtterance`: the
 * same entry point typing, speech, the Command Deck and a gesture use, so the
 * resolver, the catalog and every safety rule downstream apply unchanged.
 * Returns whether the choice was accepted.
 */
export function selectPortalApp(id: string, source: CommandSource): boolean {
  if (!isPortalApp(id)) return false;
  if (!useSpatialStore.getState().portal.open) return false;
  requestPortal(false, source, PORTAL_CLAIM);
  void routeUtterance(portalUtterance(id), source);
  return true;
}
