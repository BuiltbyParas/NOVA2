import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { spatial } from '../../state/spatialStore';
import { prefersReducedMotion } from '../../systems/environment/ambience';
import { portalCharge, portalPhase, portalProgress } from '../../systems/portal/portalModel';
import { portalScreen } from '../../systems/portal/portalScreen';

/**
 * The NOVA portal's moment, in the scene (Phase 12).
 *
 * The applications themselves are real spatial windows and move by their own
 * presentation; this only derives the portal's phase and the Core's charge each
 * frame, and where the Core is on screen, for the halo and the glow.
 * Arithmetic only: no allocation, no React state, no I/O.
 */
export function PortalDriver() {
  useFrame(({ camera, size }) => {
    const store = spatial();
    const now = performance.now();
    const portal = store.portal;
    const progress = portalProgress(portal, now);
    portalScreen.phase = portalPhase(portal, now);
    portalScreen.progress = progress;
    portalScreen.charge = prefersReducedMotion() ? 0 : portalCharge(progress, portal.open);
    const core = store.core.position;
    const p = world.set(core.x, core.y, core.z).project(camera);
    portalScreen.originX = ((p.x + 1) / 2) * size.width;
    portalScreen.originY = ((1 - p.y) / 2) * size.height;
  });
  return null;
}

/** Reused by the frame loop; never reallocated. */
const world = new Vector3();
