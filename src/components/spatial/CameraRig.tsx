import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useMemo, useRef } from 'react';
import { ENVIRONMENT } from '../../data/environment';
import { cursor, interaction } from '../../systems/interaction/interactionSystem';
import { clamp, damp } from '../../utils/math';

/**
 * The field of view is vertical, so a wide, short laptop display would otherwise
 * leave the arrangement floating in empty margins. Pulling the viewpoint in on
 * wider screens keeps the same composition filling the frame.
 */
const REFERENCE_ASPECT = 1.6;

/**
 * Viewpoint.
 *
 * The camera leans very slightly as the pointer crosses the environment. The
 * motion is small on purpose: enough for near and far surfaces to separate as the
 * user moves, not enough to feel like the scene is swaying. This is the parallax
 * cue that makes the depth read as real rather than drawn.
 *
 * It holds still the moment the pointer lands on something. A viewpoint that keeps
 * moving while you are reaching for a target drags that target out from under you —
 * so NOVA drifts while you are looking around and settles when you act.
 */
export function CameraRig() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const target = useMemo(() => new Vector3(...ENVIRONMENT.camera.target), []);
  const desired = useRef<{ x: number; y: number }>({
    x: ENVIRONMENT.camera.position[0],
    y: ENVIRONMENT.camera.position[1],
  });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const [restX, restY, baseZ] = ENVIRONMENT.camera.position;
    const aspect = size.width / Math.max(size.height, 1);
    const restZ = baseZ * clamp(REFERENCE_ASPECT / aspect, 0.88, 1.06);

    if (!cursor.hoveredId && interaction.pointerPresent) {
      desired.current.x = restX + interaction.pointer.x * ENVIRONMENT.parallax.amountX;
      desired.current.y = restY + interaction.pointer.y * ENVIRONMENT.parallax.amountY;
    } else if (!interaction.pointerPresent) {
      desired.current.x = restX;
      desired.current.y = restY;
    }

    camera.position.x = damp(camera.position.x, desired.current.x, ENVIRONMENT.parallax.damping, dt);
    camera.position.y = damp(camera.position.y, desired.current.y, ENVIRONMENT.parallax.damping, dt);
    camera.position.z = damp(camera.position.z, restZ, ENVIRONMENT.parallax.damping, dt);
    camera.lookAt(target);
  });

  return null;
}
