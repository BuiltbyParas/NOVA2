import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { spatial } from '../../state/spatialStore';
import { prefersReducedMotion } from '../../systems/environment/ambience';
import {
  portalApps,
  portalCharge,
  portalPhase,
  portalPose,
  portalProgress,
  portalStillPose,
  type PortalPose,
} from '../../systems/portal/portalModel';
import { MAX_PORTAL_ITEMS, portalScreen } from '../../systems/portal/portalScreen';

/**
 * The NOVA portal's motion, in the scene (Phase 12).
 *
 * Each frame: read the portal's state, derive how far open it is, fly every
 * application along its path out of the Core in world space, and project the
 * result onto the screen for `PortalLayer`. Because the flight is computed in
 * 3D and projected through the real camera, the applications take the scene's
 * perspective and parallax — they are *in* the room, at different depths, not
 * a flat overlay sliding about.
 *
 * Arithmetic only: no allocation, no React state, no I/O. Under reduced motion
 * the applications fade in and out at their seats, with no flight.
 */
export function PortalDriver() {
  useFrame(({ camera, size }) => {
    const store = spatial();
    const now = performance.now();
    const still = prefersReducedMotion();
    const portal = store.portal;
    // Under reduced motion the portal still fades (nothing travels), so the
    // same clock applies; only the flight is removed.
    const progress = portalProgress(portal, now);
    const phase = portalPhase(portal, now);
    const opening = portal.open;

    const apps = portalApps();
    const count = Math.min(apps.length, MAX_PORTAL_ITEMS);
    const core = store.core.position;

    portalScreen.phase = phase;
    portalScreen.progress = progress;
    portalScreen.charge = still ? 0 : portalCharge(progress, opening);
    portalScreen.count = phase === 'closed' ? 0 : count;

    project(core.x, core.y, core.z, camera, size);
    portalScreen.originX = projected.x;
    portalScreen.originY = projected.y;
    const coreDistance = Math.max(0.1, camera.position.distanceTo(world.set(core.x, core.y, core.z)));

    if (phase === 'closed') return;
    for (let i = 0; i < count; i++) {
      if (still) portalStillPose(progress, i, count, pose);
      else portalPose(progress, i, count, opening, pose);
      const x = core.x + pose.x;
      const y = core.y + pose.y;
      const z = core.z + pose.z;
      project(x, y, z, camera, size);
      const distance = Math.max(0.1, camera.position.distanceTo(world.set(x, y, z)));
      const item = portalScreen.items[i];
      item.x = projected.x;
      item.y = projected.y;
      item.depth = distance;
      // Perspective: nearer is larger, relative to an item at the Core's distance.
      item.scale = pose.scale * (coreDistance / distance);
      item.opacity = pose.opacity;
      item.travel = pose.travel;
    }
  });
  return null;
}

/** Project a world point to CSS pixels, into `projected`. Reuses one vector. */
function project(
  x: number,
  y: number,
  z: number,
  camera: Parameters<Parameters<typeof useFrame>[0]>[0]['camera'],
  size: { width: number; height: number },
) {
  const p = world.set(x, y, z).project(camera);
  projected.x = ((p.x + 1) / 2) * size.width;
  projected.y = ((1 - p.y) / 2) * size.height;
}

/** Reused by the frame loop; never reallocated. */
const world = new Vector3();
const projected = { x: 0, y: 0 };
const pose: PortalPose = { x: 0, y: 0, z: 0, scale: 0, opacity: 0, travel: 0 };
